/**
 * Regression tests for the deduct-before-throwable-prep money leak in the
 * telegram/discord/twitter app-automation generators (#11685).
 *
 * The bug: `generateAnnouncement` / `generateReply` / `generateAppTweet`
 * charged credits FIRST, then awaited `getCharacterPromptContext` (a DB read)
 * BEFORE entering the refunding try block around `generateText`. A throw in
 * that deduct→fetch window (DB error/timeout on the character lookup)
 * propagated out with the charge committed and no refund — and these run on
 * schedulers/auto-reply loops, so a transient DB failure leaked a post-cost
 * per invocation.
 *
 * The fix hoists all throwable prep above the deduction, so these tests pin:
 * when the character-context fetch rejects, `deductCredits` is NEVER called
 * (no charge for a generation that never ran). Each test also asserts the
 * rejection is the context error itself — proving the context fetch (the
 * armed hazard) is what fired, not some earlier failure.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.DATABASE_URL ||= "pglite://memory";
process.env.NODE_ENV ||= "test";

interface RecordedCall {
  organizationId: string;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
}

const deductCalls: RecordedCall[] = [];
const refundCalls: RecordedCall[] = [];

mock.module("../credits", () => ({
  creditsService: {
    deductCredits: async (params: RecordedCall) => {
      deductCalls.push(params);
      return { success: true, newBalance: 100, transaction: null };
    },
    refundCredits: async (params: RecordedCall) => {
      refundCalls.push(params);
      return { transaction: {}, newBalance: 100 };
    },
  },
}));

const CONTEXT_DB_ERROR = "character context DB read failed";

mock.module("../character-prompt-helper", () => ({
  getCharacterPromptContext: async () => {
    throw new Error(CONTEXT_DB_ERROR);
  },
  buildCharacterSystemPrompt: () => "IN CHARACTER",
}));

const { telegramAppAutomationService } = await import("../telegram-automation/app-automation");
const { discordAppAutomationService } = await import("../discord-automation/app-automation");
const { twitterAppAutomationService } = await import("../twitter-automation/app-automation");

const ORG_ID = "00000000-0000-4000-8000-00000000b001";

/** Minimal app fixture: only the fields the generators read. */
function makeApp(
  automationField: string,
): Parameters<typeof telegramAppAutomationService.generateAnnouncement>[1] {
  return {
    id: "00000000-0000-4000-8000-00000000b002",
    name: "Test App",
    description: "An app under test",
    app_url: "https://test-app.example",
    website_url: "https://test-app.example",
    [automationField]: { enabled: true, agentCharacterId: "char-under-test" },
  } as unknown as Parameters<typeof telegramAppAutomationService.generateAnnouncement>[1];
}

beforeEach(() => {
  deductCalls.length = 0;
  refundCalls.length = 0;
});

describe("app-automation generators never charge before throwable prep (#11685)", () => {
  test("telegram generateAnnouncement: context fetch rejects -> no deduction taken", async () => {
    await expect(
      telegramAppAutomationService.generateAnnouncement(ORG_ID, makeApp("telegram_automation")),
    ).rejects.toThrow(CONTEXT_DB_ERROR);

    expect(deductCalls).toHaveLength(0);
    expect(refundCalls).toHaveLength(0);
  });

  test("telegram generateReply: context fetch rejects -> no deduction taken", async () => {
    await expect(
      telegramAppAutomationService.generateReply(
        ORG_ID,
        makeApp("telegram_automation"),
        "what does this app do?",
        "tester",
      ),
    ).rejects.toThrow(CONTEXT_DB_ERROR);

    expect(deductCalls).toHaveLength(0);
    expect(refundCalls).toHaveLength(0);
  });

  test("discord generateAnnouncement: context fetch rejects -> no deduction taken", async () => {
    await expect(
      discordAppAutomationService.generateAnnouncement(ORG_ID, makeApp("discord_automation")),
    ).rejects.toThrow(CONTEXT_DB_ERROR);

    expect(deductCalls).toHaveLength(0);
    expect(refundCalls).toHaveLength(0);
  });

  test("twitter generateAppTweet: context fetch rejects -> no deduction taken", async () => {
    await expect(
      twitterAppAutomationService.generateAppTweet(
        ORG_ID,
        makeApp("twitter_automation"),
        "promotional",
      ),
    ).rejects.toThrow(CONTEXT_DB_ERROR);

    expect(deductCalls).toHaveLength(0);
    expect(refundCalls).toHaveLength(0);
  });
});
