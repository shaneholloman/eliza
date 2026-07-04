/**
 * B1 night-owl-anchored-day (live). noor_night's morning brief is anchored to
 * her wake CONFIRMATION, not a clock time — so the message "just woke up, what's
 * on deck" IS the anchor event and must surface the day's brief content in THIS
 * turn, not defer it to a later poll or ask what time it is. Exercises
 * wake-confirmation firing on the personas pack (#12283); maps to LifeOpsBench
 * live.nightowl.wake_confirmation_fires_brief.
 *
 * Personas-as-data: the night-owl framing lives in the turn text, never in
 * `promptInstructions` (root AGENTS.md — one scheduler, structural fields only).
 *
 * OUTCOME (not echo): the judge grades the load-bearing behavior — the brief
 * fires on the wake signal, without a wall-clock question and without scolding
 * the late wake time. The asserted concepts ("brief", "what's on deck") are the
 * agent's derived response, not tokens the check copies from the user turn.
 *
 * Live-verify note (#12781): the exact seeding of the pre-existing wake-anchored
 * brief definition and the fired-content assertion are confirmed at live capture;
 * live-verify defers to the key boundary.
 */
import { scenario } from "@elizaos/scenario-runner/schema";

export default scenario({
  lane: "live-only",
  id: "night-owl-wake-confirmation-fires-brief",
  title:
    "Night owl: 'just woke up' is the anchor event and fires the brief now",
  domain: "lifeops.reminders",
  tags: ["lifeops", "night-owl", "personas", "12283"],
  status: "active",
  isolation: "per-scenario",
  requires: { plugins: ["@elizaos/plugin-personal-assistant"] },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Night owl day",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "noor sets up the wake-anchored brief",
      text: "set me up a daily brief, but anchor it to when i actually get up — the first time i tell you i'm awake, not some fixed hour. i keep really weird hours.",
    },
    {
      kind: "message",
      name: "noor reports she just woke up — the anchor event",
      text: "ok. just got up. what's on deck for me",
      responseJudge: {
        minimumScore: 0.6,
        rubric:
          "The owner earlier asked for a daily brief anchored to her wake confirmation (she keeps irregular night-owl hours). This message ('just got up, what's on deck') IS the wake-confirmation anchor event. Grade PASS only if the assistant treats it as the trigger and surfaces the day's brief / agenda content in THIS turn. It must NOT ask what time it is or cite a wall-clock hour as the reason to (not) fire, and must NOT scold or comment on how late she woke up. Deduct heavily if it defers the brief to a later fixed time or ignores the wake signal.",
      },
    },
  ],
  finalChecks: [
    {
      type: "definitionCountDelta",
      title: "daily brief",
      titleAliases: [
        "brief",
        "morning brief",
        "daily briefing",
        "wake brief",
        "agenda",
      ],
      delta: 1,
      cadenceKind: "daily",
      forbiddenDueLocalTimes: [{ hour: 9, minute: 0 }],
    },
    {
      type: "judgeRubric",
      name: "wake-signal-fires-brief-no-wall-clock",
      minimumScore: 0.6,
      rubric:
        "End-to-end: the assistant created a wake-anchored (not fixed-clock) daily brief, and when the owner said she just got up it delivered the brief content on that wake signal. Grade PASS only if the brief is anchored to her wake event (never pinned to 9am or a default morning hour) AND the wake message actually produced the brief this turn. Deduct heavily if the brief was locked to a fixed clock time or the wake report did not fire it.",
    },
  ],
});
