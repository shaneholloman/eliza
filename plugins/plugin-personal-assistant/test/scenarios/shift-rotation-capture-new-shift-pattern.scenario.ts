/**
 * B2 shift-rotation (live-only, T1 capture). The rotating-shift persona (P3
 * marcus_shift) states his new rotation in his own schedule-literate voice ("on
 * nights starting Monday") and asks for a post-shift routine reminder. The
 * assistant must EXTRACT a structured recurring reminder anchored to his shift
 * hours — not park it at a naive clock default and not schedule it inside the
 * daytime sleep his night shift protects. Conversational competence is graded by
 * a live judge; the capture is proved STRUCTURALLY by a definition-count delta
 * that requires the reminder to exist and to avoid his protected sleep window.
 *
 * Non-echo: the graded structural token is the created definition's due-local
 * time (it must NOT land in his 06:00–14:00 daytime sleep) — a derived schedule
 * fact he never states as a due time, so an echo of his words cannot satisfy it.
 * The seeded owner facts establish the protected daytime sleep so the "not during
 * sleep" check is meaningful.
 *
 * Live gate: needs a live model for the capture turn; its per-scenario
 * live-model trajectory is the remaining evidence gate (captured where model
 * credentials are available, per PR_EVIDENCE.md).
 */

import type { ScenarioContext } from "@elizaos/scenario-runner/schema";
import { scenario } from "@elizaos/scenario-runner/schema";

async function seedNightSleepFacts(
  ctx: ScenarioContext,
): Promise<string | undefined> {
  const { resolveOwnerFactStore } = await import(
    "@elizaos/plugin-personal-assistant/plugin"
  );
  const store = resolveOwnerFactStore(
    ctx.runtime as unknown as Parameters<typeof resolveOwnerFactStore>[0],
  );
  // Night shift: waking window in the evening/night; protected sleep is the
  // daytime block. This is what a shift-aware capture must avoid scheduling into.
  await store.update(
    {
      timezone: "UTC",
      morningWindow: { startLocal: "16:00", endLocal: "19:00" },
      eveningWindow: { startLocal: "23:00", endLocal: "05:00" },
      quietHours: { startLocal: "06:00", endLocal: "14:00", timezone: "UTC" },
    },
    { source: "profile_save", recordedAt: new Date().toISOString() },
  );
  return undefined;
}

export default scenario({
  lane: "live-only",
  id: "shift-rotation-capture-new-shift-pattern",
  title:
    "Capture a shift-aware post-clock-out reminder from a plain 'on nights starting Monday' statement, never scheduling it into protected daytime sleep",
  domain: "lifeops",
  tags: [
    "lifeops",
    "shift-rotation",
    "personas",
    "reminders",
    "capture",
    "outcome",
    "12772",
  ],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-personal-assistant"],
  },
  seed: [
    {
      type: "custom",
      name: "seed night-shift owner facts (protected daytime sleep)",
      apply: seedNightSleepFacts,
    },
  ],
  rooms: [
    {
      id: "main",
      source: "dashboard",
      title: "Shift Rotation Capture",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "capture-shift-aware-reminder",
      room: "main",
      text: "I'm on nights starting Monday — I clock out at 07:30. Set me a daily reminder to log my patient-handoff notes about an hour after I get off, and don't put it in the middle of my sleep.",
      // The reminder is anchored to his post-shift hour, not a wall-clock guess;
      // the assistant must confirm the capture without claiming it also already
      // notified anyone.
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must confirm a daily patient-handoff-notes reminder anchored to about an hour after his 07:30 clock-out (i.e. in his post-shift morning, ~08:30), explicitly respecting that his sleep is during the day. It must NOT propose a mid-day time that lands in his daytime sleep, must NOT ask him to re-enter his whole schedule, and must NOT claim it has already logged or sent the notes. A generic 'reminder created' with no shift awareness, or one scheduled into his sleep, fails.",
      },
    },
  ],
  finalChecks: [
    {
      type: "definitionCountDelta",
      title: "log patient-handoff notes",
      titleAliases: [
        "patient handoff notes",
        "handoff notes",
        "patient-handoff notes",
        "log handoff notes",
      ],
      delta: 1,
      cadenceKind: "daily",
      // Non-echo structural proof: the created reminder must NOT be due inside
      // his protected daytime sleep (06:00–14:00). His clock-out (07:30) and the
      // requested "~an hour after" (~08:30) fall in his post-shift waking
      // window, so a correct capture avoids these forbidden daytime-sleep hours.
      forbiddenDueLocalTimes: [
        { hour: 9, timeZone: "UTC" },
        { hour: 10, timeZone: "UTC" },
        { hour: 11, timeZone: "UTC" },
        { hour: 12, timeZone: "UTC" },
        { hour: 13, timeZone: "UTC" },
      ],
      expectedTimeZone: "UTC",
    },
    {
      type: "memoryWriteOccurred",
      table: "messages",
      minCount: 1,
    },
    {
      type: "judgeRubric",
      name: "shift-capture-anchoring",
      minimumScore: 0.7,
      rubric:
        "End-to-end: the assistant captured a daily reminder anchored to Marcus's post-shift hour rather than a wall-clock default, kept it out of his protected daytime sleep, and did not claim to have already performed the handoff itself.",
    },
  ],
});
