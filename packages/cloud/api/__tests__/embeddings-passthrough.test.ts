/**
 * Pass-through fast path for POST /api/v1/embeddings (#15512).
 *
 * Tests the route-adjacent forwarder directly with real env-based upstream
 * resolution. The route suites import the full embeddings route separately;
 * this file avoids module mocks so it cannot poison their billing/auth mocks in
 * Bun's shared test module registry.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const realFetch = globalThis.fetch;
const savedEnv = {
  INFERENCE_PASSTHROUGH_EMBEDDINGS:
    process.env.INFERENCE_PASSTHROUGH_EMBEDDINGS,
  INFERENCE_PASSTHROUGH_EMBEDDINGS_TEST:
    process.env.INFERENCE_PASSTHROUGH_EMBEDDINGS_TEST,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
};

const { tryPassthroughEmbeddingsRequest, __embeddingsPassthroughTestHooks } =
  await import("../v1/embeddings/passthrough");

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function enablePassthroughEnv() {
  process.env.INFERENCE_PASSTHROUGH_EMBEDDINGS = "true";
  process.env.INFERENCE_PASSTHROUGH_EMBEDDINGS_TEST = "true";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_BASE_URL = "https://api.openai.test/v1";
}

beforeEach(() => {
  restoreEnv();
  globalThis.fetch = realFetch;
});

afterEach(() => {
  restoreEnv();
  globalThis.fetch = realFetch;
});

describe("embeddings pass-through forwarder", () => {
  test("returns upstream JSON and extracts prompt_tokens for billing", async () => {
    enablePassthroughEnv();
    const fetchMock = mock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const upstreamBody = {
      object: "list",
      data: [{ object: "embedding", embedding: [0.25, -0.75, 1], index: 0 }],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 7, total_tokens: 7 },
    };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const settleReservation = mock();

    const result = await tryPassthroughEmbeddingsRequest({
      model: "openai/text-embedding-3-small",
      request: { model: "openai/text-embedding-3-small", input: "hello" },
      estimatedInputTokens: 2,
      settleReservation,
      abortSignal: undefined,
    });

    expect(result).toEqual({
      kind: "success",
      bodyText: JSON.stringify(upstreamBody),
      contentType: "application/json",
      actualTokens: 7,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "text-embedding-3-small",
      input: "hello",
    });
    expect(settleReservation).not.toHaveBeenCalled();
  });

  test("upstream errors release the hold and return a structured error response", async () => {
    enablePassthroughEnv();
    const fetchMock = mock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { message: "rate limited upstream" } },
        { status: 429 },
      ),
    );
    const settleReservation = mock(async () => undefined);

    const result = await tryPassthroughEmbeddingsRequest({
      model: "text-embedding-3-small",
      request: { model: "text-embedding-3-small", input: "hello" },
      estimatedInputTokens: 2,
      settleReservation,
      abortSignal: undefined,
    });

    expect(result?.kind).toBe("response");
    if (result?.kind !== "response") throw new Error("expected response");
    expect(result.response.status).toBe(429);
    expect(await result.response.json()).toMatchObject({
      error: { message: "rate limited upstream" },
    });
    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith(0);
  });

  test("flag-off and unresolved upstream fall through to the SDK path", async () => {
    process.env.INFERENCE_PASSTHROUGH_EMBEDDINGS = "false";
    process.env.INFERENCE_PASSTHROUGH_EMBEDDINGS_TEST = "true";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.test/v1";
    await expect(
      tryPassthroughEmbeddingsRequest({
        model: "text-embedding-3-small",
        request: { model: "text-embedding-3-small", input: "hello" },
        estimatedInputTokens: 2,
        settleReservation: mock(),
        abortSignal: undefined,
      }),
    ).resolves.toBeNull();

    process.env.INFERENCE_PASSTHROUGH_EMBEDDINGS = "true";
    process.env.INFERENCE_PASSTHROUGH_EMBEDDINGS_TEST = "true";
    delete process.env.OPENAI_API_KEY;
    await expect(
      tryPassthroughEmbeddingsRequest({
        model: "text-embedding-3-small",
        request: { model: "text-embedding-3-small", input: "hello" },
        estimatedInputTokens: 2,
        settleReservation: mock(),
        abortSignal: undefined,
      }),
    ).resolves.toBeNull();
  });

  test("status mapper keeps caller-fault statuses and hides provider auth/server failures", () => {
    const { mapPassthroughEmbeddingsStatus } = __embeddingsPassthroughTestHooks;
    expect(mapPassthroughEmbeddingsStatus(400)).toBe(400);
    expect(mapPassthroughEmbeddingsStatus(402)).toBe(402);
    expect(mapPassthroughEmbeddingsStatus(404)).toBe(404);
    expect(mapPassthroughEmbeddingsStatus(429)).toBe(429);
    expect(mapPassthroughEmbeddingsStatus(401)).toBe(503);
    expect(mapPassthroughEmbeddingsStatus(403)).toBe(503);
    expect(mapPassthroughEmbeddingsStatus(500)).toBe(503);
  });
});
