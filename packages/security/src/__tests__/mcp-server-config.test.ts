/**
 * Deny-by-default coverage for the MCP server config validator (SSRF /
 * prototype-pollution guard, GHSA-54rx-pcr9-hg9x).
 *
 * These tests exercise the error-boundary paths hardened in the #12740
 * security fail-closed sweep: an unparseable URL and an unresolvable host must
 * each produce a non-null REJECTION reason (the connection is blocked), never
 * `null` (which would ALLOW the server). The rule for this file is
 * ambiguity-resolves-to-deny.
 */

import { describe, expect, it } from "vitest";
import { validateMcpServerConfig } from "../mcp-server-config.js";

describe("validateMcpServerConfig — remote URL fails closed", () => {
  it("rejects an unparseable URL (deny, not allow)", async () => {
    const rejection = await validateMcpServerConfig({
      type: "sse",
      url: "http://[not a valid url",
    });
    // A rejection reason (truthy string) means the connection is BLOCKED. A
    // `null` here would be a silent fail-open (the malformed URL allowed).
    expect(rejection).not.toBeNull();
    expect(rejection).toMatch(/valid absolute URL/i);
  });

  it("rejects a non-http(s) scheme", async () => {
    const rejection = await validateMcpServerConfig({
      type: "sse",
      url: "file:///etc/passwd",
    });
    expect(rejection).not.toBeNull();
    expect(rejection).toMatch(/http/i);
  });

  it("rejects a private/link-local IP literal (SSRF block, no DNS needed)", async () => {
    for (const url of [
      "http://127.0.0.1/mcp",
      "http://169.254.169.254/latest/meta-data", // cloud metadata endpoint
      "http://10.0.0.5/",
      "http://[::1]/",
    ]) {
      const rejection = await validateMcpServerConfig({ type: "sse", url });
      expect(rejection, `expected ${url} to be blocked`).not.toBeNull();
      expect(rejection).toMatch(/blocked/i);
    }
  });

  it("rejects a host that cannot be resolved (deny-by-default)", async () => {
    // A syntactically-valid hostname that does not resolve. The DNS-failure
    // catch must return a rejection reason (block), never allow the connection
    // because "we could not prove it is safe".
    const rejection = await validateMcpServerConfig({
      type: "sse",
      url: "http://this-host-does-not-exist.invalid/mcp",
    });
    expect(rejection).not.toBeNull();
    expect(rejection).toMatch(/resolve|blocked/i);
  });

  it("rejects *.localhost and *.local suffix hosts", async () => {
    for (const url of [
      "http://evil.localhost/mcp",
      "http://printer.local/mcp",
    ]) {
      const rejection = await validateMcpServerConfig({ type: "sse", url });
      expect(rejection, `expected ${url} to be blocked`).not.toBeNull();
      expect(rejection).toMatch(/blocked/i);
    }
  });
});

describe("validateMcpServerConfig — stdio command allow-list fails closed", () => {
  it("rejects a command with path separators (no bare-name bypass)", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "/usr/bin/env",
    });
    expect(rejection).not.toBeNull();
    expect(rejection).toMatch(/bare executable|path separators/i);
  });

  it("rejects a command that is not on the allow-list", async () => {
    const rejection = await validateMcpServerConfig({
      type: "stdio",
      command: "curl",
    });
    expect(rejection).not.toBeNull();
    expect(rejection).toMatch(/not allowed/i);
  });
});
