/**
 * Exercises the real Hono middleware against Cloudflare-shaped Rate Limiting
 * bindings. Redis is not mocked: a bound request must never reach that path.
 */

import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { rateLimit } from "./rate-limit-hono-cloudflare";

interface FakeBinding {
  calls: string[];
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

function binding(outcome: boolean | Error): FakeBinding {
  const calls: string[] = [];
  return {
    calls,
    async limit({ key }) {
      calls.push(key);
      if (outcome instanceof Error) throw outcome;
      return { success: outcome };
    },
  };
}

function appWith(bindingName: string, key = "caller") {
  const app = new Hono();
  app.use(
    rateLimit(
      {
        windowMs: 60_000,
        maxRequests: 200,
        keyGenerator: () => key,
      },
      { bindingName },
    ),
  );
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

describe("Cloudflare Rate Limiting binding middleware", () => {
  test("allows through one native counter call and advertises the policy", async () => {
    const limiter = binding(true);
    const response = await appWith("LIMITER", "api-key-hash").fetch(
      new Request("https://api.example.test/"),
      { NODE_ENV: "production", LIMITER: limiter },
    );

    expect(response.status).toBe(200);
    expect(limiter.calls).toEqual(["api-key-hash"]);
    expect(response.headers.get("X-RateLimit-Policy")).toBe("cloudflare-native");
    // The binding returns allow/deny only, so do not invent an exact reset time.
    expect(response.headers.get("X-RateLimit-Reset")).toBeNull();
  });

  test("returns the existing 429 shape when the native binding denies", async () => {
    const limiter = binding(false);
    const response = await appWith("LIMITER").fetch(new Request("https://api.example.test/"), {
      NODE_ENV: "production",
      LIMITER: limiter,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("X-RateLimit-Reset")).toBeNull();
    expect(await response.json()).toMatchObject({
      success: false,
      code: "rate_limit_exceeded",
      retryAfter: 60,
    });
  });

  test("fails closed when a production binding is missing", async () => {
    const response = await appWith("LIMITER").fetch(new Request("https://api.example.test/"), {
      NODE_ENV: "production",
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "rate_limit_unavailable",
    });
  });

  test("fails closed when the platform binding throws", async () => {
    const limiter = binding(new Error("binding unavailable"));
    const response = await appWith("LIMITER").fetch(new Request("https://api.example.test/"), {
      NODE_ENV: "production",
      LIMITER: limiter,
    });

    expect(response.status).toBe(503);
    expect(limiter.calls).toEqual(["caller"]);
  });
});
