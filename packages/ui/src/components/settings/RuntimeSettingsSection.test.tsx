// @vitest-environment jsdom
/**
 * Covers the Settings > Runtime cloud/local rows: when a matching saved
 * profile exists, switching must use the non-destructive runtime switch instead
 * of re-entering first-run and clearing the active runtime state.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProfile } from "../../state/agent-profile-types";

const mocks = vi.hoisted(() => ({
  loadAgentProfileRegistry: vi.fn(),
  switchRuntimeNonDestructive: vi.fn(() => ({ ok: true })),
  reloadIntoFirstRunRuntime: vi.fn(),
  refetchRuntimeMode: vi.fn(),
  loadPersistedActiveServer: vi.fn(),
  isStoreBuild: vi.fn(() => false),
  isAndroidCloudBuild: vi.fn(() => false),
}));

vi.mock("../../agent-surface", () => ({
  useAgentElement: () => ({ ref: undefined, agentProps: {} }),
}));

vi.mock("../../bridge/electrobun-rpc", () => ({
  inspectExistingElizaInstall: vi.fn(),
  migrateDesktopStateDir: vi.fn(),
  pickDesktopWorkspaceFolder: vi.fn(),
}));

vi.mock("../../bridge/electrobun-runtime", () => ({
  isElectrobunRuntime: () => false,
}));

vi.mock("../../build-variant", () => ({
  isStoreBuild: mocks.isStoreBuild,
}));

vi.mock("../../platform/android-runtime", () => ({
  isAndroidCloudBuild: mocks.isAndroidCloudBuild,
}));

vi.mock("../../hooks/useRuntimeMode", () => ({
  useRuntimeMode: () => ({
    state: { phase: "unavailable" },
    mode: null,
    isLocalOnly: false,
    isCloudMode: false,
    isRemoteMode: false,
    refetch: mocks.refetchRuntimeMode,
  }),
}));

vi.mock("../../state", () => ({
  loadAgentProfileRegistry: mocks.loadAgentProfileRegistry,
  switchRuntimeNonDestructive: mocks.switchRuntimeNonDestructive,
  useAppSelector: (
    selector: (state: {
      t: (key: string, options?: { defaultValue?: string }) => string;
    }) => unknown,
  ) =>
    selector({
      t: (_key, options) => options?.defaultValue ?? _key,
    }),
}));

vi.mock("../../state/persistence", () => ({
  loadPersistedActiveServer: mocks.loadPersistedActiveServer,
}));

vi.mock("../../first-run/reload-into-first-run-runtime", () => ({
  reloadIntoFirstRunRuntime: mocks.reloadIntoFirstRunRuntime,
}));

import { RuntimeSettingsSection } from "./RuntimeSettingsSection";

const LOCAL_PROFILE: AgentProfile = {
  id: "local-1",
  label: "This device",
  kind: "local",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const CLOUD_PROFILE: AgentProfile = {
  id: "cloud-1",
  label: "Cloud agent",
  kind: "cloud",
  apiBase: "https://x.agent.elizacloud.ai",
  accessToken: "cloud-token",
  createdAt: "2026-06-02T00:00:00.000Z",
};

const MOBILE_LOCAL_PROFILE: AgentProfile = {
  id: "mobile-local-1",
  label: "On-device agent",
  kind: "remote",
  apiBase: "eliza-local-agent://ipc",
  createdAt: "2026-06-03T00:00:00.000Z",
};

function seedRegistry(
  profiles: AgentProfile[],
  activeProfileId: string | null,
) {
  mocks.loadAgentProfileRegistry.mockReturnValue({
    version: 1,
    activeProfileId,
    profiles,
  });
}

function clickRuntimeRow(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("RuntimeSettingsSection runtime switching", () => {
  beforeEach(() => {
    mocks.loadAgentProfileRegistry.mockReset();
    mocks.switchRuntimeNonDestructive.mockReset();
    mocks.switchRuntimeNonDestructive.mockReturnValue({ ok: true });
    mocks.reloadIntoFirstRunRuntime.mockReset();
    mocks.refetchRuntimeMode.mockReset();
    mocks.loadPersistedActiveServer.mockReset();
    mocks.loadPersistedActiveServer.mockReturnValue(null);
    mocks.isStoreBuild.mockReturnValue(false);
    mocks.isAndroidCloudBuild.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("switches to a saved cloud profile without re-entering first-run", () => {
    seedRegistry([LOCAL_PROFILE, CLOUD_PROFILE], "local-1");

    render(<RuntimeSettingsSection />);
    clickRuntimeRow("Cloud agent");

    expect(mocks.switchRuntimeNonDestructive).toHaveBeenCalledWith("cloud-1");
    expect(mocks.reloadIntoFirstRunRuntime).not.toHaveBeenCalled();
    expect(mocks.refetchRuntimeMode).toHaveBeenCalledTimes(1);
  });

  it("switches to a saved desktop local profile without re-entering first-run", () => {
    seedRegistry([CLOUD_PROFILE, LOCAL_PROFILE], "cloud-1");

    render(<RuntimeSettingsSection />);
    clickRuntimeRow("Local");

    expect(mocks.switchRuntimeNonDestructive).toHaveBeenCalledWith("local-1");
    expect(mocks.reloadIntoFirstRunRuntime).not.toHaveBeenCalled();
    expect(mocks.refetchRuntimeMode).toHaveBeenCalledTimes(1);
  });

  it("treats a mobile IPC profile as the saved local runtime", () => {
    seedRegistry([CLOUD_PROFILE, MOBILE_LOCAL_PROFILE], "cloud-1");

    render(<RuntimeSettingsSection />);
    clickRuntimeRow("Local");

    expect(mocks.switchRuntimeNonDestructive).toHaveBeenCalledWith(
      "mobile-local-1",
    );
    expect(mocks.reloadIntoFirstRunRuntime).not.toHaveBeenCalled();
    expect(mocks.refetchRuntimeMode).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the user clicks the already-active cloud row", () => {
    seedRegistry([LOCAL_PROFILE, CLOUD_PROFILE], "cloud-1");
    mocks.loadPersistedActiveServer.mockReturnValue({
      id: "cloud:agent-1",
      label: "Cloud agent",
      kind: "cloud",
      apiBase: "https://x.agent.elizacloud.ai",
      accessToken: "cloud-token",
    });

    render(<RuntimeSettingsSection />);
    clickRuntimeRow("Cloud agent");

    expect(mocks.switchRuntimeNonDestructive).not.toHaveBeenCalled();
    expect(mocks.reloadIntoFirstRunRuntime).not.toHaveBeenCalled();
    expect(mocks.refetchRuntimeMode).not.toHaveBeenCalled();
  });

  it("falls back to first-run when no saved cloud profile exists", () => {
    seedRegistry([LOCAL_PROFILE], "local-1");

    render(<RuntimeSettingsSection />);
    clickRuntimeRow("Cloud agent");

    expect(mocks.switchRuntimeNonDestructive).not.toHaveBeenCalled();
    expect(mocks.reloadIntoFirstRunRuntime).toHaveBeenCalledWith("cloud");
    expect(mocks.refetchRuntimeMode).not.toHaveBeenCalled();
  });

  it("falls back to first-run when no saved local profile exists", () => {
    seedRegistry([CLOUD_PROFILE], "cloud-1");

    render(<RuntimeSettingsSection />);
    clickRuntimeRow("Local");

    expect(mocks.switchRuntimeNonDestructive).not.toHaveBeenCalled();
    expect(mocks.reloadIntoFirstRunRuntime).toHaveBeenCalledWith("local");
    expect(mocks.refetchRuntimeMode).not.toHaveBeenCalled();
  });
});
