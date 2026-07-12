/**
 * Application-shell contracts for middleware that must wrap every generated
 * route. The generated router is intentionally replaced with an empty mount:
 * these tests exercise bootstrap ordering, not the hundreds of route modules.
 */

import { expect, mock, test } from "bun:test";

const mountRoutes = mock(() => {});
mock.module("./_router.generated", () => ({ mountRoutes }));

const { createApp } = await import("./bootstrap-app");

function environment(limiter: {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}) {
  return {
    ENVIRONMENT: "staging",
    NODE_ENV: "production",
    REDIS_RATE_LIMITING: "false",
    GLOBAL_RATE_LIMITER: limiter,
  } as never;
}

test("the global native limiter rejects before auth and generated routes", async () => {
  const keys: string[] = [];
  const app = createApp();
  const response = await app.fetch(
    new Request("https://api.example.test/private/generated-route", {
      headers: { "cf-connecting-ip": "203.0.113.8" },
    }),
    environment({
      async limit({ key }) {
        keys.push(key);
        return { success: false };
      },
    }),
  );

  expect(mountRoutes).toHaveBeenCalledTimes(1);
  expect(keys).toEqual(["global:ip:203.0.113.8"]);
  expect(response.status).toBe(429);
  expect(response.headers.get("X-RateLimit-Policy")).toBe("cloudflare-native");
  expect(await response.json()).toMatchObject({
    code: "rate_limit_exceeded",
    retryAfter: 60,
  });
});

test("an allowed native decision preserves public locale routing", async () => {
  const keys: string[] = [];
  const app = createApp();
  const response = await app.fetch(
    new Request("https://api.example.test/api/i18n/locale", {
      headers: {
        "accept-language": "fr;q=0.8, ja;q=0.9",
        "cf-connecting-ip": "203.0.113.9",
      },
    }),
    environment({
      async limit({ key }) {
        keys.push(key);
        return { success: true };
      },
    }),
  );

  expect(keys).toEqual(["global:ip:203.0.113.9"]);
  expect(response.status).toBe(200);
  expect(response.headers.get("X-RateLimit-Policy")).toBe("cloudflare-native");
  const body = (await response.json()) as { language: string | null };
  expect(body).toEqual({ language: "ja" });
});
