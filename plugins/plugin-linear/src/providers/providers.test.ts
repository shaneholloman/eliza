/**
 * Failure-path tests for the four Linear context providers.
 *
 * Guards #12744 (#12275-G fallback-slop sweep): a Linear API/auth/network
 * failure inside a provider `get()` must (a) render the designed J4
 * user-facing "Error retrieving …" degrade state — never a fabricated
 * "no X found" success shape — and (b) surface the underlying error through
 * `runtime.reportError` so the failure is observable in RECENT_ERRORS /
 * owner-escalation instead of being silently swallowed.
 */
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { linearActivityProvider } from "./activity";
import { linearIssuesProvider } from "./issues";
import { linearProjectsProvider } from "./projects";
import { linearTeamsProvider } from "./teams";

const message = { id: "m", content: { text: "" } } as unknown as Memory;
const state = {} as State;

function runtimeWith(
  service: Record<string, unknown> | undefined,
  reportError = vi.fn()
): IAgentRuntime {
  return {
    getService: vi.fn((name: string) => (name === "linear" ? service : undefined)),
    reportError,
  } as unknown as IAgentRuntime;
}

const cases = [
  {
    label: "LINEAR_ISSUES",
    provider: linearIssuesProvider,
    method: "searchIssues",
    scope: "LINEAR_ISSUES.provider",
    degradeText: "Error retrieving Linear issues",
    emptyText: "No recent Linear issues found",
    successService: () => ({ searchIssues: vi.fn(async () => []) }),
  },
  {
    label: "LINEAR_TEAMS",
    provider: linearTeamsProvider,
    method: "getTeams",
    scope: "LINEAR_TEAMS.provider",
    degradeText: "Error retrieving Linear teams",
    emptyText: "No Linear teams found",
    successService: () => ({ getTeams: vi.fn(async () => []) }),
  },
  {
    label: "LINEAR_PROJECTS",
    provider: linearProjectsProvider,
    method: "getProjects",
    scope: "LINEAR_PROJECTS.provider",
    degradeText: "Error retrieving Linear projects",
    emptyText: "No Linear projects found",
    successService: () => ({ getProjects: vi.fn(async () => []) }),
  },
  {
    label: "LINEAR_ACTIVITY",
    provider: linearActivityProvider,
    method: "getActivityLog",
    scope: "LINEAR_ACTIVITY.provider",
    degradeText: "Error retrieving Linear activity",
    emptyText: "No recent Linear activity",
    successService: () => ({ getActivityLog: vi.fn(() => []) }),
  },
] as const;

describe("Linear providers — failure-path observability", () => {
  for (const c of cases) {
    describe(c.label, () => {
      it("reports the error and renders the J4 degrade state on service failure", async () => {
        const boom = new Error("Linear API 503");
        const reportError = vi.fn();
        const service = {
          [c.method]: vi.fn(() => {
            throw boom;
          }),
        };
        const runtime = runtimeWith(service, reportError);

        const result = await c.provider.get(runtime, message, state);

        // J4: distinguishable error state, NOT a fabricated "no X found".
        expect(result.text).toBe(c.degradeText);
        expect(result.text).not.toBe(c.emptyText);

        // Observability: the real error is surfaced with the provider scope.
        expect(reportError).toHaveBeenCalledTimes(1);
        expect(reportError).toHaveBeenCalledWith(c.scope, boom);
      });

      it("does not call reportError on the empty (designed-absence) path", async () => {
        const reportError = vi.fn();
        const runtime = runtimeWith(c.successService(), reportError);

        const result = await c.provider.get(runtime, message, state);

        expect(result.text).toBe(c.emptyText);
        expect(reportError).not.toHaveBeenCalled();
      });

      it("returns the service-unavailable state without reporting when the service is missing", async () => {
        const reportError = vi.fn();
        const runtime = runtimeWith(undefined, reportError);

        const result = await c.provider.get(runtime, message, state);

        expect(result.text).toBe("Linear service is not available");
        expect(reportError).not.toHaveBeenCalled();
      });
    });
  }
});
