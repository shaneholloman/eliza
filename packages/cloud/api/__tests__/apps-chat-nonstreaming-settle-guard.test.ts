/**
 * Route-level money guard for POST /api/v1/apps/:id/chat non-streaming settle.
 *
 * The non-streaming branch reserves app credits up front, reads the provider
 * JSON response, calculates actual cost, then settles the reservation. If the
 * response fails before settlement starts, the hold must be refunded. If
 * settlement starts and then throws after committing a movement, the route must
 * not issue a second full-hold refund.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

const ORG = "00000000-0000-4000-8000-0000000000aa";
const USER = "00000000-0000-4000-8000-0000000000bb";
const APP_ID = "00000000-0000-4000-8000-0000000000ee";

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mock(async () => ({
    user: { id: USER, organization_id: ORG },
    apiKey: undefined,
  })),
}));

mock.module("@/lib/auth/app-key-scope", () => ({
  isAppKeyOutOfScope: mock(async () => false),
}));

mock.module("@/lib/middleware/rate-limit-hono-cloudflare", () => ({
  RateLimitPresets: { STANDARD: {} },
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

mock.module("@/lib/services/apps", () => ({
  appsService: {
    getById: mock(async () => ({
      id: APP_ID,
      name: "guard-test-app",
      organization_id: ORG,
      monetization_enabled: true,
      platform_offset_amount: 0,
      purchase_share_percentage: 0,
      inference_markup_percentage: 20,
    })),
  },
}));

let calculateCostCalls = 0;
mock.module("@/lib/pricing", () => ({
  calculateCost: mock(async () => {
    calculateCostCalls += 1;
    if (calculateCostCalls === 1) return { totalCost: 0.01 };
    return { totalCost: 0.001 };
  }),
  estimateTokens: (text: string) => Math.max(1, Math.ceil(text.length / 4)),
  getProviderFromModel: () => "openai",
  normalizeModelName: (model: string) => model,
}));

mock.module("@/lib/providers/language-model", () => ({
  canonicalizeCerebrasModelId: (model: string) => model,
  getAiProviderConfigurationError: () => "AI services are not configured",
  hasLanguageModelProviderConfigured: () => true,
  resolveAiProviderSource: () => "openai",
}));

let providerResponseImpl: () => Response = () =>
  Response.json({
    choices: [{ message: { content: "hi there" } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });

mock.module("@/lib/providers", () => ({
  getProviderForModelWithFallback: () => ({
    primary: { chatCompletions: async () => providerResponseImpl() },
    fallback: null,
  }),
  withProviderFallback: async (primary: () => Promise<Response>) => primary(),
}));

class TestInsufficientCreditsError extends Error {
  constructor(
    public readonly required: number,
    public readonly available: number,
    public readonly reason?: string,
  ) {
    super(
      `Insufficient credits. Required: ${required}, available: ${available}`,
    );
  }
}

mock.module("@/lib/services/credits", () => ({
  InsufficientCreditsError: TestInsufficientCreditsError,
}));

mock.module("@/lib/runtime/request-context", () => ({
  getRequestIdempotencyKey: () => "apps-chat-nonstreaming-settle-guard",
}));

const refundCommits: Array<{ amount: number; actualBaseCost: number }> = [];
const reservationCalls: Array<{
  estimatedBaseCost: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}> = [];
const settleCalls: Array<{
  actualBaseCost: number;
}> = [];
let actualSettleThrowsAfterCommit = false;

const reserveInferenceCredits = mock(
  async (args: {
    estimatedBaseCost: number;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }) => {
    reservationCalls.push({
      estimatedBaseCost: args.estimatedBaseCost,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
    });
    return {
      reservedAmount: args.estimatedBaseCost,
      reservationTransactionId: "reservation-1",
      reconcile: async (actualBaseCost: number) => {
        settleCalls.push({ actualBaseCost });
        if (actualBaseCost < args.estimatedBaseCost) {
          refundCommits.push({
            amount: args.estimatedBaseCost - actualBaseCost,
            actualBaseCost,
          });
        }
        if (actualBaseCost !== 0 && actualSettleThrowsAfterCommit) {
          throw new Error("settlement aggregate write failed after movement");
        }
        return {
          reservedAmount: args.estimatedBaseCost,
          actualCost: actualBaseCost,
          reservationTransactionId: "reservation-1",
          settlementTransactionIds: [],
          adjustmentType:
            actualBaseCost < args.estimatedBaseCost ? "refund" : "none",
        };
      },
    };
  },
);

mock.module("@/lib/services/app-credits", () => ({
  appCreditsService: {
    reserveInferenceCredits,
  },
}));

const { default: chatRoute } = await import("../v1/apps/[id]/chat/route");

const app = new Hono();
app.route("/api/v1/apps/:id/chat", chatRoute);

async function postChat(): Promise<Response> {
  return await app.request(`/api/v1/apps/${APP_ID}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    }),
  });
}

beforeEach(() => {
  refundCommits.length = 0;
  reservationCalls.length = 0;
  settleCalls.length = 0;
  reserveInferenceCredits.mockClear();
  calculateCostCalls = 0;
  actualSettleThrowsAfterCommit = false;
  providerResponseImpl = () =>
    Response.json({
      choices: [{ message: { content: "hi there" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
});

describe("non-streaming app-chat settle guard", () => {
  test("provider JSON failure before settle starts refunds the full hold", async () => {
    providerResponseImpl = () =>
      new Response("{not json", {
        headers: { "content-type": "application/json" },
      });

    const response = await postChat();

    expect(response.status).toBe(500);
    expect(reserveInferenceCredits).toHaveBeenCalledTimes(1);
    expect(settleCalls).toEqual([{ actualBaseCost: 0 }]);
    expect(refundCommits).toHaveLength(1);
    expect(reservationCalls[0].idempotencyKey).toBe(
      "apps-chat-nonstreaming-settle-guard",
    );
    expect(reservationCalls[0].metadata).toMatchObject({ streaming: false });
  });

  test("settle throws after committing movement does not full-refund again", async () => {
    actualSettleThrowsAfterCommit = true;

    const response = await postChat();

    expect(response.status).toBe(500);
    expect(reserveInferenceCredits).toHaveBeenCalledTimes(1);
    expect(settleCalls).toEqual([{ actualBaseCost: 0.001 }]);
    expect(refundCommits).toHaveLength(1);
    expect(refundCommits[0].actualBaseCost).toBe(0.001);
    expect(reservationCalls[0].metadata).toMatchObject({ streaming: false });
  });
});
