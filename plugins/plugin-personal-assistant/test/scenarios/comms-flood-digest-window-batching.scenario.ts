/**
 * D1 comms-flood-triage (live). dre_flood is drowning in low-signal pings and
 * asks the assistant to stop surfacing them one at a time and instead hold them
 * for a single batched digest. The assistant must capture a digest-window
 * preference (batch the non-VIP noise into one check) rather than firing an
 * individual reminder per message. Ports the D1 "digest-window batching" premise
 * (#12281 work-item 2 / #12283 D1 table).
 *
 * Personas-as-data: the batching ask lives in the turn text and the seeded
 * inbox-noise memory, never in `promptInstructions` (root AGENTS.md — one
 * scheduler, structural fields only).
 *
 * OUTCOME (not echo/routing): a definitionCountDelta proves exactly one batched
 * digest record was created (delta:1) with a daily cadence, and the judge grades
 * the load-bearing nuance — batch, do not ping per message.
 */
import { scenario } from "@elizaos/scenario-runner/schema";

export default scenario({
  lane: "live-only",
  id: "comms-flood-digest-window-batching",
  title: "Comms flood: batch the noise into one digest, not a ping per message",
  domain: "lifeops.inbox",
  tags: ["lifeops", "comms-flood", "personas", "12283"],
  status: "active",
  isolation: "per-scenario",
  requires: { plugins: ["@elizaos/plugin-personal-assistant"] },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Comms triage",
    },
  ],
  seed: [
    {
      type: "memory",
      content: {
        text: "Owner fact: dre_flood runs six channels with 300+ messages a day; most of it is low-signal noise they do not want surfaced one at a time.",
      },
    },
  ],
  turns: [
    {
      kind: "message",
      name: "dre asks to batch everything except VIPs into one check",
      text: "stop pinging me for every little thing. just batch everything that isn't a VIP into ONE check at 5pm — i'll deal with the pile then. i don't want twelve separate notifications.",
    },
  ],
  finalChecks: [
    {
      type: "definitionCountDelta",
      title: "digest",
      titleAliases: [
        "batched digest",
        "message digest",
        "5pm digest",
        "daily digest",
        "evening digest",
        "inbox digest",
        "batch check",
      ],
      delta: 1,
      cadenceKind: "daily",
    },
    {
      type: "judgeRubric",
      name: "batches-into-one-digest-not-per-message",
      minimumScore: 0.6,
      rubric:
        "The owner asked the assistant to stop surfacing low-signal messages one at a time and instead hold all non-VIP traffic for a SINGLE batched digest check. Grade PASS only if the assistant set up ONE recurring batched digest (a single grouped check, e.g. once at 5pm) rather than an individual reminder per message, and conveyed that non-VIP noise will be collected and surfaced together instead of pinged individually. Deduct heavily if it created a separate reminder per message, or if it treated this as a one-off rather than a standing batching preference.",
    },
  ],
});
