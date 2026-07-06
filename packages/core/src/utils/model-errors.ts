/**
 * Classifies model-call errors as transient (worth retrying) by scanning the
 * error message for known rate-limit, overload, timeout, and 5xx signatures.
 * Retry logic around model invocations consumes this to decide whether to back
 * off and try again versus surface the failure.
 */
const TRANSIENT_MODEL_ERROR_PATTERNS = [
	"service temporarily unavailable",
	"temporarily unavailable",
	"rate limit",
	"too many requests",
	"overloaded",
	"socket connection was closed unexpectedly",
	"econnreset",
	"econnrefused",
	"etimedout",
	"timeout",
	"timed out",
	"529",
	"503",
	"502",
	"504",
];

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function isTransientModelError(error: unknown): boolean {
	const message = getErrorMessage(error).toLowerCase();
	return TRANSIENT_MODEL_ERROR_PATTERNS.some((pattern) =>
		message.includes(pattern),
	);
}

// Node/undici surface these on `error.code` (or `error.cause.code`) when a
// request never reaches an HTTP response — the transport failed. Structural
// signal, so we never guess a network failure from message text.
const NETWORK_ERROR_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"ECONNABORTED",
	"EPIPE",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
	"UND_ERR_SOCKET",
]);

// Walk the bounded error graph a provider failure can arrive wrapped in: the
// `.cause` chain (plugin-anthropic re-wraps the AI SDK `APICallError` in a
// message-carrying Error and preserves the original on `.cause`) and the AI SDK
// `RetryError` envelope (`.lastError` / `.errors[]`, populated once retries
// exhaust). Only OBJECT nodes are traversed — `SchemaValidationFailedError`
// carries an `errors: string[]` of validation messages, and those strings must
// not be mistaken for wrapped provider errors.
function* modelErrorChain(error: unknown): Generator<object> {
	const seen = new Set<unknown>();
	const stack: unknown[] = [error];
	while (stack.length > 0 && seen.size < 12) {
		const node = stack.pop();
		if (typeof node !== "object" || node === null || seen.has(node)) continue;
		seen.add(node);
		yield node;
		const c = node as {
			cause?: unknown;
			lastError?: unknown;
			errors?: unknown;
		};
		if (c.cause !== undefined) stack.push(c.cause);
		if (c.lastError !== undefined) stack.push(c.lastError);
		if (Array.isArray(c.errors)) {
			for (const e of c.errors) stack.push(e);
		}
	}
}

function readHttpStatus(node: object): number | undefined {
	const raw =
		(node as { statusCode?: unknown; status?: unknown }).statusCode ??
		(node as { status?: unknown }).status;
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	if (typeof raw === "string") {
		const n = Number(raw);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return undefined;
}

/**
 * HTTP status carried by a model/provider error, or undefined when the error
 * carries none. Mirrors the canonical structural signal in
 * `services/message/fallback-reply.ts`: the AI SDK records the upstream status
 * on `APICallError.statusCode` (a `RetryError` wraps it on `.lastError` /
 * `.errors` once retries exhaust); legacy OpenAI-style SDK errors expose
 * `.status`. Read the status, never scan the message text.
 */
export function modelProviderErrorStatus(error: unknown): number | undefined {
	for (const node of modelErrorChain(error)) {
		const status = readHttpStatus(node);
		if (status !== undefined) return status;
	}
	return undefined;
}

/**
 * True when a thrown model-call error is an EXPECTED provider/transport failure
 * — the provider returned an HTTP error status (>= 400) or the request failed
 * at the network layer — as opposed to a programmer or schema-validation error
 * (`TypeError`, `SchemaValidationFailedError`) that indicates a real bug and
 * must propagate. Purely structural: HTTP status and network error codes, never
 * a message-substring guess. Used to gate the planner-loop's post-tool
 * evaluator relay so a transient provider failure degrades to an already
 * completed tool's truthful output while genuine bugs still surface.
 */
export function isModelProviderError(error: unknown): boolean {
	for (const node of modelErrorChain(error)) {
		const status = readHttpStatus(node);
		if (typeof status === "number" && status >= 400) return true;
		const code = (node as { code?: unknown }).code;
		if (typeof code === "string" && NETWORK_ERROR_CODES.has(code)) return true;
	}
	return false;
}
