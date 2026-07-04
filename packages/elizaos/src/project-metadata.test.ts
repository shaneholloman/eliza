/**
 * Project-metadata read tests use real temporary `.elizaos/template.json`
 * fixtures to prove the J1 command boundary: a missing ledger is a valid
 * no-data outcome (null), while a corrupt or malformed ledger fails closed with
 * a typed {@link ProjectMetadataError} rather than being read as fabricated
 * defaults.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProjectMetadataError,
  readProjectMetadata,
  writeProjectMetadata,
} from "./project-metadata.js";
import type { ProjectTemplateMetadata } from "./types.js";

let tempDirs: string[] = [];

function makeProjectRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "elizaos-metadata-"));
  tempDirs.push(dir);
  return dir;
}

function writeRawMetadata(projectRoot: string, contents: string): string {
  const metadataDir = path.join(projectRoot, ".elizaos");
  mkdirSync(metadataDir, { recursive: true });
  const metadataPath = path.join(metadataDir, "template.json");
  writeFileSync(metadataPath, contents);
  return metadataPath;
}

function validMetadata(): ProjectTemplateMetadata {
  return {
    cliVersion: "1.2.3",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    templateId: "plugin",
    templateVersion: 1,
    values: { PLUGINNAME: "acme" },
    managedFiles: { "src/index.ts": "deadbeef" },
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("readProjectMetadata", () => {
  it("returns null when the ledger is absent (valid no-upgrade-state)", () => {
    const projectRoot = makeProjectRoot();
    expect(readProjectMetadata(projectRoot)).toBeNull();
  });

  it("round-trips a valid ledger written by writeProjectMetadata", () => {
    const projectRoot = makeProjectRoot();
    const metadata = validMetadata();
    writeProjectMetadata(projectRoot, metadata);
    expect(readProjectMetadata(projectRoot)).toEqual(metadata);
  });

  it("fails closed on a genuinely corrupt (unparseable) ledger", () => {
    const projectRoot = makeProjectRoot();
    const metadataPath = writeRawMetadata(projectRoot, "{ this is not json ");
    expect(() => readProjectMetadata(projectRoot)).toThrow(
      ProjectMetadataError,
    );
    try {
      readProjectMetadata(projectRoot);
      throw new Error("expected readProjectMetadata to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectMetadataError);
      const err = error as ProjectMetadataError;
      expect(err.metadataPath).toBe(metadataPath);
      expect(err.message).toContain("invalid JSON");
    }
  });

  it("rejects valid JSON that is not an object (bare string)", () => {
    const projectRoot = makeProjectRoot();
    writeRawMetadata(projectRoot, '"not-an-object"');
    expect(() => readProjectMetadata(projectRoot)).toThrow(
      /expected a JSON object/,
    );
  });

  it("rejects valid JSON that is an array", () => {
    const projectRoot = makeProjectRoot();
    writeRawMetadata(projectRoot, "[]");
    expect(() => readProjectMetadata(projectRoot)).toThrow(
      /expected a JSON object/,
    );
  });

  it("rejects an empty object (missing required templateId)", () => {
    const projectRoot = makeProjectRoot();
    writeRawMetadata(projectRoot, "{}");
    expect(() => readProjectMetadata(projectRoot)).toThrow(
      /missing or invalid 'templateId'/,
    );
  });

  it("rejects a ledger with a non-string values map", () => {
    const projectRoot = makeProjectRoot();
    writeRawMetadata(
      projectRoot,
      JSON.stringify({ templateId: "plugin", values: { n: 5 }, managedFiles: {} }),
    );
    expect(() => readProjectMetadata(projectRoot)).toThrow(
      /missing or invalid 'values'/,
    );
  });

  it("rejects a ledger missing managedFiles", () => {
    const projectRoot = makeProjectRoot();
    writeRawMetadata(
      projectRoot,
      JSON.stringify({ templateId: "plugin", values: {} }),
    );
    expect(() => readProjectMetadata(projectRoot)).toThrow(
      /missing or invalid 'managedFiles'/,
    );
  });

  it("rejects a ledger whose managedFiles hashes are not strings", () => {
    const projectRoot = makeProjectRoot();
    writeRawMetadata(
      projectRoot,
      JSON.stringify({
        templateId: "plugin",
        values: {},
        managedFiles: { "src/index.ts": 123 },
      }),
    );
    expect(() => readProjectMetadata(projectRoot)).toThrow(
      /missing or invalid 'managedFiles'/,
    );
  });
});
