import { describe, expect, test } from "bun:test";
import { plugin } from "./plugin";
import { ClaudeCodeSubAgentService } from "./sub-agent-service";

describe("plugin-sub-agent-claude-code compatibility exports", () => {
  test("re-exports the remote sub-agent plugin descriptor", () => {
    expect(plugin.name).toBe("@elizaos/plugin-sub-agent-claude-code");
    expect(plugin.services?.[0]?.serviceType).toBe("sub-agent.claude-code");
  });

  test("re-exports the host-callable service class", () => {
    expect(ClaudeCodeSubAgentService.serviceType).toBe("sub-agent.claude-code");
    expect(ClaudeCodeSubAgentService.rpcMethods).toContain("createSession");
    expect(ClaudeCodeSubAgentService.rpcMethods).toContain("terminate");
  });
});
