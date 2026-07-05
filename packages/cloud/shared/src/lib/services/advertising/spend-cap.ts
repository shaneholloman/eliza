/**
 * Fail-closed parser for advertising spend-cap credit values.
 *
 * Spend caps are allocation gates, so a corrupt persisted NUMERIC must deny the
 * allocation instead of flowing into `requested > NaN`, which is always false.
 */

/** Thrown when a persisted spend cap cannot be parsed to a usable ceiling. */
export class CorruptSpendCapError extends Error {
  constructor(rawValue: unknown) {
    super(
      `Corrupt spend_cap_credits value; refusing to authorize allocation against an unverifiable cap: ${JSON.stringify(
        rawValue,
      )}`,
    );
    this.name = "CorruptSpendCapError";
  }
}

const PLAIN_DECIMAL_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/**
 * Fail-closed boundary for reading a stored spend-cap credit value.
 *
 * The cap is a DB NUMERIC column, so the driver hands it back as a string.
 * `Number(row.spend_cap_credits)` on a corrupt/tampered/legacy-unvalidated row
 * yields NaN, and BOTH spend-cap gates test `requested > cap + 1e-9` with
 * `cap = NaN` that comparison is FALSE, so the cap is silently bypassed and an
 * unbounded credit allocation is authorized against a ceiling the system could
 * not verify (a money-out fail-open). Parsing here throws instead, so a corrupt
 * cap denies the allocation.
 *
 * Callers already short-circuit on a falsy (unset) cap, so this only runs for a
 * present value; a present-but-non-finite or negative value is treated as
 * corrupt. Zero is a legitimate domain value (a hard "no spend" cap).
 */
export function parseSpendCapCredits(rawValue: string | number): number {
  // Reject empty / whitespace-only strings explicitly: `Number("")` and
  // `Number("   ")` are both 0, and a blank cap must never silently read as a
  // legitimate hard no-spend ($0) cap.
  if (typeof rawValue === "string" && rawValue.trim() === "") {
    throw new CorruptSpendCapError(rawValue);
  }
  if (typeof rawValue === "string" && !PLAIN_DECIMAL_RE.test(rawValue.trim())) {
    throw new CorruptSpendCapError(rawValue);
  }
  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CorruptSpendCapError(rawValue);
  }
  return parsed;
}
