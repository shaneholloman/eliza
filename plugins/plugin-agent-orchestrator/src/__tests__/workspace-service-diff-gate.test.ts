import { vi } from "vitest";

const { capturePrGateChangeSet } = vi.hoisted(() => ({
  capturePrGateChangeSet: vi.fn(),
}));
vi.mock("../services/workspace-diff.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/workspace-diff.js")>();
  return { ...actual, capturePrGateChangeSet };
});

import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CodingWorkspaceService,
  DiffGateBlockedError,
} from "../services/workspace-service.js";

const workspace = {
  id: "execution-1",
  path: "/tmp/gate-workspace",
  branch: "feature",
  baseBranch: "main",
  isWorktree: false,
  repo: "https://github.com/example/repo.git",
  status: "ready",
} as const;

function harness() {
  const reportError = vi.fn();
  const runtime = {
    getSetting: vi.fn(() => undefined),
    reportError,
  } as unknown as IAgentRuntime;
  const service = new CodingWorkspaceService(runtime);
  const finalize = vi.fn(async () => ({
    number: 42,
    url: "https://example/pr/42",
  }));
  const events: unknown[] = [];
  const internals = service as unknown as {
    workspaceService: { finalize: typeof finalize };
    workspaces: Map<string, typeof workspace>;
  };
  internals.workspaceService = { finalize };
  internals.workspaces.set("workspace-1", workspace);
  service.onEvent((event) => events.push(event));
  return { service, finalize, reportError, events };
}

const options = { title: "Safe change", body: "Body" };

beforeEach(() => capturePrGateChangeSet.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("CodingWorkspaceService.createPR diff-review boundary", () => {
  it("passes a clean complete scan to finalize", async () => {
    capturePrGateChangeSet.mockResolvedValue({
      changedFiles: ["src/safe.ts"],
      diff: "+++ b/src/safe.ts\n+export const safe = true;\n",
      truncated: false,
      filesTruncated: false,
    });
    const { service, finalize, events } = harness();

    await expect(
      service.createPR("workspace-1", options),
    ).resolves.toMatchObject({ number: 42 });
    expect(finalize).toHaveBeenCalledOnce();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "workspace:finalizing",
        data: expect.objectContaining({
          diffGate: expect.objectContaining({ outcome: "passed" }),
        }),
      }),
    );
  });

  it("annotates a warning and still finalizes", async () => {
    capturePrGateChangeSet.mockResolvedValue({
      changedFiles: ["src/large.ts"],
      diff: "+++ b/src/large.ts\n+a\n+b\n+c\n",
      truncated: false,
      filesTruncated: false,
    });
    vi.stubEnv("ELIZA_CODING_DIFF_GATE_OVERSIZE_LINES", "2");
    const { service, finalize } = harness();

    await service.createPR("workspace-1", options);
    expect(finalize).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        pr: expect.objectContaining({
          body: expect.stringContaining("Diff-review gate"),
        }),
      }),
    );
  });

  it.each([
    [
      "secret",
      {
        changedFiles: ["config.ts"],
        diff: "+++ b/config.ts\n+password=not-a-real-secret-value\n",
        truncated: false,
        filesTruncated: false,
      },
    ],
    [
      "truncated diff",
      {
        changedFiles: ["src/a.ts"],
        diff: "+safe\n",
        truncated: true,
        filesTruncated: false,
      },
    ],
    [
      "truncated file list",
      {
        changedFiles: ["src/a.ts"],
        diff: "+safe\n",
        truncated: false,
        filesTruncated: true,
      },
    ],
  ])("blocks %s without finalizing", async (_case, changeSet) => {
    capturePrGateChangeSet.mockResolvedValue(changeSet);
    const { service, finalize, events } = harness();

    await expect(
      service.createPR("workspace-1", options),
    ).rejects.toBeInstanceOf(DiffGateBlockedError);
    expect(finalize).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          diffGate: expect.objectContaining({ outcome: "blocked" }),
        }),
      }),
    );
  });

  it("reports unavailable capture and never finalizes", async () => {
    capturePrGateChangeSet.mockResolvedValue(undefined);
    const { service, finalize, reportError, events } = harness();

    let caught: unknown;
    try {
      await service.createPR("workspace-1", options);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "CODING_DIFF_GATE_CAPTURE_FAILED" });
    expect(finalize).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(events).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          diffGate: expect.objectContaining({ outcome: "capture_failed" }),
        }),
      }),
    );
  });

  it("invalid forbidden-path configuration blocks before finalize", async () => {
    capturePrGateChangeSet.mockResolvedValue({
      changedFiles: ["src/a.ts"],
      diff: "+safe\n",
      truncated: false,
      filesTruncated: false,
    });
    vi.stubEnv("ELIZA_CODING_DIFF_GATE_EXTRA_FORBIDDEN", "[");
    const { service, finalize, reportError } = harness();

    await expect(
      service.createPR("workspace-1", options),
    ).rejects.toMatchObject({
      code: "INVALID_CODING_DIFF_GATE_PATTERN",
    });
    expect(finalize).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
  });
});
