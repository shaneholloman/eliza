/**
 * Renders the LifeOps live-test spatial source to static DOM and terminal lines,
 * proving the same readiness, run, retry, and fire-now controls exist across
 * modalities without depending on the scheduler service or a browser runtime.
 */
import { SpatialSurface } from "@elizaos/ui/spatial";
import { renderViewToLines } from "@elizaos/ui/spatial/tui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  LifeOpsLiveTestSpatialView,
  type LifeOpsLiveTestSnapshot,
} from "./LifeOpsLiveTestSpatialView.tsx";

const snapshot: LifeOpsLiveTestSnapshot = {
  model: {
    id: "model",
    label: "AI model",
    status: "Connected",
    ready: true,
    action: "",
  },
  connectors: [
    {
      id: "google",
      label: "Google",
      status: "Not connected",
      ready: false,
      action: "Connect Google",
    },
  ],
  run: {
    state: "done",
    kind: "reminder",
    outcome: {
      tone: "primary",
      title: "Fired",
      detail: "Reminder dispatched through the scheduled-task runner.",
    },
  },
  tasks: {
    state: "ready",
    rows: [
      {
        id: "task-1",
        title: "Take medication",
        meta: "reminder - scheduled",
        firing: false,
      },
    ],
  },
};

describe("LifeOpsLiveTestSpatialView one source, three modalities", () => {
  it("GUI + XR: renders readiness, run controls, and scheduled-task controls", () => {
    const view = (
      <LifeOpsLiveTestSpatialView snapshot={snapshot} onAction={vi.fn()} />
    );
    const gui = renderToStaticMarkup(
      <SpatialSurface modality="gui">{view}</SpatialSurface>,
    );
    const xr = renderToStaticMarkup(
      <SpatialSurface modality="xr">{view}</SpatialSurface>,
    );

    expect(gui).toContain('data-spatial-surface="gui"');
    expect(xr).toContain('data-spatial-surface="xr"');
    for (const html of [gui, xr]) {
      expect(html).toContain("LifeOps Live Test");
      expect(html).toContain("Connect Google");
      expect(html).toContain("Take medication");
      expect(html).toContain('data-agent-id="connect-google"');
      expect(html).toContain('data-agent-id="run-reminder"');
      expect(html).toContain('data-agent-id="run-checkin"');
      expect(html).toContain('data-agent-id="fire-task-1"');
    }
  });

  it("TUI: renders the same live-test labels at narrow and wide widths", () => {
    const view = <LifeOpsLiveTestSpatialView snapshot={snapshot} />;
    for (const width of [54, 32]) {
      const lines = renderViewToLines(view, width);
      const flat = lines.join("\n");
      expect(lines.length).toBeGreaterThan(0);
      expect(flat).toContain("LifeOps Live Test");
      expect(flat).toContain("Run live validation");
      expect(flat).toContain("Fire now");
    }
  });
});
