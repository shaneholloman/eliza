/**
 * Guards the hot-plugin-lifecycle safety of the component override policy
 * (#12658). The explicit `override: true` contract is honored on the DIRECT
 * host/core registration path, but is intentionally downgraded to deterministic
 * first-wins across `registerPlugin` boundaries: an override replaces the
 * incumbent in place, while plugin teardown (unloadPlugin / reloadPlugin /
 * failed-registration rollback) removes owned components by reference and does
 * NOT restore a displaced incumbent. Allowing a plugin override would therefore
 * let one plugin destructively strip another plugin's action/provider/evaluator
 * on unload. These tests pin the safe behavior. No model or database.
 */
import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../runtime";
import type { Action, ActionResult } from "../types";
import type { Plugin } from "../types/plugin";

function makeAction(name: string, tag: string, override?: boolean): Action {
	return {
		name,
		description: tag,
		validate: async () => true,
		handler: async (): Promise<ActionResult> => ({ success: true, text: tag }),
		examples: [],
		...(override ? { override: true } : {}),
	};
}

describe("plugin component override lifecycle safety (#12658)", () => {
	it("downgrades a plugin's override:true to first-wins (does not displace another plugin's action)", async () => {
		const runtime = new AgentRuntime({ logLevel: "fatal" });

		const base: Plugin = {
			name: "base-plugin",
			description: "Registers the incumbent action",
			actions: [makeAction("SHARED_ACTION", "incumbent")],
		};
		const overrider: Plugin = {
			name: "override-plugin",
			description: "Attempts to supersede across a plugin boundary",
			actions: [makeAction("SHARED_ACTION", "override", true)],
		};

		await runtime.registerPlugin(base);
		await runtime.registerPlugin(overrider);

		// Plugin-boundary override is downgraded: the incumbent is kept.
		const active = runtime.actions.filter((a) => a.name === "SHARED_ACTION");
		expect(active).toHaveLength(1);
		expect(active[0]?.description).toBe("incumbent");

		// The overriding plugin does NOT own the incumbent, and unloading it must
		// leave base-plugin's action intact (no destructive teardown).
		const ownedByOverrider = runtime
			.getPluginOwnership("override-plugin")
			?.actions.map((a) => a.name);
		expect(ownedByOverrider ?? []).not.toContain("SHARED_ACTION");

		await runtime.unloadPlugin("override-plugin");
		expect(
			runtime.actions.some(
				(a) => a.name === "SHARED_ACTION" && a.description === "incumbent",
			),
		).toBe(true);
	});

	it("does NOT attribute the incumbent to a plugin whose undeclared duplicate was skipped", async () => {
		const runtime = new AgentRuntime({ logLevel: "fatal" });

		const base: Plugin = {
			name: "base-plugin",
			description: "Registers the incumbent action",
			actions: [makeAction("DUP_ACTION", "incumbent")],
		};
		const collider: Plugin = {
			name: "collider-plugin",
			description: "Undeclared duplicate — should be skipped, not owned",
			actions: [makeAction("DUP_ACTION", "loser")],
		};

		await runtime.registerPlugin(base);
		await runtime.registerPlugin(collider);

		const active = runtime.actions.filter((a) => a.name === "DUP_ACTION");
		expect(active).toHaveLength(1);
		expect(active[0]?.description).toBe("incumbent");

		const ownedByCollider = runtime
			.getPluginOwnership("collider-plugin")
			?.actions.map((a) => a.name);
		expect(ownedByCollider ?? []).not.toContain("DUP_ACTION");

		await runtime.unloadPlugin("collider-plugin");
		expect(runtime.actions.some((a) => a.name === "DUP_ACTION")).toBe(true);
	});
});
