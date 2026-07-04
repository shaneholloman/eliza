/**
 * Unit tests for the connector-source alias registry
 * (normalizeConnectorSource plus the register/expand/metadata helpers): alias
 * normalization, filter expansion, and passive-source metadata lookup against
 * runtime-registered declarations.
 */
import { describe, expect, it } from "vitest";

import {
  expandConnectorSourceFilter,
  getConnectorIdentityMetadataMapping,
  getConnectorSourceAliases,
  getConnectorSourceMetadata,
  getConnectorWorldIdMetadataKeys,
  isPassiveConnectorSource,
  normalizeConnectorSource,
  registerConnectorSourceAliases,
  registerConnectorSourceDefinitions,
  registerConnectorSourceMetadata,
  unregisterConnectorSourceMetadataOwner,
} from "./connectors";

describe("connector source aliases", () => {
  it("normalizes connector aliases from registered declarations", () => {
    registerConnectorSourceDefinitions(
      [
        {
          source: "primary-chat",
          aliases: ["primary-chat", "primary-chat-account"],
          sourceKind: "passive",
          isPassive: true,
        },
        {
          source: "bridge-chat",
          aliases: ["bridge-chat", "bridge-chat-account"],
          sourceKind: "passive",
          isPassive: true,
        },
        {
          source: "mobile-chat",
          aliases: ["mobile-chat", "mobile-chat-account", "mobilechat"],
          sourceKind: "passive",
          isPassive: true,
        },
        {
          source: "dm-chat",
          aliases: ["dm-chat", "dm-chat-account"],
          sourceKind: "passive",
          isPassive: true,
        },
      ],
      "shared-connectors-test",
    );

    expect(normalizeConnectorSource(" primary-chat-account ")).toBe(
      "primary-chat",
    );
    expect(normalizeConnectorSource("Bridge-Chat-Account")).toBe("bridge-chat");
    expect(normalizeConnectorSource("dm-chat-account")).toBe("dm-chat");
    expect(getConnectorSourceAliases("mobile-chat")).toEqual([
      "mobile-chat",
      "mobile-chat-account",
      "mobilechat",
    ]);

    unregisterConnectorSourceMetadataOwner("shared-connectors-test");
  });

  it("expands registered aliases through the shared compatibility export", () => {
    registerConnectorSourceAliases("custom", ["CustomAccount"]);

    expect(normalizeConnectorSource("customaccount")).toBe("custom");
    expect([...expandConnectorSourceFilter(["custom"])]).toEqual([
      "custom",
      "customaccount",
    ]);
  });

  it("reads passive connector metadata from registered sources", () => {
    registerConnectorSourceMetadata("custom-passive", {
      aliases: ["custom-passive-account"],
      sourceKind: "passive",
    });

    expect(isPassiveConnectorSource("custom-passive-account")).toBe(true);
    expect(isPassiveConnectorSource("unknown-source")).toBe(false);
    expect(getConnectorSourceMetadata("custom-passive-account")).toMatchObject({
      sourceKind: "passive",
    });
  });
});

// #12090 item 22 / #12087: the flat-field -> identity projection and world-id
// derivation keys are declared connector-owned registry metadata now, so core's
// roles.ts reads them generically instead of special-casing individual
// connectors. These cover the registry contract those helpers depend on.
describe("connector identity / world-id metadata mapping", () => {
  it("round-trips a registered identity mapping and normalizes blank fields to null", () => {
    const owner = "identity-mapping-test";
    try {
      registerConnectorSourceMetadata(
        "map-chat",
        {
          identityMetadataMapping: {
            userIdField: "  senderId  ",
            nameField: "  handle  ",
          },
        },
        owner,
      );
      expect(getConnectorIdentityMetadataMapping("map-chat")).toEqual({
        userIdField: "senderId",
        nameField: "handle",
      });
    } finally {
      unregisterConnectorSourceMetadataOwner(owner);
    }
  });

  it("drops an identity mapping whose user-id field is blank (fails closed)", () => {
    const owner = "identity-mapping-blank-test";
    try {
      registerConnectorSourceMetadata(
        "blank-chat",
        { identityMetadataMapping: { userIdField: "   " } },
        owner,
      );
      expect(getConnectorIdentityMetadataMapping("blank-chat")).toBeNull();
    } finally {
      unregisterConnectorSourceMetadataOwner(owner);
    }
  });

  it("returns null / empty for a source with no mapping declared", () => {
    expect(getConnectorIdentityMetadataMapping("never-registered")).toBeNull();
    expect(getConnectorWorldIdMetadataKeys("never-registered")).toEqual([]);
  });

  it("filters non-string / blank world-id keys and trims survivors", () => {
    const owner = "worldid-keys-test";
    try {
      registerConnectorSourceMetadata(
        "world-chat",
        {
          worldIdMetadataKeys: [
            " primaryId ",
            "",
            42 as unknown as string,
            "secondaryId",
          ],
        },
        owner,
      );
      expect(getConnectorWorldIdMetadataKeys("world-chat")).toEqual([
        "primaryId",
        "secondaryId",
      ]);
    } finally {
      unregisterConnectorSourceMetadataOwner(owner);
    }
  });

  it("ships the Discord legacy mapping as a built-in default (moved out of core roles.ts)", () => {
    expect(getConnectorIdentityMetadataMapping("discord")).toEqual({
      userIdField: "fromId",
      nameField: "entityName",
    });
    expect(getConnectorWorldIdMetadataKeys("discord")).toEqual([
      "discordServerId",
      "discordChannelId",
    ]);
  });

  it("lets a runtime-registered mapping override the built-in default (registered wins)", () => {
    const owner = "discord-override-test";
    try {
      registerConnectorSourceMetadata(
        "discord",
        {
          identityMetadataMapping: {
            userIdField: "authorId",
            nameField: "authorName",
          },
        },
        owner,
      );
      expect(getConnectorIdentityMetadataMapping("discord")).toEqual({
        userIdField: "authorId",
        nameField: "authorName",
      });
    } finally {
      unregisterConnectorSourceMetadataOwner(owner);
      // Built-in default is restored once the override owner is removed.
      expect(getConnectorIdentityMetadataMapping("discord")).toEqual({
        userIdField: "fromId",
        nameField: "entityName",
      });
    }
  });
});
