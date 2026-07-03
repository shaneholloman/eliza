import * as React from "react";

import { useAppSelector } from "../../../state";
import { isTutorialActive, startTutorial } from "./tutorial-controller";

/**
 * The view the home "Tutorial" tile opens. It has no UI of its own: on mount it
 * activates the global TutorialOverlay (the interactive tour) and immediately
 * drops the user back on the home base so the tour spotlights the real chat.
 * Eliza narrates each frame aloud; the tour can be muted from its card.
 *
 * Because navigating to "chat" routes away from this view, the user never sees
 * TutorialView render — it is a transient launch shim, so it renders nothing.
 */
export function TutorialView(): React.ReactElement | null {
  const setTab = useAppSelector((s) => s.setTab);

  // Latch so the tour is kicked off exactly once per mount. A per-instance ref
  // guards re-renders; the `isTutorialActive()` check guards a React 19
  // strict/dev double-mount (fresh instance, fresh ref, tour already running) —
  // restarting would reset the tour to step 0 mid-flight.
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current || isTutorialActive()) return;
    startedRef.current = true;
    startTutorial();
    setTab("chat"); // route home so the tour overlays the real chat
  }, [setTab]);

  return null;
}
