/**
 * Money-leak guard for POST /api/v1/apps/:id/chat streaming (#10837).
 *
 * A streaming app-chat reserves credits up front, forwards the whole provider
 * response, closes the writer, and only THEN runs calculateCost +
 * reconcileCredits. Before this fix, if that post-stream accounting threw (a
 * transient DB/pricing error), the catch unconditionally full-refunded — free
 * inference, systemically so across concurrent streams during a DB blip.
 *
 * This drives the REAL `reconcileChatSettleError` (the exact code the route
 * runs) against a spy credit service, asserting the refund decision.
 */
import { describe, expect, mock, test } from "bun:test";
import {
  type ChatSettleCredits,
  reconcileChatSettleError,
} from "../v1/apps/[id]/chat/stream-refund";

function makeCredits() {
  const calls: Array<Parameters<ChatSettleCredits["reconcileCredits"]>[0]> = [];
  const reconcileCredits = mock(
    async (args: Parameters<ChatSettleCredits["reconcileCredits"]>[0]) => {
      calls.push(args);
      return null;
    },
  );
  return { calls, reconcileCredits } satisfies {
    calls: Array<Parameters<ChatSettleCredits["reconcileCredits"]>[0]>;
    reconcileCredits: ChatSettleCredits["reconcileCredits"];
  };
}

const base = {
  appId: "app-1",
  userId: "user-1",
  reservedBaseCost: 0.05,
  errorMessage: "transient pg timeout",
};

const streamRefund = {
  skipRefundLog:
    "[App Chat] Post-stream accounting failed AFTER full delivery; keeping reserved charge (NOT refunding)",
  refundLog:
    "[App Chat] Stream processing failed before delivery, refunding reserved",
  refundDescription: "Refund due to stream error",
  refundMetadata: { error: true, streaming: true },
};

const nonStreamingRefund = {
  skipRefundLog:
    "[App Chat] Non-streaming throw at/after the settle reconcile; NOT refunding (movement may have committed - sweep recovers a stranded hold)",
  refundLog:
    "[App Chat] Non-streaming settle never started after debit; refunding reserved hold (#11169)",
  refundDescription: "Chat refund (non-streaming settle failed): gpt-4o-mini",
  refundMetadata: {
    error: true,
    streaming: false,
    model: "gpt-4o-mini",
    provider: "openai",
    billingSource: "gateway",
    refundReason: "non_streaming_settle_error",
  },
};

describe("reconcileChatSettleError (#10837, #11169)", () => {
  test("stream COMPLETED then accounting threw → keep the reserved charge, NO refund", async () => {
    const credits = makeCredits();
    const result = await reconcileChatSettleError(
      { ...base, ...streamRefund, skipRefund: true },
      credits,
    );
    expect(result.refunded).toBe(false);
    expect(credits.reconcileCredits).not.toHaveBeenCalled();
    expect(credits.calls).toEqual([]);
  });

  test("stream FAILED before delivery → full refund (actualBaseCost 0)", async () => {
    const credits = makeCredits();
    const result = await reconcileChatSettleError(
      { ...base, ...streamRefund, skipRefund: false },
      credits,
    );
    expect(result.refunded).toBe(true);
    expect(credits.reconcileCredits).toHaveBeenCalledTimes(1);
    expect(credits.calls[0]).toMatchObject({
      appId: "app-1",
      userId: "user-1",
      estimatedBaseCost: 0.05,
      actualBaseCost: 0,
      description: "Refund due to stream error",
      metadata: { error: true, streaming: true },
    });
  });

  test("DB blip across 20 concurrent COMPLETED streams issues ZERO refunds (systemic-leak guard)", async () => {
    const credits = makeCredits();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        reconcileChatSettleError(
          { ...base, ...streamRefund, userId: `user-${i}`, skipRefund: true },
          credits,
        ),
      ),
    );
    expect(results.every((r) => r.refunded === false)).toBe(true);
    expect(credits.reconcileCredits).not.toHaveBeenCalled();
  });

  test("mixed batch: only the pre-delivery failures are refunded", async () => {
    const credits = makeCredits();
    await Promise.all([
      reconcileChatSettleError(
        { ...base, ...streamRefund, skipRefund: true },
        credits,
      ),
      reconcileChatSettleError(
        { ...base, ...streamRefund, skipRefund: false },
        credits,
      ),
      reconcileChatSettleError(
        { ...base, ...streamRefund, skipRefund: true },
        credits,
      ),
      reconcileChatSettleError(
        { ...base, ...streamRefund, skipRefund: false },
        credits,
      ),
    ]);
    // 2 delivered (no refund) + 2 pre-delivery failures (refund) = exactly 2 refunds.
    expect(credits.reconcileCredits).toHaveBeenCalledTimes(2);
    expect(credits.calls.every((c) => c.actualBaseCost === 0)).toBe(true);
  });

  test("non-streaming failure before settle starts → full refund with ledger tags", async () => {
    const credits = makeCredits();
    const result = await reconcileChatSettleError(
      { ...base, ...nonStreamingRefund, skipRefund: false },
      credits,
    );

    expect(result.refunded).toBe(true);
    expect(credits.reconcileCredits).toHaveBeenCalledTimes(1);
    expect(credits.calls[0]).toMatchObject({
      appId: "app-1",
      userId: "user-1",
      estimatedBaseCost: 0.05,
      actualBaseCost: 0,
      description: "Chat refund (non-streaming settle failed): gpt-4o-mini",
      metadata: nonStreamingRefund.refundMetadata,
    });
  });

  test("non-streaming failure after settle starts → no second refund", async () => {
    const credits = makeCredits();
    const result = await reconcileChatSettleError(
      { ...base, ...nonStreamingRefund, skipRefund: true },
      credits,
    );

    expect(result.refunded).toBe(false);
    expect(credits.reconcileCredits).not.toHaveBeenCalled();
    expect(credits.calls).toEqual([]);
  });
});
