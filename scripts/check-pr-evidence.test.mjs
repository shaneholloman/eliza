import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  boundRowBlock,
  evaluatePrEvidence,
  extractEvidenceRows,
  hasArtifactReference,
  hasNaWithReason,
  isChecked,
  isRowSatisfied,
  REQUIRED_EVIDENCE_ROWS,
} from "./check-pr-evidence.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(HERE, "..", ".github", "pull_request_template.md");

/**
 * Build a PR body with one marked-up Evidence-Gate row per id. `overrides` maps
 * an evidence-row id to the checkbox line(s) that follow its marker; omitted ids
 * default to a satisfied row.
 */
function buildBody(overrides = {}) {
  const defaults = {
    "before-screenshots":
      "- [ ] Before screenshots `N/A - backend-only change, no UI surface`.",
    "after-screenshots":
      "- [ ] After screenshots `N/A - backend-only change, no UI surface`.",
    "walkthrough-video": "- [x] A video walkthrough of the flow is attached.",
    "backend-logs":
      "- [ ] Backend logs: see .github/issue-evidence/13622-backend.txt",
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

describe("check-pr-evidence parser", () => {
  it("passes when every evidence row is filled (artifact / checked / N/A-reason)", () => {
    const { ok, findings } = evaluatePrEvidence(buildBody());
    assert.equal(ok, true);
    assert.ok(findings.every((f) => f.status === "ok"));
  });

  it("fails on a single blank row (unchecked boilerplate, no artifact, no N/A)", () => {
    const { ok, findings } = evaluatePrEvidence(
      buildBody({
        "backend-logs":
          "- [ ] Backend logs show the real code path firing end to end, or are marked `N/A - <reason>`.",
      }),
    );
    assert.equal(ok, false);
    const row = findings.find((f) => f.id === "backend-logs");
    assert.equal(row.status, "blank");
    // The other rows stay ok — one blank row does not poison the rest.
    assert.equal(
      findings.filter((f) => f.status === "ok").length,
      REQUIRED_EVIDENCE_ROWS.length - 1,
    );
  });

  it("passes when every row is marked `N/A - <reason>` with a concrete reason", () => {
    const body = REQUIRED_EVIDENCE_ROWS.map(
      ({ id }) =>
        `<!-- evidence-row:${id} -->\n- [ ] row \`N/A - not applicable to this change\`.`,
    ).join("\n\n");
    const { ok } = evaluatePrEvidence(body);
    assert.equal(ok, true);
  });

  it("fails on a bare `N/A` with no reason", () => {
    const { ok, findings } = evaluatePrEvidence(
      buildBody({ "backend-logs": "- [ ] Backend logs N/A" }),
    );
    assert.equal(ok, false);
    assert.equal(findings.find((f) => f.id === "backend-logs").status, "blank");
  });

  it("reports a required row as `missing` when its marker is absent", () => {
    const body = REQUIRED_EVIDENCE_ROWS.slice(1)
      .map(({ id }) => `<!-- evidence-row:${id} -->\n- [x] done`)
      .join("\n\n");
    const { ok, findings } = evaluatePrEvidence(body);
    assert.equal(ok, false);
    assert.equal(
      findings.find((f) => f.id === "before-screenshots").status,
      "missing",
    );
  });

  it("treats an empty body as all-missing (fails closed)", () => {
    const { ok, findings } = evaluatePrEvidence("");
    assert.equal(ok, false);
    assert.ok(findings.every((f) => f.status === "missing"));
  });
});

describe("check-pr-evidence row-satisfaction primitives", () => {
  it("hasNaWithReason accepts `-`, `:`, and dash separators with a real reason", () => {
    assert.equal(hasNaWithReason("N/A - backend-only, no UI"), true);
    assert.equal(hasNaWithReason("N/A: nothing to show here"), true);
    assert.equal(hasNaWithReason("N/A \u2014 no domain artifacts"), true);
    assert.equal(hasNaWithReason("NA - agent change only"), true);
  });

  it("hasNaWithReason rejects bare or reasonless N/A", () => {
    assert.equal(hasNaWithReason("N/A"), false);
    assert.equal(hasNaWithReason("N/A -"), false);
    assert.equal(hasNaWithReason("N/A - "), false);
    assert.equal(hasNaWithReason("some prose without na"), false);
  });

  it("hasArtifactReference detects links, URLs, and issue-evidence paths", () => {
    assert.equal(hasArtifactReference("[report](https://x/y.json)"), true);
    assert.equal(
      hasArtifactReference("see https://github.com/o/r/assets/1"),
      true,
    );
    assert.equal(
      hasArtifactReference(
        "committed under .github/issue-evidence/13622-a.png",
      ),
      true,
    );
    assert.equal(hasArtifactReference("just some words, no artifact"), false);
  });

  it("isChecked recognises a ticked checkbox only", () => {
    assert.equal(isChecked("- [x] done"), true);
    assert.equal(isChecked("- [X] done"), true);
    assert.equal(isChecked("- [ ] not done"), false);
  });

  it("isRowSatisfied requires checked OR N/A-reason OR artifact", () => {
    assert.equal(isRowSatisfied("- [x] anything"), true);
    assert.equal(isRowSatisfied("- [ ] `N/A - not applicable`"), true);
    assert.equal(isRowSatisfied("- [ ] [proof](https://e/x.png)"), true);
    assert.equal(
      isRowSatisfied(
        "- [ ] Before full-page screenshots ... or marked `N/A - <reason>`.",
      ),
      false,
      "unedited boilerplate (the literal <reason> placeholder) must not satisfy the gate",
    );
  });
});

describe("check-pr-evidence marker extraction", () => {
  it("captures the checkbox line plus indented continuation lines per marker", () => {
    const body = [
      "<!-- evidence-row:backend-logs -->",
      "- [ ] Backend logs show the real code path firing end to end,",
      "      or are marked `N/A - no backend path in this change`.",
      "",
      "<!-- evidence-row:frontend-logs -->",
      "- [x] Frontend logs attached.",
    ].join("\n");
    const rows = extractEvidenceRows(body);
    assert.ok(rows.get("backend-logs").includes("N/A - no backend path"));
    assert.ok(rows.get("frontend-logs").includes("[x]"));
  });

  it("bounds the last row's block so trailing sections/links do not bleed in", () => {
    // The last marker runs to EOF; a link in a section below must NOT satisfy
    // the (blank) row above it.
    const body = [
      "<!-- evidence-row:domain-artifacts -->",
      "- [ ] Domain artifacts are attached where applicable, or marked `N/A - <reason>`.",
      "",
      "# Evidence Details",
      "",
      "See [the runner](https://example.com/report.json) and `bun run test:e2e:record`.",
    ].join("\n");
    const rows = extractEvidenceRows(body);
    assert.ok(!rows.get("domain-artifacts").includes("example.com"));
    assert.equal(isRowSatisfied(rows.get("domain-artifacts")), false);
  });

  it("boundRowBlock stops at the first blank line / heading", () => {
    const block = [
      "- [ ] row text",
      "      continued indented line",
      "",
      "# not part of the row",
      "https://example.com/should-not-be-captured",
    ].join("\n");
    const bounded = boundRowBlock(block);
    assert.ok(bounded.includes("continued indented line"));
    assert.ok(!bounded.includes("example.com"));
  });
});

describe("check-pr-evidence against the real PR template", () => {
  it("carries a marker for every required evidence row", () => {
    const template = readFileSync(TEMPLATE_PATH, "utf8");
    const rows = extractEvidenceRows(template);
    for (const { id } of REQUIRED_EVIDENCE_ROWS) {
      assert.ok(rows.has(id), `template is missing marker evidence-row:${id}`);
    }
  });

  it("fails the unedited template (all rows are `<reason>` boilerplate)", () => {
    const template = readFileSync(TEMPLATE_PATH, "utf8");
    const { ok, findings } = evaluatePrEvidence(template);
    assert.equal(ok, false);
    // Every row of the pristine template is unfilled boilerplate.
    assert.ok(findings.every((f) => f.status === "blank"));
  });
});
