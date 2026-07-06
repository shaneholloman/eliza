# Continuous chat sheet — state × gesture transition matrix

The single source of truth for what every gesture does from every resting state
of the pull-up chat sheet (`ContinuousChatOverlay.tsx`). The e2e continuum suite
(`run-chat-sheet-e2e.mjs`, `runContinuumSuite`) asserts the load-bearing rows.

## Resting states

| State | `data-detent` | `data-chat-state` | Thread height | Notes |
| --- | --- | --- | --- | --- |
| **PILL** | `pill` | `CLOSED` | 0 | White capsule at the bottom; composer inert; taps pass through to home. |
| **INPUT** | `collapsed` | `INPUT` | 0 | Bare composer bar; the default resting state. |
| **HALF** | `half` | `OPEN_HALF_OR_OVER` | `0.46 × viewport` | Comfortable reading height; header visible. |
| **FREE** | `half`/`full` label folds by height | `OPEN_UNDER_HALF` or `OPEN_HALF_OR_OVER` | wherever released | A deliberate slow drag rests where the finger left it (only in the gaps between detents — releases within 64px of a detent snap to it). |
| **FULL** | `full` | `OPEN_HALF_OR_OVER` | `panelMaxH` (sheet under the status bar) | Inset overlay (12px side padding, rounded). |
| **MAXIMIZED** | `full` + `data-maximized` | `MAXIMIZED` | `panelMaxH` | Edge-to-edge full-bleed; grabber replaced by the top restore strip. |

Continuous motion values: `threadHeight` (px, finger-tracked), `openProgress`
(0 = pill capsule ↔ 1 = input bar formed; the liquid-glass morph), `fullBleedT`
(0 = inset ↔ 1 = edge-to-edge shape).

## Gesture vocabulary

- **tap** — release with < 12px movement and no flick velocity.
- **flick** — release ≥ 0.5 px/ms (whole-press or last-segment velocity).
- **slow drag** — deliberate drag released below flick velocity → `onSettleFree` (rests where released, with detent magnetism ±64px).
- **nudge** — small slow movement; springs back to the current state.
- **held drag** — the live finger: `threadHeight` tracks 1:1; past FULL it rubber-bands and drives the maximize morph; past the bottom it drives the input→pill morph.

## Transitions

### From PILL
| Gesture | Result |
| --- | --- |
| Tap | HALF when a thread exists (single tap always opens the chat), else INPUT + keyboard. |
| Flick up (short) | HALF when a thread exists, else INPUT. |
| Held drag up, released anywhere | One continuum: first 120px morphs pill→input (`openProgress`), excess flows into the thread height. Release: < 64px of thread → INPUT; ≥ half+64 → FULL; between → HALF or free rest; a long haul (≥ 80% of the screen) → **MAXIMIZED**. |
| Slow drag up < half the pill morph (`openProgress` < 0.5) | springs back to PILL. |
| Flick/drag down | stays PILL (lowest state). |
| Horizontal swipe | pages home ↔ launcher (sheet closed only). |

### From INPUT
| Gesture | Result |
| --- | --- |
| Tap grabber | HALF when a thread exists, else focuses the composer. |
| Flick up | HALF (or FULL if the held height already passed half+64; MAXIMIZED past the 80%-viewport peak). |
| Slow drag up, released < 64px | springs back to INPUT ("not enough to see a full row"). |
| Slow drag up, released higher | HALF / FULL magnetism, free rest in gaps, MAXIMIZED on a long haul (≥ 80% of the screen). |
| Drag down (morph < halfway) | springs back to INPUT. |
| Drag down (morph ≥ halfway) or flick down | PILL — the input bar visibly scales down into the capsule under the finger. |

### From HALF (and FREE rests)
| Gesture | Result |
| --- | --- |
| Tap grabber | keyboard up → dismiss keyboard to prior state; else collapse to INPUT. |
| Flick up | FULL. |
| Flick down | free rest above half steps to HALF first; at/below half → INPUT. |
| Slow drag | magnetism: ≤ 64px at the bottom → INPUT (PILL when the gesture started above half+64 or overshot the bottom ≥ 40px); near half/full → that detent; gaps → FREE rest. |
| Held over-pull ≥ 75px past FULL, or a long haul from ≤ HALF sweeping ≥ 80% of the screen | MAXIMIZED (the inset→edge-to-edge shape morphs under the finger over the last 150px). |
| Held drag past the bottom ≥ 40px overshoot | PILL (chat → input → pill in one motion). |
| Tap scrim/outside | keyboard up → dismiss keyboard; else collapse to INPUT. |
| Escape | collapse to INPUT. |

### From FULL
Same as HALF, except: flick down steps to HALF (one detent per flick, never
skipping); drag up is pinned (rubber-band) and only the maximize over-pull
continues past it.

### From MAXIMIZED
| Gesture | Result |
| --- | --- |
| Pull down on the top restore strip | drops full-bleed on the first downward frame, then live-tracks: release at ≥ full−64 → FULL (inset); near half → HALF; gaps → FREE; at the bottom (≤ 64) → PILL (the drag started full-height — one big yank puts the chat away). |
| Tap the strip | stays MAXIMIZED. |
| Escape / navigate (Home/Settings) | animates out of full-bleed, collapses to INPUT, then navigates. |
| Upward pull | pinned (stays MAXIMIZED). |

### Non-gesture edges
| Trigger | Result |
| --- | --- |
| Composer focus (typing) | opens to HALF when a thread exists (guarded against boot auto-pop). |
| Send message | at least HALF. |
| Keyboard dismiss (tap grabber/scrim/outside) | returns to the pre-focus state: collapsed-before-focus → INPUT; open-before-focus → stays open at its detent. |
| Onboarding (`firstRunOpen`) | pinned MAXIMIZED and undismissable; falling edge settles to HALF. |
| Viewport rotation / pointer-cancel mid-drag | settles back to the current detent (never strands mid-morph). |

## Invariants

- The panel is ONE persistent element pill ↔ input ↔ chat ↔ full-bleed — no remounts; all morphs are transform/opacity/height (compositor-friendly).
- Only FULL may carry `maximized`; every other landing clears it.
- `openProgress` always settles to 0 (pill) or 1 (anything else) on release — never strands mid-morph.
- Detent changes fire exactly one haptic; sub-threshold releases fire none.
- While maximized the content column keeps `max-w-3xl` — the background morphs edge-to-edge; the text does not reflow.
- Every collapse to INPUT/PILL blurs the composer (keyboard drops).
