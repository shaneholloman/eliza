// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TutorialView } from "./TutorialView";

// The view has no UI of its own — it activates the global tour and routes to
// chat on mount. These are the two side effects we assert.
const startTutorial = vi.hoisted(() => vi.fn());
const isTutorialActive = vi.hoisted(() => vi.fn(() => false));
vi.mock("./tutorial-controller", () => ({ startTutorial, isTutorialActive }));

const setTab = vi.hoisted(() => vi.fn());
vi.mock("../../../state", () => ({
  useAppSelector: (sel: (value: { setTab: typeof setTab }) => unknown) =>
    sel({ setTab }),
}));

afterEach(() => {
  cleanup();
  startTutorial.mockClear();
  setTab.mockClear();
  isTutorialActive.mockReset();
  isTutorialActive.mockReturnValue(false);
});

describe("TutorialView", () => {
  it("starts the tour and routes to chat on mount, rendering no splash", () => {
    const { container } = render(<TutorialView />);

    expect(startTutorial).toHaveBeenCalledTimes(1);
    expect(setTab).toHaveBeenCalledTimes(1);
    expect(setTab).toHaveBeenCalledWith("chat");
    // Transient launch shim — renders nothing: no "Start" button, no
    // "About a minute" splash.
    expect(container.childNodes.length).toBe(0);
    expect(
      container.querySelector('[data-testid="tutorial-start"]'),
    ).toBeNull();
  });

  it("starts the tour only once even if the view re-renders", () => {
    const { rerender } = render(<TutorialView />);
    rerender(<TutorialView />);
    rerender(<TutorialView />);

    expect(startTutorial).toHaveBeenCalledTimes(1);
    expect(setTab).toHaveBeenCalledTimes(1);
  });

  it("does not re-start the tour on a fresh mount while it is already active", () => {
    // Simulates a strict/dev double-mount: a fresh instance (fresh ref) mounts
    // while the tour store already reports active.
    isTutorialActive.mockReturnValue(true);

    render(<TutorialView />);

    expect(startTutorial).not.toHaveBeenCalled();
    expect(setTab).not.toHaveBeenCalled();
  });
});
