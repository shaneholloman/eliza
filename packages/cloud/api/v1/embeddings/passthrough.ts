/**
 * OpenAI-native embeddings pass-through for the cloud inference gateway.
 *
 * The route owns auth, rate limiting, request validation, and credit admission;
 * this helper only replaces the AI-SDK embedding call for requests that can be
 * represented as a plain OpenAI-compatible JSON forward. It returns either the
 * upstream JSON body and usage tokens for the existing settlement chain, a
 * structured error response after releasing the hold, or null to let the route
 * fall back to the SDK path.
 */

import { resolvePassthroughEmbeddingsUpstreamForModel } from "@/lib/providers/language-model";
import { isPassthroughEmbeddingsEnabled } from "@/lib/services/inference-passthrough";
import { logger } from "@/lib/utils/logger";

export interface EmbeddingsPassthroughRequest {
  input: string | string[];
  model: string;
  encoding_format?: "float" | "base64";
  dimensions?: number;
  user?: string;
}

export type EmbeddingsReservationSettler = (
  actualCost: number,
) => Promise<unknown>;

export type EmbeddingsPassthroughResult =
  | {
      kind: "success";
      bodyText: string;
      contentType: string;
      actualTokens: number;
    }
  | { kind: "response"; response: Response }
  | null;

function mapPassthroughEmbeddingsStatus(status: number): number {
  if (status === 400 || status === 402 || status === 404 || status === 429) {
    return status;
  }
  return 503;
}

function passthroughEmbeddingsErrorResponse(
  status: number,
  message: string,
): Response {
  return Response.json(
    {
      error: {
        message,
        type: status === 429 ? "rate_limit_error" : "service_unavailable",
        code: status === 429 ? "rate_limit_exceeded" : "provider_error",
      },
    },
    { status },
  );
}

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // error-policy:J3 untrusted upstream JSON parse; invalid JSON becomes an explicit provider error response, never a fake-success embedding payload.
    return null;
  }
}

function extractPromptTokens(
  body: Record<string, unknown>,
  fallback: number,
): number {
  const usage =
    body.usage && typeof body.usage === "object"
      ? (body.usage as Record<string, unknown>)
      : null;
  const promptTokens = usage?.prompt_tokens;
  if (typeof promptTokens === "number" && Number.isFinite(promptTokens)) {
    return promptTokens;
  }
  const totalTokens = usage?.total_tokens;
  if (typeof totalTokens === "number" && Number.isFinite(totalTokens)) {
    return totalTokens;
  }
  return fallback;
}

export async function tryPassthroughEmbeddingsRequest(params: {
  model: string;
  request: EmbeddingsPassthroughRequest;
  estimatedInputTokens: number;
  settleReservation: EmbeddingsReservationSettler;
  abortSignal: AbortSignal | undefined;
}): Promise<EmbeddingsPassthroughResult> {
  if (!isPassthroughEmbeddingsEnabled()) return null;
  const upstream = resolvePassthroughEmbeddingsUpstreamForModel(params.model);
  if (!upstream) return null;

  const upstreamBody = {
    ...params.request,
    model: upstream.modelId,
  };

  let response: Response;
  try {
    response = await fetch(upstream.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstream.apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
      ...(params.abortSignal ? { signal: params.abortSignal } : {}),
    });
  } catch (error) {
    // error-policy:J1 route helper boundary — transport failures release the reservation and become an explicit provider-error HTTP response.
    await params.settleReservation(0);
    logger.error("[Embeddings] Passthrough upstream fetch failed", {
      model: params.model,
      provider: upstream.providerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      kind: "response",
      response: passthroughEmbeddingsErrorResponse(
        503,
        "upstream provider request failed",
      ),
    };
  }

  const bodyText = await response.text();
  if (!response.ok) {
    await params.settleReservation(0);
    const status = mapPassthroughEmbeddingsStatus(response.status);
    let message = "upstream provider error";
    if (status !== 503) {
      const upstreamMessage = parseObject(bodyText)?.error;
      message =
        upstreamMessage &&
        typeof upstreamMessage === "object" &&
        typeof (upstreamMessage as Record<string, unknown>).message === "string"
          ? String((upstreamMessage as Record<string, unknown>).message)
          : `upstream provider returned ${response.status}`;
    }
    logger.error("[Embeddings] Passthrough upstream error status", {
      model: params.model,
      provider: upstream.providerId,
      upstreamStatus: response.status,
      mappedStatus: status,
    });
    return {
      kind: "response",
      response: passthroughEmbeddingsErrorResponse(status, message),
    };
  }

  const parsed = parseObject(bodyText);
  if (!parsed) {
    await params.settleReservation(0);
    logger.error("[Embeddings] Passthrough upstream returned invalid JSON", {
      model: params.model,
      provider: upstream.providerId,
    });
    return {
      kind: "response",
      response: passthroughEmbeddingsErrorResponse(
        503,
        "upstream provider returned invalid JSON",
      ),
    };
  }

  return {
    kind: "success",
    bodyText,
    contentType: response.headers.get("Content-Type") ?? "application/json",
    actualTokens: extractPromptTokens(parsed, params.estimatedInputTokens),
  };
}

export const __embeddingsPassthroughTestHooks = {
  mapPassthroughEmbeddingsStatus,
};
