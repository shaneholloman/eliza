/**
 * LINEAR_PROJECTS context provider: injects up to 10 active (started/planned)
 * Linear projects from LinearService into the prompt. Gated to the
 * automation/connectors contexts and ADMIN role, cached per agent.
 */
import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import type { Project } from "@linear/sdk";
import type { LinearService } from "../services/linear";

export const linearProjectsProvider: Provider = {
  name: "LINEAR_PROJECTS",
  description: "Provides context about active Linear projects",
  descriptionCompressed: "provide context active Linear project",
  dynamic: true,
  contexts: ["automation", "connectors"],
  contextGate: { anyOf: ["automation", "connectors"] },
  cacheScope: "agent",
  roleGate: { minRole: "ADMIN" },
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    try {
      const linearService = runtime.getService<LinearService>("linear");
      if (!linearService) {
        return {
          text: "Linear service is not available",
        };
      }

      const projects = await linearService.getProjects();

      if (projects.length === 0) {
        return {
          text: "No Linear projects found",
        };
      }

      const activeProjects = projects.filter(
        (project: Project) => project.state === "started" || project.state === "planned"
      );

      const projectsList = activeProjects
        .slice(0, 10)
        .map(
          (project: Project) =>
            `- ${project.name}: ${project.state} (${project.startDate || "No start date"} - ${project.targetDate || "No target date"})`
        );

      const text = `Active Linear Projects:\n${projectsList.join("\n")}`;

      return {
        text,
        data: {
          projects: activeProjects.slice(0, 10).map((project: Project) => ({
            id: project.id,
            name: project.name,
            state: project.state,
          })),
        },
      };
    } catch (error) {
      // error-policy:J4 explicit user-facing degrade — a Linear API/auth/network
      // failure renders the distinguishable "error" prompt state (never a
      // fabricated "no projects found"), and reportError makes the underlying
      // failure observable in RECENT_ERRORS + owner-escalation instead of being
      // silently swallowed.
      runtime.reportError?.("LINEAR_PROJECTS.provider", error);
      return {
        text: "Error retrieving Linear projects",
      };
    }
  },
};
