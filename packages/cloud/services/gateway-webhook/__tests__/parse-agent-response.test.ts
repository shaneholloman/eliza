import { describe, expect, test } from "bun:test";
import { parseAgentResponse } from "../src/server-router";

const AGENT_ID = "agent-123";

describe("parseAgentResponse", () => {
  test("returns the response string from a well-formed body", () => {
    const raw = JSON.stringify({ response: "hello there" });
    expect(parseAgentResponse(raw, AGENT_ID)).toBe("hello there");
  });

  test("preserves an intentional empty-string reply", () => {
    // An explicit empty string is a valid (if unusual) agent reply and must
    // NOT be treated as a failure — only a missing/non-string field is slop.
    const raw = JSON.stringify({ response: "" });
    expect(parseAgentResponse(raw, AGENT_ID)).toBe("");
  });

  test("throws on non-JSON body instead of returning success-shaped output", () => {
    expect(() =>
      parseAgentResponse("<html>502 Bad Gateway</html>", AGENT_ID),
    ).toThrow(/non-JSON response/);
  });

  test("throws when the response field is missing", () => {
    const raw = JSON.stringify({ ok: true, data: { foo: "bar" } });
    expect(() => parseAgentResponse(raw, AGENT_ID)).toThrow(
      /missing string "response" field/,
    );
  });

  test("throws when response is null", () => {
    const raw = JSON.stringify({ response: null });
    expect(() => parseAgentResponse(raw, AGENT_ID)).toThrow(
      /missing string "response" field \(got object\)/,
    );
  });

  test("throws when response is a non-string (number)", () => {
    const raw = JSON.stringify({ response: 42 });
    expect(() => parseAgentResponse(raw, AGENT_ID)).toThrow(
      /missing string "response" field \(got number\)/,
    );
  });

  test("throws when the top-level body is a JSON null", () => {
    expect(() => parseAgentResponse("null", AGENT_ID)).toThrow(
      /missing string "response" field/,
    );
  });

  test("includes the agentId in the error for observability", () => {
    expect(() => parseAgentResponse("{}", AGENT_ID)).toThrow(AGENT_ID);
  });
});
