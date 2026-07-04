#!/usr/bin/env node
/**
 * Mechanically enforce the PR Evidence Gate (issue #13622).
 *
 * `PR_EVIDENCE.md` and `.github/pull_request_template.md` define a binding
 * "Definition of Done": every Evidence-Gate row must carry a real artifact
 * (screenshot / video / logs / trajectory / domain artifact) OR an explicit
 * `N/A - <reason>`. That standard was pure honor-system — nothing parsed the PR
 * body, so a PR could leave every evidence row blank (or silently drop the rows)
 * and merge. This script closes that gap: it parses a PR body and fails when any
 * required evidence row is blank (unchecked boilerplate with no artifact and no
 * `N/A - <reason>`) or missing entirely.
 *
 * Robustness: the parser keys on the stable `<!-- evidence-row:<id> -->` HTML
 * comment markers injected into the template ABOVE each Evidence-Gate checkbox,
 * NOT on the human-readable row prose (which is free to be reworded). A marker
 * comment is invisible in the rendered PR, so authors never see it; the parser
 * always finds it.
 *
 * A row is SATISFIED when any of the following hold within the row's text block
 * (the checkbox line plus its indented continuation lines, up to the next marker
 * / heading / blank line):
 *   - the checkbox is ticked (`- [x]`), OR
 *   - it contains an explicit `N/A - <reason>` with a non-empty reason, OR
 *   - it references a real artifact: a markdown link `[text](url)`, a bare
 *     http(s) URL, a GitHub attachment (`user-images.githubusercontent.com`,
 *     `github.com/.../assets/...`), or an `.github/issue-evidence/...` path.
 *
 * A row FAILS when it is still the unedited template boilerplate: an unchecked
 * `- [ ]` with no `N/A - <reason>` and no artifact reference. A required marker
 * that is absent from the body also fails (the template was stripped).
 *
 * Usage:
 *   node scripts/check-pr-evidence.mjs --body-file <path>   # read PR body from a file
 *   echo "$PR_BODY" | node scripts/check-pr-evidence.mjs     # read PR body from stdin
 *   node scripts/check-pr-evidence.mjs --json               # machine-readable findings
 *   node scripts/check-pr-evidence.mjs --self-test          # planted-fixture self-check
 *
 * Exit code 0 = all required evidence rows satisfied; 1 = one or more blank /
 * missing; 2 = usage / input error.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Required Evidence-Gate rows, keyed by the id embedded in the template's
 * `<!-- evidence-row:<id> -->` markers. `label` is only used for human-readable
 * failure messages.
 */
export const REQUIRED_EVIDENCE_ROWS = [
  { id: "before-screenshots", label: "Before screenshots" },
  { id: "after-screenshots", label: "After screenshots" },
  { id: "walkthrough-video", label: "Walkthrough video" },
  { id: "backend-logs", label: "Backend logs" },
  { id: "frontend-logs", label: "Frontend console/network logs" },
  { id: "llm-trajectory", label: "Real-LLM trajectory" },
  { id: "domain-artifacts", label: "Domain artifacts" },
];

const MARKER_RE = /<!--\s*evidence-row:([a-z0-9-]+)\s*-->/gi;

/**
 * Return true if `text` marks the row as not-applicable with a concrete reason,
 * i.e. `N/A - <reason>` (or `N/A: <reason>` / `N/A — <reason>`) where the reason
 * is non-empty. A bare `N/A` with no reason does NOT satisfy the gate.
 */
export function hasNaWithReason(text) {
  // Accept `-`, `:`, en/em dash as the separator; require >= 3 non-space chars
  // of reason after it so a bare "N/A" or "N/A -" is rejected.
  const m = text.match(/\bN\/?A\b\s*[-:\u2013\u2014]\s*(\S[\s\S]*?)(?:$)/im);
  if (!m) return false;
  const reason = m[1].trim();
  if (reason.length < 3) return false;
  // Reject the unedited template placeholder `<reason>` (and any bare
  // angle-bracket placeholder) so the boilerplate row does NOT satisfy the gate.
  const stripped = reason.replace(/[`*_]+/g, "").trim();
  if (/^<[^>]*>[.\s]*$/.test(stripped)) return false;
  return true;
}

/**
 * Return true if `text` references a real evidence artifact: a markdown link, a
 * bare http(s) URL, a GitHub attachment host, or an `.github/issue-evidence/`
 * path.
 */
export function hasArtifactReference(text) {
  // Markdown link [label](target) with a non-empty target.
  if (/\[[^\]]*\]\(\s*\S+\s*\)/.test(text)) return true;
  // Bare http(s) URL.
  if (/https?:\/\/\S+/i.test(text)) return true;
  // GitHub drag-and-drop attachment hosts (covered by the URL check too, but
  // kept explicit for clarity / future non-URL forms).
  if (
    /user-images\.githubusercontent\.com|github\.com\/[^)\s]+\/assets\//i.test(
      text,
    )
  )
    return true;
  // Committed evidence path.
  if (/\.github\/issue-evidence\/\S+/i.test(text)) return true;
  return false;
}

/**
 * Return true if the checkbox on the row's first line is ticked (`- [x]`).
 */
export function isChecked(rowText) {
  return /^\s*[-*]\s*\[\s*[xX]\s*\]/m.test(rowText);
}

/**
 * A row is satisfied when it is checked, carries an `N/A - <reason>`, or
 * references an artifact.
 */
export function isRowSatisfied(rowText) {
  return (
    isChecked(rowText) ||
    hasNaWithReason(rowText) ||
    hasArtifactReference(rowText)
  );
}

/**
 * Split `body` into a map of `markerId -> rowText`. `rowText` for a marker is
 * the checkbox line immediately after the marker plus its indented continuation
 * lines, bounded at the first blank line, heading, next list item, or next
 * evidence marker. Bounding to the checkbox's own block (rather than running to
 * the next marker / EOF) keeps unrelated links/URLs in the sections BELOW the
 * last row from bleeding into that row and falsely satisfying it.
 */
export function extractEvidenceRows(body) {
  const rows = new Map();
  const matches = [];
  for (const match of (body ?? "").matchAll(MARKER_RE)) {
    const start = match.index;
    matches.push({
      id: match[1].toLowerCase(),
      start,
      end: start + match[0].length,
    });
  }
  for (let i = 0; i < matches.length; i += 1) {
    const cur = matches[i];
    const next = matches[i + 1];
    const sliceEnd = next ? next.start : (body ?? "").length;
    const block = body.slice(cur.end, sliceEnd);
    const rowText = boundRowBlock(block);
    if (!rows.has(cur.id) || rowText.length > 0) {
      rows.set(cur.id, rowText);
    }
  }
  return rows;
}

/**
 * Given the text between one evidence marker and the next (or EOF), return only
 * the row's own block: the first checkbox line and its indented continuation
 * lines, stopping at the first blank line, heading (`#`), or a subsequent
 * top-level list item / marker comment.
 */
export function boundRowBlock(block) {
  const lines = block.split(/\r?\n/);
  const out = [];
  let started = false;
  for (const line of lines) {
    if (!started) {
      if (line.trim() === "") continue; // skip leading blanks after the marker
      started = true;
      out.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "") break; // blank line ends the row block
    if (/^#/.test(trimmed)) break; // heading ends the block
    if (/<!--\s*evidence-row:/i.test(trimmed)) break; // next marker
    // A new top-level checkbox / list item ends this row's block; an indented
    // continuation (leading whitespace) belongs to the current row.
    if (/^[-*]\s/.test(line) && !/^\s/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Evaluate a PR body against the required evidence rows.
 * Returns `{ ok, findings }` where each finding is
 * `{ id, label, status: "ok" | "blank" | "missing" }`.
 */
export function evaluatePrEvidence(
  body,
  requiredRows = REQUIRED_EVIDENCE_ROWS,
) {
  const rows = extractEvidenceRows(body ?? "");
  const findings = requiredRows.map(({ id, label }) => {
    if (!rows.has(id)) return { id, label, status: "missing" };
    const rowText = rows.get(id);
    if (rowText.length === 0) return { id, label, status: "blank" };
    return {
      id,
      label,
      status: isRowSatisfied(rowText) ? "ok" : "blank",
    };
  });
  const ok = findings.every((f) => f.status === "ok");
  return { ok, findings };
}

function readBody(args) {
  const idx = args.indexOf("--body-file");
  if (idx !== -1) {
    const file = args[idx + 1];
    if (!file) {
      console.error("--body-file requires a path argument");
      process.exit(2);
    }
    return readFileSync(file, "utf8");
  }
  // Fall back to stdin.
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function usage() {
  console.log(`Usage: node scripts/check-pr-evidence.mjs [options]

Options:
  --body-file <path>  Read the PR body from a file (default: stdin).
  --json              Print machine-readable findings JSON.
  --self-test         Run the planted-fixture self-check.
  --help, -h          Show this help.
`);
}

// ---------------------------------------------------------------------------
// Self-test: planted fixtures (all-filled -> pass, one-blank -> fail,
// N/A - reason -> pass). Mirrors the unit test but runs without a test harness
// so CI can invoke it as a standalone guard if desired.
// ---------------------------------------------------------------------------

function buildFixtureBody(overrides = {}) {
  const defaults = {
    "before-screenshots":
      "- [ ] Before screenshots ... `N/A - backend-only change, no UI surface`.",
    "after-screenshots":
      "- [ ] After screenshots ... `N/A - backend-only change, no UI surface`.",
    "walkthrough-video": "- [x] A video walkthrough is attached.",
    "backend-logs":
      "- [ ] Backend logs: see .github/issue-evidence/13622-logs.txt",
    "frontend-logs": "- [ ] Frontend logs `N/A - no frontend change`.",
    "llm-trajectory":
      "- [ ] Real-LLM trajectory: [report](https://example.com/report.json)",
    "domain-artifacts":
      "- [ ] Domain artifacts `N/A - no domain artifacts produced`.",
  };
  const merged = { ...defaults, ...overrides };
  return REQUIRED_EVIDENCE_ROWS.map(
    ({ id }) => `<!-- evidence-row:${id} -->\n${merged[id] ?? ""}`,
  ).join("\n\n");
}

function runSelfTest() {
  const failures = [];

  // 1. all-filled -> pass
  {
    const { ok } = evaluatePrEvidence(buildFixtureBody());
    if (!ok) failures.push("all-filled fixture should pass");
  }

  // 2. one blank (unchecked boilerplate, no artifact, no N/A) -> fail
  {
    const { ok, findings } = evaluatePrEvidence(
      buildFixtureBody({
        "backend-logs":
          "- [ ] Backend logs show the real code path firing end to end, or are marked `N/A - <reason>`.",
      }),
    );
    const blank = findings.find((f) => f.id === "backend-logs");
    if (ok) failures.push("one-blank fixture should fail");
    if (blank?.status !== "blank")
      failures.push("blank row should be reported blank");
  }

  // 3. N/A - reason on every row -> pass
  {
    const naBody = REQUIRED_EVIDENCE_ROWS.map(
      ({ id }) =>
        `<!-- evidence-row:${id} -->\n- [ ] row \`N/A - not applicable to this change\`.`,
    ).join("\n\n");
    const { ok } = evaluatePrEvidence(naBody);
    if (!ok) failures.push("all-N/A-with-reason fixture should pass");
  }

  // 4. bare N/A (no reason) -> fail
  {
    const { ok } = evaluatePrEvidence(
      buildFixtureBody({ "backend-logs": "- [ ] Backend logs N/A" }),
    );
    if (ok) failures.push("bare N/A (no reason) should fail");
  }

  // 5. missing marker -> fail
  {
    const partial = REQUIRED_EVIDENCE_ROWS.slice(1)
      .map(({ id }) => `<!-- evidence-row:${id} -->\n- [x] done`)
      .join("\n\n");
    const { ok, findings } = evaluatePrEvidence(partial);
    const missing = findings.find((f) => f.id === "before-screenshots");
    if (ok) failures.push("missing-marker fixture should fail");
    if (missing?.status !== "missing")
      failures.push("absent row should be reported missing");
  }

  if (failures.length > 0) {
    console.error("check-pr-evidence self-test FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("check-pr-evidence self-test passed (5 cases).");
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }
  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const body = readBody(args);
  const { ok, findings } = evaluatePrEvidence(body);

  if (args.includes("--json")) {
    console.log(JSON.stringify({ ok, findings }, null, 2));
  } else {
    for (const f of findings) {
      const symbol = f.status === "ok" ? "ok  " : "FAIL";
      console.log(`  [${symbol}] ${f.label} (${f.id}): ${f.status}`);
    }
  }

  if (!ok) {
    const bad = findings.filter((f) => f.status !== "ok");
    console.error(
      `\nEvidence gate FAILED: ${bad.length} row(s) blank or missing. ` +
        "Attach an artifact or write `N/A - <reason>` on each blank row, and " +
        "keep the template's evidence rows intact.",
    );
    process.exit(1);
  }
  console.log("\nEvidence gate passed: all required rows satisfied.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
