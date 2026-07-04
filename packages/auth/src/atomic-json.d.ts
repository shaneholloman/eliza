/**
 * Atomic JSON read/write helpers (node-only).
 *
 * Consolidates the write-tmp + rename pattern duplicated across the agent
 * package for tokens, ledgers, config snapshots, and runtime operations.
 *
 * Defaults:
 *   - mode 0o600 on the written file (secret-grade)
 *   - dir mode 0o700 when the parent has to be created
 *   - JSON 2-space indent, no trailing newline
 *   - tmp filename `${filePath}.tmp-${pid}-${Date.now()}` (multi-process safe)
 *   - parent directory created with mkdir recursive
 *
 * On failure, the temp file is best-effort removed.
 */
export interface WriteJsonAtomicOptions {
    /** File mode for the final file. Default 0o600. */
    mode?: number;
    /** Directory mode if the parent has to be created. Default 0o700. */
    dirMode?: number;
    /** Append a trailing newline. Default false. */
    trailingNewline?: boolean;
    /** `space` arg passed to JSON.stringify. Default 2. */
    indent?: number | string;
    /** Skip mkdir of the parent directory. Default false. */
    skipMkdir?: boolean;
}
export declare function writeJsonAtomic(filePath: string, value: unknown, opts?: WriteJsonAtomicOptions): Promise<void>;
export declare function writeJsonAtomicSync(filePath: string, value: unknown, opts?: WriteJsonAtomicOptions): void;
/**
 * Read and JSON.parse a file. Returns `null` if the file does not exist or
 * cannot be parsed — callers that need the distinction should call
 * `fs.readFile` directly.
 */
export declare function readJsonFile<T>(filePath: string): Promise<T | null>;
export declare function readJsonFileSync<T>(filePath: string): T | null;
//# sourceMappingURL=atomic-json.d.ts.map