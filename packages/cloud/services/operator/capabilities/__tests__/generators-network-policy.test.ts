import { describe, expect, test } from "bun:test";
import { generateNetworkPolicy } from "../controller/generators";
import type { Server } from "../crd/generated/server-v1alpha1";

function server(): Server {
  return {
    metadata: {
      name: "server-a",
      namespace: "eliza-agents",
      uid: "server-uid",
    },
    spec: {
      image: "ghcr.io/elizaos/eliza:stable",
      tier: "standard",
      capacity: 1,
    },
  } as Server;
}

describe("generateNetworkPolicy", () => {
  test("generates an explicit default-deny egress policy for operator-managed agent pods", () => {
    const policy = generateNetworkPolicy(server());

    expect(policy.apiVersion).toBe("networking.k8s.io/v1");
    expect(policy.kind).toBe("NetworkPolicy");
    expect(policy.metadata.name).toBe("server-a-default-deny-egress");
    expect(policy.metadata.namespace).toBe("eliza-agents");
    expect(policy.spec.podSelector.matchLabels).toEqual({
      "eliza.ai/server": "server-a",
    });
    expect(policy.spec.policyTypes).toEqual(["Egress"]);
    expect(policy.spec.egress).toEqual([]);
  });
});
