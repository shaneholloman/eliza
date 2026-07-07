/**
 * Live spatial gallery. For every screen archetype it renders the same authored
 * view to the retained DOM modalities:
 *   - GUI  — <SpatialSurface modality="gui">  (DOM)
 *   - XR   — <SpatialSurface modality="xr">   (DOM, spatially scaled)
 * so a screenshot of this page verifies the shared spatial vocabulary per
 * screen.
 */
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { GALLERY } from "../../src/spatial/gallery.tsx";
import { SpatialSurface } from "../../src/spatial/index.ts";

// --- Panels -----------------------------------------------------------------

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: "var(--muted-foreground)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function DomPanel({
  modality,
  view,
}: {
  modality: "gui" | "xr";
  view: () => ReactNode;
}) {
  return (
    <div
      style={{
        width: modality === "xr" ? 420 : 360,
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 14,
        background: "#13161c",
      }}
    >
      <PanelLabel>{modality}</PanelLabel>
      <SpatialSurface modality={modality}>{view()}</SpatialSurface>
    </div>
  );
}

function ScreenRow({
  id,
  title,
  description,
  view,
}: {
  id: string;
  title: string;
  description: string;
  view: () => ReactNode;
}) {
  return (
    <section
      data-screen={id}
      style={{
        padding: "20px 0",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
        <span
          style={{
            color: "var(--muted-foreground)",
            marginLeft: 10,
            fontSize: 13,
          }}
        >
          {description}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <DomPanel modality="gui" view={view} />
        <DomPanel modality="xr" view={view} />
      </div>
    </section>
  );
}

function App() {
  // `?screen=<id>` renders a single screen at the top (the screenshot tool
  // always captures scroll 0, so per-screen URLs are how we verify each one).
  const only = new URLSearchParams(window.location.search).get("screen");
  const screens = only ? GALLERY.filter((s) => s.id === only) : GALLERY;
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ marginBottom: 8 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26 }}>
          Spatial — one view, retained modalities
        </h1>
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          Every screen below is authored once with the spatial primitives and
          rendered to the retained DOM modalities.
        </p>
      </header>
      {screens.map((s) => (
        <ScreenRow
          key={s.id}
          id={s.id}
          title={s.title}
          description={s.description}
          view={s.view}
        />
      ))}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
