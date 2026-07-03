import { describe, expect, it } from "bun:test";
import {
  buildConnectorCta,
  CONFIRM_TTL_MS,
  confirmationPrompt,
  pendingExpired,
  readStructuredConfirmation,
} from "../src/safety.ts";

const TARGET = {
  name: "Acme Bot",
  id: "11111111-2222-3333-4444-555555555555",
  aliases: ["acme-bot"],
};

describe("readStructuredConfirmation", () => {
  it("accepts only structured boolean-ish confirmation fields", () => {
    expect(readStructuredConfirmation({ confirm: true })).toBe(true);
    expect(readStructuredConfirmation({ confirm: false })).toBe(false);
    expect(readStructuredConfirmation({ confirmed: "1" })).toBe(true);
    expect(readStructuredConfirmation({ confirm: "0" })).toBe(false);
  });

  it("reads the confirmation from the real planner path (options.parameters)", () => {
    // The runtime nests validated action parameters under options.parameters
    // (execute-planned-tool-call.ts). Reading only the top level made confirm
    // invisible on every real turn, so the destructive action could never fire.
    expect(readStructuredConfirmation({ parameters: { confirm: true } })).toBe(
      true,
    );
    expect(readStructuredConfirmation({ parameters: { confirm: false } })).toBe(
      false,
    );
    expect(readStructuredConfirmation({ parameters: { confirmed: "1" } })).toBe(
      true,
    );
    expect(readStructuredConfirmation({ parameters: {} })).toBe(null);
    // The nested (planner-extracted) value is authoritative over any top-level.
    expect(
      readStructuredConfirmation({
        parameters: { confirm: false },
        confirm: true,
      }),
    ).toBe(false);
    // Prose is still never treated as confirmation, even when nested.
    expect(readStructuredConfirmation({ parameters: { confirm: "yes" } })).toBe(
      null,
    );
  });

  it("does not infer confirmation from user prose", () => {
    expect(readStructuredConfirmation(undefined)).toBe(null);
    expect(readStructuredConfirmation({ text: "yes delete Acme Bot" })).toBe(
      null,
    );
    expect(readStructuredConfirmation({ confirm: "yes" })).toBe(null);
    expect(
      readStructuredConfirmation({ confirm: "delete Acme Bot — yes" }),
    ).toBe(null);
  });
});

describe("confirmationPrompt", () => {
  it("names the target, what is destroyed, and the exact token", () => {
    const prompt = confirmationPrompt(TARGET, [
      "its running container",
      "its tenant database",
    ]);
    expect(prompt).toContain("Acme Bot");
    expect(prompt).toContain(TARGET.id);
    expect(prompt).toContain("its running container");
    expect(prompt).toContain("its tenant database");
    expect(prompt.toLowerCase()).toContain("can't be undone");
    expect(prompt).toContain("confirm delete Acme Bot");
  });
});

describe("buildConnectorCta", () => {
  it("builds a neutral {label,url,kind} for an https URL", () => {
    const cta = buildConnectorCta(
      "Withdraw",
      "https://x.test/withdraw",
      "button",
    );
    expect(cta).toEqual({
      label: "Withdraw",
      url: "https://x.test/withdraw",
      kind: "button",
    });
  });

  it("rejects non-http(s) URLs (no creds/money smuggling)", () => {
    expect(() => buildConnectorCta("x", "javascript:alert(1)")).toThrow();
    expect(() => buildConnectorCta("x", "not a url")).toThrow();
  });
});

describe("pendingExpired (shared confirm TTL)", () => {
  const base = {
    taskId: "task-1",
    metadata: {
      roomId: "room-1",
      action: "BOOK_INFLUENCER" as const,
      appId: "inf_1",
      appName: "Nova",
      amount: 200,
    },
  };

  it("a fresh pending is not expired", () => {
    const pending = {
      ...base,
      metadata: {
        ...base.metadata,
        intentCreatedAt: new Date().toISOString(),
      },
    };
    expect(pendingExpired(pending)).toBe(false);
  });

  it("a pending older than CONFIRM_TTL_MS is expired", () => {
    const pending = {
      ...base,
      metadata: {
        ...base.metadata,
        intentCreatedAt: new Date(
          Date.now() - CONFIRM_TTL_MS - 1000,
        ).toISOString(),
      },
    };
    expect(pendingExpired(pending)).toBe(true);
  });

  it("a pending with no/invalid intentCreatedAt never expires (no timestamp to age)", () => {
    expect(pendingExpired(base)).toBe(false);
    expect(
      pendingExpired({
        ...base,
        metadata: { ...base.metadata, intentCreatedAt: "not-a-date" },
      }),
    ).toBe(false);
  });

  it("a BUY_APP_DOMAIN recovery retry never expires (no new charge at stake)", () => {
    const pending = {
      ...base,
      metadata: {
        ...base.metadata,
        action: "BUY_APP_DOMAIN" as const,
        recovery: true,
        intentCreatedAt: new Date(
          Date.now() - CONFIRM_TTL_MS * 10,
        ).toISOString(),
      },
    };
    expect(pendingExpired(pending)).toBe(false);
  });
});
