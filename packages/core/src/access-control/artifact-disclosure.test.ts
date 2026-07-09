/**
 * Unit contract for the role-aware artifact disclosure decision (#14778):
 * the OWNER/ADMIN-full / USER-grant-driven / fail-closed matrix and the
 * untrusted grant parser. Pure functions, no harness.
 */
import { describe, expect, it } from "vitest";
import type { AccessContext, Memory, UUID } from "../types";
import {
	artifactDisclosureRecordFromMemory,
	parseArtifactShareGrants,
	resolveArtifactDisclosure,
	resolveArtifactDisclosureForMemory,
	selectDisclosedArtifactUrl,
} from "./artifact-disclosure";

const AGENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UUID;
const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UUID;
const VIEWER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as UUID;
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as UUID;

const typedShareMemory: Pick<Memory, "entityId" | "metadata"> = {
	entityId: OTHER,
	metadata: {
		type: "message",
		scope: "owner-private",
		share: {
			grants: [{ entityId: VIEWER, mode: "redacted" }],
		},
	},
};

const ctx = (over: Partial<AccessContext> = {}): AccessContext => ({
	requesterEntityId: VIEWER,
	...over,
});

describe("resolveArtifactDisclosure", () => {
	it("no access context (single-owner local boundary) → full", () => {
		expect(
			resolveArtifactDisclosure({ scope: "owner-private" }, undefined, AGENT),
		).toBe("full");
	});

	it("agent self-read → full", () => {
		expect(
			resolveArtifactDisclosure(
				{ scope: "owner-private" },
				ctx({ requesterEntityId: AGENT }),
				AGENT,
			),
		).toBe("full");
	});

	it("OWNER and ADMIN rank → full regardless of scope or grants", () => {
		for (const c of [
			ctx({ role: "OWNER", isOwner: true }),
			ctx({ role: "ADMIN" }),
		]) {
			expect(
				resolveArtifactDisclosure({ scope: "owner-private" }, c, AGENT),
			).toBe("full");
		}
	});

	it("USER with a full grant → full even on owner-private scope", () => {
		expect(
			resolveArtifactDisclosure(
				{
					scope: "owner-private",
					scopedEntityId: OWNER,
					grants: [{ entityId: VIEWER, mode: "full" }],
				},
				ctx({ role: "USER" }),
				AGENT,
			),
		).toBe("full");
	});

	it("USER with a redacted grant → redacted", () => {
		expect(
			resolveArtifactDisclosure(
				{
					scope: "owner-private",
					scopedEntityId: OWNER,
					grants: [{ entityId: VIEWER, mode: "redacted" }],
				},
				ctx({ role: "USER" }),
				AGENT,
			),
		).toBe("redacted");
	});

	it("a redacted grant narrows the viewer even when scope is global", () => {
		expect(
			resolveArtifactDisclosure(
				{
					scope: "global",
					grants: [{ entityId: VIEWER, mode: "redacted" }],
				},
				ctx({ role: "USER" }),
				AGENT,
			),
		).toBe("redacted");
	});

	it("someone else's grant does not disclose to this viewer", () => {
		expect(
			resolveArtifactDisclosure(
				{
					scope: "owner-private",
					scopedEntityId: OWNER,
					grants: [{ entityId: OTHER, mode: "full" }],
				},
				ctx({ role: "USER" }),
				AGENT,
			),
		).toBe("none");
	});

	it("ungranted USER falls back to the scope ladder", () => {
		// owner-private default fails closed…
		expect(
			resolveArtifactDisclosure(
				{ scope: "owner-private", scopedEntityId: OWNER },
				ctx({ role: "USER" }),
				AGENT,
			),
		).toBe("none");
		// …global stays readable…
		expect(
			resolveArtifactDisclosure(
				{ scope: "global" },
				ctx({ role: "USER" }),
				AGENT,
			),
		).toBe("full");
		// …and a user still reads their OWN user-private record.
		expect(
			resolveArtifactDisclosure(
				{ scope: "user-private", scopedEntityId: VIEWER },
				ctx({ role: "USER" }),
				AGENT,
			),
		).toBe("full");
		expect(
			resolveArtifactDisclosure(
				{ scope: "user-private", scopedEntityId: OTHER },
				ctx({ role: "USER" }),
				AGENT,
			),
		).toBe("none");
	});

	it("GUEST role collapses to the least-privileged tier: omitted on owner-private", () => {
		expect(
			resolveArtifactDisclosure(
				{ scope: "owner-private", scopedEntityId: OWNER },
				ctx({ role: "GUEST" }),
				AGENT,
			),
		).toBe("none");
	});

	it("unresolved role (no world) fails closed to the USER tier", () => {
		expect(
			resolveArtifactDisclosure(
				{ scope: "owner-private", scopedEntityId: OWNER },
				ctx(),
				AGENT,
			),
		).toBe("none");
	});
});

describe("parseArtifactShareGrants", () => {
	it("parses well-formed grants and preserves issuer fields", () => {
		const grants = parseArtifactShareGrants({
			share: {
				grants: [
					{
						entityId: VIEWER,
						mode: "redacted",
						grantedBy: OWNER,
						grantedAtMs: 123,
					},
				],
			},
		});
		expect(grants).toEqual([
			{
				entityId: VIEWER,
				mode: "redacted",
				grantedBy: OWNER,
				grantedAtMs: 123,
			},
		]);
	});

	it("drops malformed entries instead of granting anything", () => {
		const grants = parseArtifactShareGrants({
			share: {
				grants: [
					{ entityId: "not-a-uuid", mode: "full" },
					{ entityId: VIEWER, mode: "everything" },
					{ entityId: VIEWER },
					"garbage",
					null,
					{ entityId: VIEWER, mode: "full" },
				],
			},
		});
		expect(grants).toEqual([{ entityId: VIEWER, mode: "full" }]);
	});

	it("returns empty for absent/malformed share metadata", () => {
		expect(parseArtifactShareGrants(undefined)).toEqual([]);
		expect(parseArtifactShareGrants({})).toEqual([]);
		expect(parseArtifactShareGrants({ share: "nope" })).toEqual([]);
		expect(parseArtifactShareGrants({ share: { grants: "nope" } })).toEqual([]);
	});
});

describe("artifactDisclosureRecordFromMemory", () => {
	it("types top-level memory.metadata.share for referencing records", () => {
		expect(artifactDisclosureRecordFromMemory(typedShareMemory)).toEqual({
			scope: "owner-private",
			scopedEntityId: OTHER,
			grants: [{ entityId: VIEWER, mode: "redacted" }],
		});
	});

	it("normalizes stored metadata into a disclosure record", () => {
		const memory = {
			entityId: OTHER,
			metadata: {
				scope: "user-private",
				scopedToEntityId: VIEWER,
				share: {
					grants: [{ entityId: OTHER, mode: "redacted" }],
					roomSnapshot: {
						roomId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
						entityIds: [VIEWER],
						atMs: 123,
					},
				},
			},
		} as Pick<Memory, "entityId" | "metadata">;

		expect(artifactDisclosureRecordFromMemory(memory)).toEqual({
			scope: "user-private",
			scopedEntityId: VIEWER,
			grants: [{ entityId: OTHER, mode: "redacted" }],
		});
	});

	it("fails closed on malformed scope and grants", () => {
		const memory = {
			entityId: OTHER,
			metadata: {
				scope: "public-to-everyone",
				scopedToEntityId: "not-a-uuid",
				share: {
					grants: [{ entityId: VIEWER, mode: "everything" }],
				},
			},
		} as Pick<Memory, "entityId" | "metadata">;

		expect(artifactDisclosureRecordFromMemory(memory)).toEqual({
			scope: "owner-private",
			scopedEntityId: OTHER,
			grants: [],
		});
	});

	it("resolves disclosure from a memory row using stored share metadata", () => {
		const memory = {
			entityId: OWNER,
			metadata: {
				scope: "owner-private",
				share: {
					grants: [{ entityId: VIEWER, mode: "redacted" }],
				},
			},
		} as Pick<Memory, "entityId" | "metadata">;

		expect(
			resolveArtifactDisclosureForMemory(memory, ctx({ role: "USER" }), AGENT),
		).toBe("redacted");
	});
});

describe("selectDisclosedArtifactUrl", () => {
	it("returns the original URL for full disclosure", () => {
		expect(
			selectDisclosedArtifactUrl("full", {
				fullUrl: "/api/media/original.wav",
				redactedUrl: "/api/media/redacted.wav",
			}),
		).toEqual({
			disclosure: "full",
			url: "/api/media/original.wav",
			redacted: false,
		});
	});

	it("returns the redacted URL for redacted disclosure", () => {
		expect(
			selectDisclosedArtifactUrl("redacted", {
				fullUrl: "/api/media/original.wav",
				redactedUrl: "/api/media/redacted.wav",
			}),
		).toEqual({
			disclosure: "redacted",
			url: "/api/media/redacted.wav",
			redacted: true,
		});
	});

	it("omits redacted disclosure when no redacted variant exists", () => {
		expect(
			selectDisclosedArtifactUrl("redacted", {
				fullUrl: "/api/media/original.wav",
			}),
		).toBeNull();
	});

	it("omits none or missing original URL", () => {
		expect(
			selectDisclosedArtifactUrl("none", {
				fullUrl: "/api/media/original.wav",
			}),
		).toBeNull();
		expect(selectDisclosedArtifactUrl("full", {})).toBeNull();
	});
});
