/**
 * Single auto-scroll / at-bottom / jump-to-latest engine for chat threads
 * (#12348, #12188 Phase 3).
 *
 * The chat surfaces that own their own scroller — the homescreen `ChatSurface`
 * mini-chat and the continuous overlay — share the same behaviours through this
 * one hook: pin to the newest line while the reader rests at the bottom, do NOT
 * yank a reader who has scrolled up to read history, and coalesce the
 * bottom-follow write into a single rAF so a streamed token never forces a
 * synchronous reflow. The at-bottom state is a real value so a "jump to latest"
 * affordance can render when the reader has scrolled away.
 *
 * Two optional keys split the follow behaviours: `growthKey` (tail mutation —
 * streamed tokens; instant follow) and `lineKey` (a NEW line landed; smooth
 * glide unless reduced-motion). `enabled` gates the engine for surfaces whose
 * scroller unmounts (the overlay's closed sheet) — the false→true edge re-arms
 * the instant first pin so a re-opened thread never flashes at the top.
 *
 * It is scroll math only — no chrome, no message shape. The caller wires the
 * returned `scrollRef` to its scroller, reads `atBottom` to gate a jump control,
 * and calls `jumpToLatest()` from that control.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Distance from the bottom (px) within which the reader counts as "at the
// bottom" and the thread follows new content. Wider than a pixel so a
// sub-pixel rounding or a short overscroll never reads as "scrolled up".
const AT_BOTTOM_THRESHOLD_PX = 80;

function measureAtBottom(el: HTMLElement): boolean {
  return (
    el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD_PX
  );
}

/** Pin `el` to its bottom, gliding when smooth scrolling is requested AND the
 * environment implements it (jsdom and very old engines lack Element.scrollTo). */
function scrollToBottom(el: HTMLElement, smooth: boolean): void {
  if (smooth && typeof el.scrollTo === "function") {
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

export interface ThreadAutoScrollHandle<T extends HTMLElement> {
  /** Attach to the scrolling container. */
  scrollRef: React.RefObject<T | null>;
  /**
   * True while the reader is resting at (or within {@link AT_BOTTOM_THRESHOLD_PX}
   * of) the bottom. Drives the visibility of a jump-to-latest control: show it
   * only when this is false.
   */
  atBottom: boolean;
  /** Scroll to the newest line and re-pin follow. Bound to the jump control. */
  jumpToLatest: () => void;
}

export interface ThreadAutoScrollOptions {
  /**
   * A value that changes whenever the thread grows or its tail mutates
   * (message count, or `${count}:${lastMessageId}:${lastContent.length}` to
   * follow streamed tokens). The follow pass runs after each change.
   */
  growthKey: string | number;
  /**
   * A value that changes only when a NEW line lands (e.g. the last message
   * id). An at-bottom follow for a line change glides smoothly (unless
   * `reduceMotion`); plain `growthKey` growth (streamed tokens) always follows
   * instantly. Surfaces whose growthKey already carries the line identity may
   * omit this and get instant follows for everything.
   */
  lineKey?: string | number;
  /**
   * Gates the engine while the scroller is hidden or unmounted (the overlay's
   * closed sheet). While false nothing follows and `atBottom` freezes; the
   * false→true edge re-arms the instant first pin. Default true.
   */
  enabled?: boolean;
  /** Skip the smooth scroll and jump instantly (honour reduced-motion). */
  reduceMotion?: boolean;
}

/**
 * Auto-scroll a chat thread: follow the tail while the reader is at the bottom,
 * leave them alone when they have scrolled up, and expose `atBottom` +
 * `jumpToLatest` so the surface can offer a jump-to-latest control.
 *
 * The first growth after mount (or after an `enabled` false→true edge) pins
 * instantly — no animation, no "started at the top" flash. Subsequent growth
 * while at-bottom follows (smooth for a `lineKey` change, instant otherwise).
 * Growth while the reader is scrolled up does nothing — `atBottom` flips false
 * so the caller can surface the jump control.
 */
export function useThreadAutoScroll<T extends HTMLElement = HTMLDivElement>({
  growthKey,
  lineKey,
  enabled = true,
  reduceMotion = false,
}: ThreadAutoScrollOptions): ThreadAutoScrollHandle<T> {
  const scrollRef = useRef<T | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const followRaf = useRef<number | null>(null);
  const hasPinnedRef = useRef(false);
  const lastLineKeyRef = useRef(lineKey);
  // Scroll height as of the previous follow pass. The growth effect runs AFTER
  // the DOM has grown, so a live measureAtBottom(el) there uses the new (larger)
  // scrollHeight against the preserved (old) scrollTop and misreads a reader
  // pinned to the bottom as "scrolled up" whenever a single commit appends more
  // than AT_BOTTOM_THRESHOLD_PX. Measuring against this pre-growth height instead
  // recovers the true pre-growth position (#12348).
  const lastGrowthHeightRef = useRef(0);

  const syncAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(measureAtBottom(el));
  }, []);

  // Track the reader's position so `atBottom` stays truthful as they scroll,
  // independent of thread growth. Passive: this only reads layout. Re-runs on
  // the `enabled` edge because a gated scroller (the overlay thread) mounts in
  // the same commit that enables the engine — the listener must attach then.
  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;
    syncAtBottom();
    el.addEventListener("scroll", syncAtBottom, { passive: true });
    return () => el.removeEventListener("scroll", syncAtBottom);
  }, [syncAtBottom, enabled]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollToBottom(el, !reduceMotion);
    lastGrowthHeightRef.current = el.scrollHeight;
    setAtBottom(true);
  }, [reduceMotion]);

  // Follow thread growth. First growth pins pre-paint so the thread never
  // flashes at the top; later growth coalesces into one rAF and only follows
  // when the reader is already at the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: growthKey/lineKey are the intentional change-triggers; the body reads live layout via the ref.
  useLayoutEffect(() => {
    if (!enabled) {
      // Re-arm so the next enabled pass is a fresh instant pin — a re-opened
      // thread jumps straight to the newest line.
      hasPinnedRef.current = false;
      lastLineKeyRef.current = lineKey;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;

    const isNewLine = lineKey !== lastLineKeyRef.current;
    lastLineKeyRef.current = lineKey;

    const firstPin = !hasPinnedRef.current;
    hasPinnedRef.current = true;

    // Decide follow against the PRE-growth geometry: the DOM has already grown,
    // so measure the reader's position against the previous scroll height (with
    // the preserved scrollTop) instead of a live re-measure that would misread a
    // big single-commit append as "scrolled up". First growth always pins.
    const prevHeight = lastGrowthHeightRef.current;
    const wasAtBottom =
      prevHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD_PX;
    lastGrowthHeightRef.current = el.scrollHeight;

    if (!firstPin && !wasAtBottom) {
      // Reader is scrolled up — do not yank them; just reflect that new content
      // is below so the jump control shows.
      setAtBottom(false);
      return;
    }

    if (!firstPin && isNewLine && !reduceMotion) {
      // A new line while resting at the bottom glides into view rather than
      // teleporting — once per turn, so no rAF coalescing is needed.
      scrollToBottom(el, true);
      lastGrowthHeightRef.current = el.scrollHeight;
      setAtBottom(true);
      return;
    }

    if (followRaf.current != null) cancelAnimationFrame(followRaf.current);
    followRaf.current = requestAnimationFrame(() => {
      followRaf.current = null;
      const node = scrollRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
      lastGrowthHeightRef.current = node.scrollHeight;
      setAtBottom(true);
    });

    return () => {
      if (followRaf.current != null) {
        cancelAnimationFrame(followRaf.current);
        followRaf.current = null;
      }
    };
  }, [growthKey, lineKey, enabled]);

  return { scrollRef, atBottom, jumpToLatest };
}
