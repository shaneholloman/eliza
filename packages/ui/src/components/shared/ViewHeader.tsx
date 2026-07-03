import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useAgentElement } from "../../agent-surface";
import { cn } from "../../lib/utils";
import { shouldUseHashNavigation } from "../../navigation";
import { goLauncher } from "../../state/shell-surface-store";

/**
 * Return to the launcher grid — the default "back" for any top-level view.
 *
 * The global corner back button was removed (#11876); each view now owns its
 * own header + back control (this module). Back always lands on the launcher
 * surface: set the shell-surface rail to its launcher half, then route to
 * `/apps` (which mounts the launcher). One helper so every view agrees.
 */
export function navigateBackToLauncher(): void {
  goLauncher();
  if (typeof window === "undefined") return;
  const path = "/apps";
  try {
    if (shouldUseHashNavigation()) {
      window.location.hash = path;
    } else {
      window.history.pushState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  } catch {
    // Sandboxed navigation is best-effort.
  }
}

/**
 * The shared view back button: an icon, nothing else. Deliberately chromeless —
 * no border, no shadow, and a `bg-bg` fill so it reads as the neutral view
 * surface (white in light mode, dark in dark mode), never the accent/orange
 * chip it used to be. On an opaque view the fill is invisible (looks like a
 * bare icon); on a shared-background view it's a subtle neutral chip.
 */
export function ViewBackButton({
  onBack,
  label = "Back to launcher",
  className,
}: {
  onBack?: () => void;
  label?: string;
  className?: string;
}) {
  const handleBack = onBack ?? navigateBackToLauncher;
  const { ref, agentProps } = useAgentElement<HTMLButtonElement>({
    id: "view-back",
    role: "button",
    label,
    description: "Return to the launcher",
    onActivate: handleBack,
  });
  return (
    <button
      ref={ref}
      type="button"
      onClick={handleBack}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full bg-bg text-txt transition-colors hover:bg-bg-hover",
        className,
      )}
      {...agentProps}
    >
      <ArrowLeft className="h-5 w-5" aria-hidden />
    </button>
  );
}

/**
 * Standard view header: a chromeless back button and a title on one line.
 *
 * Mobile centers the title with the back button overlaid on the left (the
 * iOS-style nav bar the redesign asks for); ≥sm left-aligns the title after the
 * back button. A sub-view renders its OWN `ViewHeader`, which REPLACES this one
 * rather than stacking beneath it — callers swap the header for the active
 * section, they do not nest two.
 */
export function ViewHeader({
  title,
  onBack,
  showBack = true,
  right,
  className,
}: {
  title: ReactNode;
  /** Override the default (launcher) back target — e.g. a sub-view returning to its hub. */
  onBack?: () => void;
  /** Hide the back control entirely (a view with no meaningful "back"). */
  showBack?: boolean;
  /** Optional trailing controls (actions, filters). */
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-testid="view-header"
      className={cn(
        "relative flex min-h-14 shrink-0 items-center justify-center gap-2 px-3 py-2.5 sm:justify-start sm:px-4",
        className,
      )}
    >
      {showBack ? (
        <ViewBackButton
          onBack={onBack}
          className="absolute left-2 top-1/2 -translate-y-1/2 sm:static sm:translate-y-0"
        />
      ) : null}
      <h1 className="truncate text-lg font-semibold tracking-tight text-txt-strong">
        {title}
      </h1>
      {right ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 sm:static sm:ml-auto sm:translate-y-0">
          {right}
        </div>
      ) : null}
    </header>
  );
}
