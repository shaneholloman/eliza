/**
 * Beacon ingest route — real Hono route, mocked apps-service seam.
 * Pins boundary validation of the #11349 visitor/session analytics ids:
 * well-formed ids persist into pageview metadata, garbage never does.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import * as realApps from "@/lib/services/apps";
import type { AppEnv } from "@/types/cloud-worker-env";

const APP_ID = "99999999-9999-4999-8999-000000000001";
const ENV = { NODE_ENV: "test" } as unknown as AppEnv["Bindings"];

const trackPageView = mock(async () => {});
const getById = mock(async (id: string) =>
  id === APP_ID ? { id: APP_ID, is_active: true } : null,
);

mock.module("@/lib/services/apps", () => ({
  ...realApps,
  appsService: {
    getById,
    trackPageView,
  },
}));

const route = (await import("../v1/track/pageview/route")).default;

function buildApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/v1/track/pageview", route);
  return app;
}

function post(body: Record<string, unknown>) {
  return buildApp().request(
    "/api/v1/track/pageview",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    ENV,
  );
}

describe("track pageview beacon ingest (#11349)", () => {
  beforeEach(() => {
    trackPageView.mockClear();
    getById.mockClear();
  });

  test("persists well-formed visitor/session ids into pageview metadata", async () => {
    const res = await post({
      app_id: APP_ID,
      page_url: "/pricing",
      visitor_id: "visitor-abc123",
      session_id: "11111111-2222-4333-8444-555555555555",
    });

    expect(res.status).toBe(200);
    expect(trackPageView).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        metadata: expect.objectContaining({
          visitor_id: "visitor-abc123",
          session_id: "11111111-2222-4333-8444-555555555555",
        }),
      }),
    );
  });

  test("drops oversized, unsafe, or non-string analytics ids at the boundary", async () => {
    const res = await post({
      app_id: APP_ID,
      page_url: "/",
      visitor_id: "x".repeat(4096),
      session_id: { nested: "object" },
    });

    expect(res.status).toBe(200);
    expect(trackPageView).toHaveBeenCalledTimes(1);
    const metadata = (
      trackPageView.mock.calls[0] as unknown as [
        string,
        { metadata: Record<string, unknown> },
      ]
    )[1].metadata;
    expect(metadata.visitor_id).toBeUndefined();
    expect(metadata.session_id).toBeUndefined();
  });

  test("rejects a script-breakout style id instead of persisting it", async () => {
    const res = await post({
      app_id: APP_ID,
      page_url: "/",
      visitor_id: "</script><script>alert(1)</script>",
      session_id: "session-ok-123",
    });

    expect(res.status).toBe(200);
    const metadata = (
      trackPageView.mock.calls[0] as unknown as [
        string,
        { metadata: Record<string, unknown> },
      ]
    )[1].metadata;
    expect(metadata.visitor_id).toBeUndefined();
    expect(metadata.session_id).toBe("session-ok-123");
  });
});
