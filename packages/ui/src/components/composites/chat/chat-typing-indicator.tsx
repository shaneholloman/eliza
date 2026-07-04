/**
 * The one typing/working indicator for every chat surface (#12188 Phase 3).
 * `TypingIndicator` is the pending-reply bubble (panel `default` and
 * `game-modal` skins, used by ChatView and the homescreen ChatSurface);
 * `TurnStatus` is the phase-aware variant the continuous-chat overlay shows
 * while the agent works — breathing dots plus a debounced phase label
 * ("Replying", "Running <action>", …). All three render paths share the single
 * `TypingDots` triad so there is exactly one dots implementation.
 *
 * Brand rule: orange (the accent) tints TurnStatus ONLY for `speaking`; every
 * other phase is neutral. No blue anywhere.
 */
import { useEffect, useRef, useState } from "react";

import type { ChatTurnStatus } from "../../../api/client-types-chat";
import { cn } from "../../../lib/utils";
import { ChatBubble } from "./chat-bubble";
import type { ChatVariant } from "./chat-types";

/** The shared three-dot triad. Purely presentational; each consumer passes its
 * own dot skin + stagger so the three surface designs stay pixel-stable. */
function TypingDots({
  className,
  dotClassName,
  delaysMs,
  testId,
}: {
  className: string;
  dotClassName: string;
  delaysMs: readonly [number, number, number];
  testId?: string;
}) {
  return (
    <span className={className} data-testid={testId} aria-hidden="true">
      {delaysMs.map((delay) => (
        <span
          key={delay}
          className={dotClassName}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

export interface TypingIndicatorProps {
  agentName: string;
  className?: string;
  variant?: ChatVariant;
}

export function TypingIndicator({
  agentName,
  className,
  variant = "default",
}: TypingIndicatorProps) {
  if (variant === "game-modal") {
    return (
      <div
        className={className ?? "flex w-full justify-start"}
        role="status"
        aria-live="polite"
        aria-label={`${agentName} is typing`}
      >
        <ChatBubble
          tone="assistant"
          className="flex max-w-[min(85%,24rem)] items-center gap-1 rounded-sm px-4 py-3"
        >
          <TypingDots
            className="flex items-center gap-1"
            dotClassName="h-1.5 w-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--muted)_82%,transparent)] animate-bounce"
            delaysMs={[0, 150, 300]}
          />
        </ChatBubble>
      </div>
    );
  }

  return (
    <div className={className ?? "mt-1.5 flex min-w-0 flex-col"}>
      <div className="mb-0.5 text-xs font-semibold text-accent">
        {agentName}
      </div>
      <TypingDots
        className="flex gap-1 py-1"
        dotClassName="h-2 w-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
        delaysMs={[0, 200, 400]}
      />
    </div>
  );
}

/** Humanize an action/tool symbol ("SEND_MESSAGE" → "Send message") for the
 *  status label so it reads as prose, not a constant. */
function humanizeStatusName(name: string): string {
  const cleaned = name.trim().replace(/[_-]+/g, " ").toLowerCase();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** The phase label shown beside the breathing dots. Server-provided `label`
 *  always wins; otherwise derive a concise phrase from the kind (+ action/tool
 *  name when present). */
export function turnStatusLabel(status: ChatTurnStatus): string {
  if (status.label?.trim()) return status.label.trim();
  switch (status.kind) {
    case "thinking":
      return "Thinking";
    case "streaming":
      return "Replying";
    case "running_action":
      return status.actionName
        ? `Running ${humanizeStatusName(status.actionName)}`
        : "Working";
    case "running_tool":
      return status.toolName
        ? `Using ${humanizeStatusName(status.toolName)}`
        : "Using a tool";
    case "evaluating":
      return "Reflecting";
    case "waking":
      return "Waking the agent";
    case "speaking":
      return "Speaking";
  }
}

// Min time (ms) a phase label must stay on screen before the next one replaces
// it. Without this, a fast thinking→action→streaming sequence flickers through
// labels faster than the eye can read. The text content the user sees is
// debounced; the dots animate continuously throughout.
const STATUS_MIN_DWELL_MS = 320;

/** Debounce a fast-changing status to a min on-screen dwell so a rapid
 *  thinking→action→streaming sequence doesn't strobe the label. The dots animate
 *  continuously; only the words wait their turn. Returns null when status is
 *  null (between turns). */
function useDebouncedTurnStatus(
  status: ChatTurnStatus | null,
): ChatTurnStatus | null {
  const [shown, setShown] = useState<ChatTurnStatus | null>(status);
  const lastChangeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!status) {
      setShown(null);
      return;
    }
    const now = Date.now();
    const elapsed = now - lastChangeRef.current;
    if (elapsed >= STATUS_MIN_DWELL_MS) {
      lastChangeRef.current = now;
      setShown(status);
      return;
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      lastChangeRef.current = Date.now();
      setShown(status);
      timerRef.current = null;
    }, STATUS_MIN_DWELL_MS - elapsed);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status]);
  return shown;
}

/**
 * The breathing dots + phase label of the working-status indicator, WITHOUT a
 * bubble/motion wrapper — the overlay wraps it in its own glass chrome and also
 * renders it bare inside the in-flight assistant bubble.
 *
 * Mirrors ChatVoiceStatusBar's a11y (`role="status"` + `aria-live="polite"`).
 * Honors reduced motion (no pulse). Degrades to plain dots when no status has
 * arrived.
 */
export function TurnStatus({
  status,
  showLabel = true,
}: {
  status: ChatTurnStatus | null;
  showLabel?: boolean;
}) {
  const shown = useDebouncedTurnStatus(status);
  const speaking = shown?.kind === "speaking";
  const label =
    showLabel && shown && shown.kind !== "thinking"
      ? turnStatusLabel(shown)
      : null;
  return (
    <span
      className="inline-flex items-center gap-2"
      data-testid="turn-status-indicator"
      data-status-kind={shown?.kind ?? "none"}
      role="status"
      aria-live="polite"
    >
      <TypingDots
        className="flex gap-1.5"
        dotClassName={cn(
          "h-1.5 w-1.5 animate-pulse rounded-full motion-reduce:animate-none",
          speaking ? "bg-[rgba(255,190,140,0.9)]" : "bg-white/70",
        )}
        delaysMs={[0, 180, 360]}
        testId="typing-dots"
      />
      {label ? (
        <span
          className={cn(
            "text-[13px] font-medium",
            speaking ? "text-[rgba(255,200,150,0.95)]" : "text-white/90",
          )}
          data-testid="turn-status-label"
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
