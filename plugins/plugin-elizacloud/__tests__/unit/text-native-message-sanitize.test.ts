/**
 * Offline unit coverage for the native `/chat/completions` message sanitizer
 * (`buildNativeMessages` → `sanitizeNativeMessages` in `src/models/text.ts`).
 *
 * The Cloud gateway strictly enforces OpenAI tool-call linkage: a `role:"tool"`
 * message is rejected with a whole-request 400 (`invalid_request_error`) unless a
 * directly-preceding assistant message declared the matching id in its
 * `tool_calls`, and an unanswered assistant `tool_calls` 500s "Tool result is
 * missing". Runtime-rendered history routinely carries bare tool-result messages
 * (no `tool_call_id`, no preceding assistant `tool_calls`) — the live cause of
 * the 400 that broke every tool-using turn. The sanitizer must downgrade unpaired
 * tool messages to `user` and strip unanswered assistant `tool_calls`, while
 * leaving well-formed pairs untouched. The fetch is mocked to capture the
 * outgoing `messages` array (same technique as
 * `text-cerebras-response-format.test.ts`).
 */
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateNativeChatCompletion } from "../../src/models/text";

type RuntimeFixture = Pick<IAgentRuntime, "character" | "emitEvent" | "getSetting"> &
  Partial<IAgentRuntime>;

function runtime(): IAgentRuntime {
  const settings: Record<string, string | undefined> = {
    ELIZAOS_CLOUD_API_KEY: "eliza_test_key",
  };
  const fixture: RuntimeFixture = {
    character: { name: "Eliza", bio: [] },
    getSetting: (key: string) => settings[key],
    emitEvent: vi.fn(),
  };
  return fixture as IAgentRuntime;
}

function cannedResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

async function captureMessages(
  messages: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  let captured: Array<Record<string, unknown>> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === "string") {
        const body = JSON.parse(init.body) as { messages?: Array<Record<string, unknown>> };
        captured = body.messages ?? [];
      }
      return cannedResponse();
    }
  );

  await generateNativeChatCompletion(runtime(), "TEXT_SMALL", { prompt: "hi", messages } as never, {
    modelName: "zai-glm-4.7",
    prompt: "hi",
  });

  return captured;
}

describe("native /chat/completions message sanitizer (offline)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downgrades an orphaned tool message (no preceding assistant tool_calls) to a user message", async () => {
    const out = await captureMessages([
      { role: "system", content: "sys" },
      { role: "user", content: "what's the weather?" },
      { role: "assistant", content: "let me check" },
      { role: "tool", content: "sunny, 24C" },
    ]);

    const last = out[out.length - 1];
    expect(last.role).toBe("user");
    expect(last.tool_call_id).toBeUndefined();
    expect(last.content).toBe("[tool result] sunny, 24C");
    // No stray tool-role message survives to trip the gateway.
    expect(out.some((m) => m.role === "tool")).toBe(false);
  });

  it("downgrades a tool message whose tool_call_id has no matching assistant tool_call", async () => {
    const out = await captureMessages([
      { role: "user", content: "weather?" },
      { role: "assistant", content: "checking" },
      { role: "tool", tool_call_id: "call_x", content: "sunny" },
    ]);

    const last = out[out.length - 1];
    expect(last.role).toBe("user");
    expect(last.tool_call_id).toBeUndefined();
    expect(last.content).toBe("[tool result] sunny");
  });

  it("preserves a well-formed assistant tool_calls -> tool pair untouched", async () => {
    const assistant = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "getW", arguments: "{}" } }],
    };
    const out = await captureMessages([
      { role: "user", content: "weather?" },
      assistant,
      { role: "tool", tool_call_id: "call_1", content: "sunny" },
    ]);

    const asst = out.find((m) => m.role === "assistant");
    expect(asst?.tool_calls).toEqual(assistant.tool_calls);
    const tool = out.find((m) => m.role === "tool");
    expect(tool).toBeDefined();
    expect(tool?.tool_call_id).toBe("call_1");
  });

  it("strips tool_calls from an assistant message whose calls go unanswered", async () => {
    const out = await captureMessages([
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: "on it",
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "getW", arguments: "{}" } },
        ],
      },
      { role: "user", content: "still there?" },
    ]);

    const asst = out.find((m) => m.content === "on it");
    expect(asst?.role).toBe("assistant");
    expect(asst?.tool_calls).toBeUndefined();
  });

  it("downgrades matched tool messages too when an assistant is only partially answered", async () => {
    const out = await captureMessages([
      { role: "user", content: "weather and stocks?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_weather", type: "function", function: { name: "getW", arguments: "{}" } },
          { id: "call_stock", type: "function", function: { name: "getS", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call_weather", content: "sunny" },
      { role: "user", content: "continue" },
    ]);

    const asst = out.find((m) => m.role === "assistant");
    expect(asst?.tool_calls).toBeUndefined();
    const downgraded = out.find((m) => m.content === "[tool result] sunny");
    expect(downgraded?.role).toBe("user");
    expect(downgraded?.tool_call_id).toBeUndefined();
    expect(out.some((m) => m.role === "tool")).toBe(false);
  });
});
