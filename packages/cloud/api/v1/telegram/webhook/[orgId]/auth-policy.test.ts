/**
 * Telegram webhook auth policy for local development (#12878 L4).
 *
 * A missing per-org webhook secret used to allow unverified development
 * deliveries implicitly. The route now defaults closed; local tunnel testing
 * must opt in with TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED_DEV=1.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

mock.module("@/lib/services/telegram-automation", () => ({
  telegramAutomationService: {
    getWebhookSecret: mock(async () => null),
    getBotToken: mock(async () => null),
  },
}));

mock.module("@/lib/services/telegram-automation/app-automation", () => ({
  telegramAppAutomationService: {
    getAppsWithActiveAutomation: mock(async () => []),
  },
}));

mock.module("@/db/repositories/telegram-chats", () => ({
  telegramChatsRepository: {
    findByChatId: mock(async () => null),
    upsert: mock(async () => undefined),
    delete: mock(async () => undefined),
  },
}));

mock.module("@/lib/services/agent-gateway-router", () => ({
  agentGatewayRouterService: {
    routePhoneMessage: mock(async () => ({ handled: false })),
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    debug: mock(() => undefined),
    error: mock(() => undefined),
    info: mock(() => undefined),
    warn: mock(() => undefined),
  },
}));

const { default: route } = await import("./route");

function delivery() {
  const app = new Hono();
  app.route("/:orgId", route);
  return app.fetch(
    new Request("https://api.example.test/org-1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 1,
        message: { chat: { id: 1, type: "private" } },
      }),
    }),
  );
}

describe("Telegram webhook auth policy", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    delete process.env.TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED_DEV;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED_DEV;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  test("ignores unverified development webhooks by default", async () => {
    const response = await delivery();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "not_configured",
    });
  });

  test("explicit local-dev opt-in reaches bot-token resolution", async () => {
    process.env.TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED_DEV = "1";

    const response = await delivery();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Bot not configured",
    });
  });
});
