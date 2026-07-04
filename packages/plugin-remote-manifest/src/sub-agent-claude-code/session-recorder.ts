/**
 * PTY sub-agent session recording (SOC2 O-8).
 *
 * Persists a redacted transcript of every spawned session to
 * `~/.eliza/sub-agent-sessions/<session-id>/transcript.log` and emits an
 * `agent.session_record` audit event carrying the content hash + size
 * so the audit pipeline can correlate without storing prompt text.
 *
 * Retention: a background sweep deletes session directories older than
 * `RETENTION_DAYS` (default 30) on `prune()` invocation.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuditDispatcher } from "@elizaos/security";

const SESSIONS_ROOT = process.env.ELIZA_SUB_AGENT_SESSIONS_DIR
  ? process.env.ELIZA_SUB_AGENT_SESSIONS_DIR
  : join(homedir(), ".eliza", "sub-agent-sessions");

const RETENTION_DAYS = Number.parseInt(
  process.env.ELIZA_SUB_AGENT_SESSION_RETENTION_DAYS ?? "30",
  10,
);

/**
 * Redaction patterns — strip the obvious credential shapes before we
 * write anything to disk. This is a coarse pass; combine with workspace
 * isolation rather than relying on it as the only line of defence.
 */
const REDACT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /sk-[A-Za-z0-9_-]{20,}/g, label: "<API_KEY>" },
  {
    re: /[A-Za-z0-9_-]{20,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    label: "<EMAIL>",
  },
  {
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    label: "<EMAIL>",
  },
  { re: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, label: "<GH_TOKEN>" },
  { re: /xox[bpars]-[A-Za-z0-9-]{10,}/g, label: "<SLACK_TOKEN>" },
  { re: /0x[a-fA-F0-9]{40}/g, label: "<ETH_ADDR>" },
  { re: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g, label: "<BTC_ADDR>" },
  { re: /\b\d{13,19}\b/g, label: "<CARD>" },
];

export function redactTranscriptLine(line: string): string {
  let out = line;
  for (const { re, label } of REDACT_PATTERNS) {
    out = out.replace(re, label);
  }
  return out;
}

export interface SessionRecorderOptions {
  sessionId: string;
  auditDispatcher?: AuditDispatcher;
  actorId?: string;
  sessionsRoot?: string;
}

/**
 * Per-session transcript writer. Append lines via `record()`; call
 * `finalize()` on session terminate to emit the audit event.
 */
export class SessionRecorder {
  private readonly dir: string;
  private readonly path: string;
  private readonly hash = createHash("sha256");
  private bytes = 0;
  private finalized = false;
  /**
   * Set on the first disk-write failure. Once set, the on-disk transcript is
   * known to be incomplete, so the digest/byte-count we later hand to the audit
   * pipeline no longer describe a complete artifact. `finalize()` emits a
   * failure audit event in that case instead of a success-shaped one — a
   * partial transcript reported as a healthy record is exactly the
   * swallowed-failure shape #12182 bans.
   */
  private writeFailure: Error | undefined;

  constructor(private readonly opts: SessionRecorderOptions) {
    this.dir = join(opts.sessionsRoot ?? SESSIONS_ROOT, opts.sessionId);
    this.path = join(this.dir, "transcript.log");
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.path, "", "utf8");
  }

  record(line: string): void {
    if (this.finalized) return;
    // Once a write has failed the transcript is already truncated; stop hashing
    // further lines so the digest keeps describing what actually reached disk
    // rather than a stream the audit event will never be able to reproduce.
    if (this.writeFailure) return;
    const safe = redactTranscriptLine(line);
    const withNl = safe.endsWith("\n") ? safe : `${safe}\n`;
    const buf = Buffer.from(withNl, "utf8");
    try {
      // Append the line first, then fold it into the running hash/byte count
      // only on success. Hashing before the write (the previous shape) drifted
      // the digest/byte-count away from the on-disk bytes on any partial
      // failure, producing an audit record for a transcript that never existed.
      writeFileSync(this.path, buf, { flag: "a" });
      this.hash.update(buf);
      this.bytes += buf.byteLength;
    } catch (error) {
      // A disk write failure must not crash the sub-agent, but it must not be
      // silent either: record the first failure so finalize() can flag the
      // transcript as incomplete, and surface it once on stderr (this shared,
      // runtime-less package has no logger/runtime.reportError handle — stderr
      // is the same diagnostic channel the service already uses for its
      // sandbox WARN).
      this.writeFailure =
        error instanceof Error ? error : new Error(String(error));
      process.stderr.write(
        `[sub-agent] WARN: session ${this.opts.sessionId} transcript write failed; audit record will report an incomplete transcript: ${this.writeFailure.message}\n`,
      );
    }
  }

  async finalize(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    const digest = this.hash.digest("hex");
    if (this.opts.auditDispatcher) {
      // A transcript that hit a write failure is incomplete; emit an error
      // result naming the failure instead of a success-shaped record whose hash
      // covers only the bytes that happened to land before the disk gave out.
      const failed = this.writeFailure;
      try {
        await this.opts.auditDispatcher.emit({
          actor: {
            type: this.opts.actorId ? "user" : "system",
            id: this.opts.actorId ?? "agent",
          },
          action: "agent.session_record",
          result: failed ? "failure" : "success",
          resource: { type: "sub-agent.session", id: this.opts.sessionId },
          metadata: {
            session_id: this.opts.sessionId,
            transcript_hash: digest,
            transcript_bytes: this.bytes,
            ...(failed
              ? {
                  transcript_complete: false,
                  transcript_error: failed.message,
                }
              : {}),
          },
        });
      } catch (error) {
        // error-policy:J7 diagnostics-must-not-kill-the-loop — the audit sink
        // failing must not throw out of session teardown, but the drop is
        // observable on the package's stderr diagnostic channel rather than
        // swallowed. The dispatcher itself owns delivery retries.
        const cause = error instanceof Error ? error : new Error(String(error));
        process.stderr.write(
          `[sub-agent] WARN: session ${this.opts.sessionId} audit emit failed; session_record event dropped: ${cause.message}\n`,
        );
      }
    }
  }
}

/**
 * Delete session directories older than `RETENTION_DAYS`. Safe to call
 * fire-and-forget at service start.
 */
export function pruneOldSessions(
  now: number = Date.now(),
  sessionsRoot: string = SESSIONS_ROOT,
): number {
  if (!existsSync(sessionsRoot)) return 0;
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(sessionsRoot, entry.name);
    try {
      const stat = statSync(dir);
      if (stat.mtimeMs < cutoff) {
        rmSync(dir, { recursive: true, force: true });
        removed++;
      }
    } catch (error) {
      // error-policy:J6 best-effort teardown — one un-prunable session dir (a
      // permission or transient FS error) must not abort the rest of the
      // retention sweep, but a persistently stuck dir is a real disk/leak
      // signal, so it is surfaced on stderr rather than silently dropped.
      const cause = error instanceof Error ? error : new Error(String(error));
      process.stderr.write(
        `[sub-agent] WARN: retention prune skipped ${dir}: ${cause.message}\n`,
      );
    }
  }
  return removed;
}

export { RETENTION_DAYS, SESSIONS_ROOT };
