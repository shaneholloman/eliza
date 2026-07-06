/**
 * Unit tests for the structural model-error classifiers: `isModelProviderError`
 * (gates the planner-loop post-tool relay) and `modelProviderErrorStatus`.
 * Deterministic — plain constructed error shapes, no live model.
 */
import { describe, expect, it } from "vitest";
import { isModelProviderError, modelProviderErrorStatus } from "./model-errors";

function withStatus(status: number, message = "err"): Error {
	const err = new Error(message) as Error & { statusCode: number };
	err.statusCode = status;
	return err;
}

describe("modelProviderErrorStatus", () => {
	it("reads statusCode off the error", () => {
		expect(modelProviderErrorStatus(withStatus(400))).toBe(400);
	});

	it("reads a legacy `.status` field", () => {
		const err = new Error("boom") as Error & { status: number };
		err.status = 503;
		expect(modelProviderErrorStatus(err)).toBe(503);
	});

	it("unwraps the AI SDK RetryError `.lastError` envelope", () => {
		const retry = new Error("retries exhausted") as Error & {
			lastError: unknown;
		};
		retry.lastError = withStatus(429);
		expect(modelProviderErrorStatus(retry)).toBe(429);
	});

	it("unwraps a `.cause`-wrapped provider error (plugin-anthropic shape)", () => {
		const wrapped = new Error("[Anthropic] evaluate failed: bad request", {
			cause: withStatus(400),
		});
		expect(modelProviderErrorStatus(wrapped)).toBe(400);
	});

	it("returns undefined when no status is carried", () => {
		expect(modelProviderErrorStatus(new Error("plain"))).toBeUndefined();
		expect(modelProviderErrorStatus(new TypeError("bug"))).toBeUndefined();
	});
});

describe("isModelProviderError", () => {
	it("is true for provider HTTP errors (400/401/404/429/5xx)", () => {
		for (const status of [400, 401, 403, 404, 413, 429, 500, 502, 503, 529]) {
			expect(isModelProviderError(withStatus(status))).toBe(true);
		}
	});

	it("is true for a retry-envelope-wrapped provider error", () => {
		const retry = new Error("retries exhausted") as Error & {
			errors: unknown[];
		};
		retry.errors = [withStatus(500)];
		expect(isModelProviderError(retry)).toBe(true);
	});

	it("is true for network/transport errors (structural `.code`)", () => {
		const econnreset = new Error("socket hang up") as Error & { code: string };
		econnreset.code = "ECONNRESET";
		expect(isModelProviderError(econnreset)).toBe(true);

		const fetchFailed = new Error("fetch failed", {
			cause: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
		});
		expect(isModelProviderError(fetchFailed)).toBe(true);
	});

	it("is FALSE for programmer errors (TypeError with no status/code)", () => {
		expect(isModelProviderError(new TypeError("x is undefined"))).toBe(false);
		expect(isModelProviderError(new Error("something odd"))).toBe(false);
	});

	it("is FALSE for a schema-validation error shape (errors: string[])", () => {
		// SchemaValidationFailedError carries `errors: string[]` of validation
		// messages — those strings must not be mistaken for wrapped provider errors.
		const schemaErr = new Error("schema validation failed") as Error & {
			name: string;
			errors: string[];
		};
		schemaErr.name = "SchemaValidationFailedError";
		schemaErr.errors = ["expected object, got string", "429 appears in text"];
		expect(isModelProviderError(schemaErr)).toBe(false);
	});

	it("is FALSE for a sub-400 status", () => {
		expect(isModelProviderError(withStatus(200))).toBe(false);
	});
});
