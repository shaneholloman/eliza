// @vitest-environment jsdom

/**
 * Regression for #15310 failure mode #3: the shared→dedicated handoff branch
 * in `bindCloudAgent` was gated on `selectedAgent.created`, so a re-login that
 * REUSED an existing shared agent (`created:false` — e.g. after a failed first
 * run) never re-entered the upgrade path. The user stayed permanently on the
 * shared adapter with the provisioning tile showing.
 *
 * Contract under test:
 *   - created:true                     → handoff fires (unchanged)
 *   - created:false, no pending marker → handoff fires (the fix)
 *   - created:false, marker present    → handoff does NOT fire here —
 *     resumePendingCloudHandoff owns an interrupted-but-live handoff (it
 *     verifies the target and re-arms a fresh create itself when the target is
 *     dead); double-firing would provision a second dedicated agent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePendingCloudHandoff } from "../cloud/handoff/pending-handoff-store";
import type { FirstRunProfileDraft } from "./first-run";
import type { FirstRunFinishPorts } from "./first-run-finish";
import { bindCloudAgent } from "./first-run-finish";

const SHARED_AGENT_BASE =
  "https://staging.elizacloud.ai/api/v1/eliza/agents/cad3c071";

const clientMock = vi.hoisted(() => ({
  selectOrProvisionCloudAgent: vi.fn(),
  submitFirstRun: vi.fn(async () => {}),
  setBaseUrl: vi.fn(),
  setToken: vi.fn(),
  getBaseUrl: vi.fn(() => ""),
  createCloudCompatAgent: vi.fn(),
  startCloudAgentHandoff: vi.fn(),
  deleteSharedBridgeAgent: vi.fn(async () => ({ success: true })),
}));

const runCloudAgentHandoffMock = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({ client: clientMock }));

vi.mock("../cloud/handoff/run-cloud-agent-handoff", () => ({
  runCloudAgentHandoff: runCloudAgentHandoffMock,
}));

vi.mock("../config/boot-config", () => ({
  getBootConfig: () => ({
    cloudApiBase: "https://staging.elizacloud.ai",
    preferSharedCloudTier: true,
  }),
}));

vi.mock("../state", () => ({
  addAgentProfile: vi.fn(() => ({ id: "profile-1" })),
  createPersistedActiveServer: vi.fn((v) => ({ label: "Eliza Cloud", ...v })),
  loadPersistedActiveServer: vi.fn(() => null),
  removeAgentProfile: vi.fn(),
  savePersistedActiveServer: vi.fn(),
}));

vi.mock("./mobile-runtime-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mobile-runtime-mode")>()),
  persistMobileRuntimeModeForServerTarget: vi.fn(),
}));

function draft(): FirstRunProfileDraft {
  return {
    agentName: "Eliza",
    runtime: "cloud",
    localInference: "cloud-inference",
    remoteApiBase: "",
    remoteToken: "",
  };
}

function ports(): FirstRunFinishPorts {
  return {
    uiLanguage: "en",
    elizaCloudConnected: true,
    handleCloudLogin: vi.fn(async () => {}),
    setRuntimeState: vi.fn(),
    setTab: vi.fn(),
    completeFirstRun: vi.fn(),
    onStatus: vi.fn(),
  };
}

function mockSelection(created: boolean): void {
  clientMock.selectOrProvisionCloudAgent.mockResolvedValue({
    agentId: "cad3c071",
    apiBase: SHARED_AGENT_BASE,
    requiresAgentPairing: false,
    created,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("shared→dedicated handoff firing on shared-agent completion", () => {
  it("fires for a newly created shared agent (unchanged behavior)", async () => {
    mockSelection(true);
    const outcome = await bindCloudAgent(draft(), "steward-token", {}, ports());
    expect(outcome.kind).toBe("done");
    expect(runCloudAgentHandoffMock).toHaveBeenCalledTimes(1);
  });

  it("fires for a REUSED shared agent with no pending marker (#15310 #3)", async () => {
    mockSelection(false);
    const outcome = await bindCloudAgent(draft(), "steward-token", {}, ports());
    expect(outcome.kind).toBe("done");
    expect(runCloudAgentHandoffMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire for a reused shared agent when a pending marker exists (resume path owns it)", async () => {
    savePendingCloudHandoff({
      sharedAgentId: "cad3c071",
      dedicatedAgentId: "dedicated-1",
      sharedApiBase: SHARED_AGENT_BASE,
      cloudApiBase: "https://staging.elizacloud.ai",
      startedAt: Date.now(),
    });
    mockSelection(false);
    const outcome = await bindCloudAgent(draft(), "steward-token", {}, ports());
    expect(outcome.kind).toBe("done");
    expect(runCloudAgentHandoffMock).not.toHaveBeenCalled();
  });
});
