/**
 * Unit + property tests (fast-check) for Matrix multi-account resolution
 * (`accounts.ts`) against an in-memory `getSetting` stub — no homeserver.
 */
import { ElizaError, type IAgentRuntime } from "@elizaos/core";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MATRIX_ACCOUNT_ID,
  listMatrixAccountIds,
  normalizeMatrixAccountId,
  readMatrixAccountId,
  resolveDefaultMatrixAccountId,
  resolveMatrixAccountSettings,
} from "../accounts.js";

function runtimeWithSettings(
  settings: Record<string, string | null | undefined>,
  characterSettings: Record<string, unknown> = {}
): IAgentRuntime {
  return {
    getSetting: vi.fn((key: string) => settings[key] ?? null),
    character: { settings: characterSettings },
  } as unknown as IAgentRuntime;
}

describe("Matrix account settings", () => {
  it("fails closed for malformed MATRIX_ACCOUNTS JSON", () => {
    const runtime = runtimeWithSettings({
      MATRIX_ACCOUNTS: "{not-json",
      MATRIX_HOMESERVER: "https://matrix.example",
      MATRIX_USER_ID: "@bot:example",
      MATRIX_ACCESS_TOKEN: " token ",
    });

    expect(() => listMatrixAccountIds(runtime)).toThrow(ElizaError);
    try {
      resolveDefaultMatrixAccountId(runtime);
      throw new Error("expected malformed MATRIX_ACCOUNTS to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ElizaError);
      expect((error as ElizaError).code).toBe("MATRIX_CONFIG_INVALID");
      expect((error as ElizaError).context).toEqual({
        setting: "MATRIX_ACCOUNTS",
      });
      expect((error as ElizaError).severity).toBe("fatal");
      expect((error as Error).cause).toBeInstanceOf(SyntaxError);
    }
  });

  it("normalizes array account config IDs and ignores malformed entries", () => {
    const runtime = runtimeWithSettings({
      MATRIX_ACCOUNTS: JSON.stringify([
        { id: " work ", homeserver: "https://work", userId: "@work:example", accessToken: "w" },
        null,
        "bad",
        { accountId: "", homeserver: "https://fallback", userId: "@bot:example", accessToken: "d" },
      ]),
    });

    expect(listMatrixAccountIds(runtime)).toEqual(["default", "work"]);
    expect(resolveMatrixAccountSettings(runtime, "work")).toMatchObject({
      accountId: "work",
      homeserver: "https://work",
      userId: "@work:example",
      accessToken: "w",
    });
  });

  it("reads account IDs only from non-empty string fields across payload shapes", () => {
    expect(
      readMatrixAccountId(
        { accountId: " " },
        { parameters: { accountId: "\tpersonal\n" } },
        { data: { matrix: { accountId: "ignored" } } }
      )
    ).toBe("personal");

    expect(readMatrixAccountId({ data: { matrix: { accountId: " work " } } })).toBe("work");
    expect(readMatrixAccountId({ metadata: { accountId: 7 } })).toBeUndefined();
  });

  it("normalizes arbitrary account IDs without returning blanks", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 80 }), fc.integer(), fc.constant(null)), (id) => {
        const normalized = normalizeMatrixAccountId(id);
        expect(normalized).not.toBe("");
        if (typeof id === "string" && id.trim()) {
          expect(normalized).toBe(id.trim());
        } else {
          expect(normalized).toBe(DEFAULT_MATRIX_ACCOUNT_ID);
        }
      })
    );
  });
});
