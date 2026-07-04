/**
 * Tests for internal JWT signing/verification and the `jti` revocation denylist.
 *
 * Covers finding L12 (#12879):
 *  - positive: a freshly minted token verifies within TTL.
 *  - negative: a token whose `jti` is revoked is rejected.
 *  - negative: an expired token is rejected.
 *  - fail-closed: a denylist store error rejects the token (never allow-on-error).
 *  - degradation: with no Redis configured, verification still succeeds
 *    (per-jti revocation unsupported → key-rotation model), and `revoke` throws.
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Generate a real ES256 keypair and expose it the way `jwks.ts` reads it:
// base64-encoded PEM in JWT_SIGNING_PRIVATE_KEY / JWT_SIGNING_PUBLIC_KEY.
function makeKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    priv: Buffer.from(privateKey).toString("base64"),
    pub: Buffer.from(publicKey).toString("base64"),
  };
}

const KEYS = makeKeys();

/** Import the module fresh so cached keys/redis client pick up current env. */
async function loadModule() {
  vi.resetModules();
  return await import("./jwt-internal");
}

describe("internal JWT jti revocation denylist (#12879)", () => {
  beforeEach(() => {
    process.env.JWT_SIGNING_PRIVATE_KEY = KEYS.priv;
    process.env.JWT_SIGNING_PUBLIC_KEY = KEYS.pub;
    process.env.JWT_SIGNING_KEY_ID = "test";
  });

  afterEach(() => {
    delete process.env.JWT_SIGNING_PRIVATE_KEY;
    delete process.env.JWT_SIGNING_PUBLIC_KEY;
    delete process.env.JWT_SIGNING_KEY_ID;
    delete process.env.MOCK_REDIS;
    delete process.env.REDIS_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("with a Redis-backed denylist configured", () => {
    beforeEach(() => {
      process.env.MOCK_REDIS = "1";
    });

    it("verifies a freshly minted token within TTL (positive)", async () => {
      const mod = await loadModule();
      const { access_token } = await mod.signInternalToken({
        subject: "pod-1",
        service: "discord-gateway",
      });

      const result = await mod.verifyInternalToken(access_token);
      expect(result.valid).toBe(true);
      expect(result.payload.sub).toBe("pod-1");
      expect(result.payload.service).toBe("discord-gateway");
      expect(typeof result.payload.jti).toBe("string");
    });

    it("rejects a token after its jti is revoked (negative)", async () => {
      const mod = await loadModule();
      const { access_token } = await mod.signInternalToken({ subject: "pod-2" });

      // Sanity: valid before revocation.
      const before = await mod.verifyInternalToken(access_token);
      expect(before.valid).toBe(true);

      // Revoke by jti, then verify must reject.
      const { payload } = before;
      await mod.revokeInternalToken(payload.jti, payload.exp);

      await expect(mod.verifyInternalToken(access_token)).rejects.toThrow(/revoked/i);
    });

    it("does not revoke unrelated tokens (revocation is per-jti)", async () => {
      const mod = await loadModule();
      const a = await mod.signInternalToken({ subject: "pod-a" });
      const b = await mod.signInternalToken({ subject: "pod-b" });

      const va = await mod.verifyInternalToken(a.access_token);
      await mod.revokeInternalToken(va.payload.jti, va.payload.exp);

      // a is revoked, b is untouched.
      await expect(mod.verifyInternalToken(a.access_token)).rejects.toThrow(/revoked/i);
      const vb = await mod.verifyInternalToken(b.access_token);
      expect(vb.valid).toBe(true);
    });

    it("rejects an expired token (negative)", async () => {
      const mod = await loadModule();
      // Mint a token, then advance the system clock past its exp. jose reads
      // the wall clock for exp validation, so fake timers move it forward.
      vi.useFakeTimers();
      try {
        const { access_token } = await mod.signInternalToken({
          subject: "pod-exp",
          expiresIn: 1,
        });

        // Jump well past exp (+ jose's default clock tolerance).
        vi.advanceTimersByTime(120_000);

        await expect(mod.verifyInternalToken(access_token)).rejects.toThrow(/exp/i);
      } finally {
        vi.useRealTimers();
      }
    });

    it("fails closed when the denylist store errors (never allow-on-error)", async () => {
      // Force the underlying Redis GET to throw. The denylist read is
      // intentionally un-try/catch'd, so the error propagates through
      // verifyInternalToken and the token is rejected (never allowed).
      // `vi.doMock` is NOT hoisted and applies to the dynamic imports that
      // follow, surviving the `vi.resetModules()` inside loadModule().
      const throwingGet = vi.fn().mockRejectedValue(new Error("redis unavailable"));
      vi.doMock("../cache/redis-factory", async () => {
        const actual =
          await vi.importActual<typeof import("../cache/redis-factory")>("../cache/redis-factory");
        return {
          ...actual,
          buildRedisClient: () =>
            ({
              get: throwingGet,
              set: vi.fn().mockResolvedValue("OK"),
            }) as unknown as ReturnType<typeof actual.buildRedisClient>,
        };
      });

      try {
        const mod = await loadModule();
        const { access_token } = await mod.signInternalToken({
          subject: "pod-err",
        });

        await expect(mod.verifyInternalToken(access_token)).rejects.toThrow(/redis unavailable/i);
        expect(throwingGet).toHaveBeenCalled();
      } finally {
        vi.doUnmock("../cache/redis-factory");
      }
    });
  });

  describe("with no Redis backend configured (revocation unsupported)", () => {
    beforeEach(() => {
      // Ensure no redis creds are present.
      delete process.env.MOCK_REDIS;
      delete process.env.REDIS_URL;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
    });

    it("still verifies valid tokens (key-rotation + TTL model)", async () => {
      const mod = await loadModule();
      const { access_token } = await mod.signInternalToken({ subject: "pod-nr" });
      const result = await mod.verifyInternalToken(access_token);
      expect(result.valid).toBe(true);
    });

    it("reports the denylist as not configured", async () => {
      const mod = await loadModule();
      expect(mod.isDenylistConfigured()).toBe(false);
    });

    it("revokeInternalToken throws so callers know it did not take effect", async () => {
      const mod = await loadModule();
      await expect(mod.revokeInternalToken("some-jti", undefined)).rejects.toThrow(
        /no Redis backend configured/i,
      );
    });
  });
});
