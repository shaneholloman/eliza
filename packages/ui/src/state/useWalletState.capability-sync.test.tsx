// @vitest-environment jsdom
/**
 * Real-error-path coverage for useWalletState's capability-toggle sync: a
 * server `updateConfig` that actually rejects must surface through
 * `setActionNotice` (never a silent local/server divergence). API client
 * mocked at the module seam; the hook, persistence, and notice wiring are real.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateConfig = vi.fn();

vi.mock("../api", () => ({
  client: {
    updateConfig: (...args: unknown[]) => updateConfig(...args),
    getConfig: vi.fn().mockResolvedValue({}),
  },
}));

import { useWalletState } from "./useWalletState";

function mountHook(setActionNotice: ReturnType<typeof vi.fn>) {
  return renderHook(() =>
    useWalletState({
      setActionNotice,
      promptModal: vi.fn().mockResolvedValue(null),
      agentName: undefined,
      characterName: undefined,
      hydrateServerConfig: false,
    }),
  );
}

describe("useWalletState capability sync", () => {
  beforeEach(() => {
    updateConfig.mockReset();
    window.localStorage.clear();
  });

  it("surfaces a rejected capability sync via setActionNotice", async () => {
    updateConfig.mockRejectedValue(new Error("HTTP 500"));
    const setActionNotice = vi.fn();
    const { result } = mountHook(setActionNotice);

    act(() => {
      result.current.setWalletEnabled(false);
    });

    await waitFor(() => {
      expect(setActionNotice).toHaveBeenCalledWith(
        expect.stringContaining("wallet"),
        "error",
      );
    });
    expect(updateConfig).toHaveBeenCalledWith({
      ui: { capabilities: { wallet: false } },
    });
  });

  it("stays silent when the capability sync succeeds", async () => {
    updateConfig.mockResolvedValue({});
    const setActionNotice = vi.fn();
    const { result } = mountHook(setActionNotice);

    act(() => {
      result.current.setBrowserEnabled(true);
    });

    await waitFor(() => {
      expect(updateConfig).toHaveBeenCalledWith({
        ui: { capabilities: { browser: true } },
      });
    });
    expect(setActionNotice).not.toHaveBeenCalled();
  });
});
