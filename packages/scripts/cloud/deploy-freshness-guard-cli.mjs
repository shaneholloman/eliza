#!/usr/bin/env node
/**
 * CLI wrapper for the cloud deploy freshness guard (#14083).
 *
 * Usage (in a deploy job, BEFORE the wrangler deploy step):
 *   node packages/scripts/cloud/deploy-freshness-guard-cli.mjs \
 *     --run-sha "$GITHUB_SHA" \
 *     --served-url "https://staging.elizacloud.ai" \
 *     [--force]
 *
 * Emits `should_deploy=true|false` to $GITHUB_OUTPUT (and reason/detail), so the
 * deploy step can gate on `if: steps.freshness.outputs.should_deploy == 'true'`.
 * Always exits 0 (a signal-fetch failure must not fail the deploy — the guard is
 * fail-open; see decideDeployFreshness).
 *
 * Ancestry is computed with `git merge-base --is-ancestor`. The deploy job's
 * checkout is shallow (`--depth=1`), so this CLI fetches BOTH commits into the
 * repo (best-effort, bounded) before asking git. If either commit can't be
 * fetched, ancestry is reported as `null` and the guard deploys (fail-open).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import {
  decideDeployFreshness,
  fetchServedCommit,
} from "./deploy-freshness-guard.mjs";

function parseArgs(argv) {
  const out = {
    runSha: null,
    servedUrl: null,
    servedCommit: null,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") {
      out.force = true;
    } else if (arg === "--run-sha") {
      i += 1;
      out.runSha = argv[i];
    } else if (arg === "--served-url") {
      i += 1;
      out.servedUrl = argv[i];
    } else if (arg === "--served-commit") {
      i += 1;
      out.servedCommit = argv[i];
    } else if (arg.startsWith("--run-sha=")) {
      out.runSha = arg.slice("--run-sha=".length);
    } else if (arg.startsWith("--served-url=")) {
      out.servedUrl = arg.slice("--served-url=".length);
    } else if (arg.startsWith("--served-commit=")) {
      out.servedCommit = arg.slice("--served-commit=".length);
    }
  }
  return out;
}

function git(args) {
  return execFileSync("git", args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
  })
    .toString()
    .trim();
}

/**
 * Best-effort fetch a commit into the local repo so ancestry can be computed off
 * a shallow deploy checkout. Returns true if the commit is resolvable afterward.
 * @param {string} sha
 */
function ensureCommit(sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    // not present locally — fetch it (unshallow-friendly, bounded)
  }
  try {
    execFileSync("git", ["fetch", "--no-tags", "--depth=50", "origin", sha], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
  } catch {
    // ignore — resolvability re-checked below
  }
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * merge-base --is-ancestor with fetch fallback. Returns true/false when the
 * relationship is determinable, null when it is not (missing commit / git error
 * / unrelated histories).
 * @param {string} runSha
 * @param {string} servedCommit
 * @returns {boolean|null}
 */
function isAncestor(runSha, servedCommit) {
  if (!ensureCommit(runSha) || !ensureCommit(servedCommit)) return null;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", runSha, servedCommit], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
    return true; // exit 0 => is an ancestor
  } catch (err) {
    // exit 1 => not an ancestor; any other exit / no merge-base => undeterminable
    const code = /** @type {{ status?: number }} */ (err)?.status;
    if (code === 1) return false;
    return null;
  }
}

function emitOutput(result) {
  const outFile = process.env.GITHUB_OUTPUT;
  const shouldDeploy = result.decision === "deploy";
  const lines = [
    `should_deploy=${shouldDeploy}`,
    `decision=${result.decision}`,
    `reason=${result.reason}`,
  ];
  if (outFile) {
    fs.appendFileSync(outFile, `${lines.join("\n")}\n`);
  }
  const emoji = shouldDeploy ? "✅" : "⛔";
  console.log(
    `${emoji} deploy-freshness-guard: ${result.decision} (${result.reason})`,
  );
  console.log(`   ${result.detail}`);
  if (result.runSha) console.log(`   runSha=${result.runSha}`);
  if (result.servedCommit)
    console.log(`   servedCommit=${result.servedCommit}`);
}

async function main() {
  const {
    runSha,
    servedUrl,
    servedCommit: servedCommitArg,
    force,
  } = parseArgs(process.argv.slice(2));

  const servedCommit =
    servedCommitArg ?? (servedUrl ? await fetchServedCommit(servedUrl) : null);

  const result = decideDeployFreshness({
    runSha,
    servedCommit,
    force,
    isAncestor,
  });

  emitOutput(result);
  // Always exit 0: the guard signals via should_deploy, never by failing the job.
  process.exit(0);
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // Even an unexpected crash must fail-open: log and deploy.
    console.error(
      "deploy-freshness-guard-cli: unexpected error, failing open (deploy)",
    );
    console.error(err);
    const outFile = process.env.GITHUB_OUTPUT;
    if (outFile) {
      fs.appendFileSync(
        outFile,
        "should_deploy=true\ndecision=deploy\nreason=guard_error\n",
      );
    }
    process.exit(0);
  });
}

export { isAncestor, parseArgs };
