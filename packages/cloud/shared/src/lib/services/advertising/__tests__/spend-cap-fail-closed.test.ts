/**
 * Fail-closed coverage for advertising spend-cap NUMERIC reads.
 *
 * `spend_cap_credits` is a DB NUMERIC column, so the driver hands it back as a
 * string. Reading it with a bare `Number(...)` produced NaN on a corrupt row,
 * and both spend-cap gates test `requested > cap + 1e-9` with `cap = NaN` that
 * comparison is always FALSE, silently bypassing the cap (a money-out
 * fail-open). These tests pin the parser boundary used by both gates.
 */

import { describe, expect, test } from "bun:test";
import { CorruptSpendCapError, parseSpendCapCredits } from "../spend-cap";

describe("parseSpendCapCredits", () => {
  test("parses healthy stringified NUMERIC values", () => {
    expect(parseSpendCapCredits("100.00")).toBe(100);
    expect(parseSpendCapCredits("0.50")).toBe(0.5);
  });

  test("parses healthy numbers", () => {
    expect(parseSpendCapCredits(42)).toBe(42);
  });

  test("allows an explicit zero cap (hard no-spend)", () => {
    expect(parseSpendCapCredits("0")).toBe(0);
    expect(parseSpendCapCredits(0)).toBe(0);
  });

  test("REGRESSION: throws on a corrupt 'NaN'::numeric string instead of returning NaN", () => {
    expect(() => parseSpendCapCredits("NaN")).toThrow(CorruptSpendCapError);
    expect(Number("NaN")).toBeNaN();
  });

  test("throws on non-numeric garbage", () => {
    expect(() => parseSpendCapCredits("not-a-number")).toThrow(CorruptSpendCapError);
    expect(() => parseSpendCapCredits("100garbage")).toThrow(CorruptSpendCapError);
    expect(() => parseSpendCapCredits("1e3")).toThrow(CorruptSpendCapError);
    expect(() => parseSpendCapCredits("0x10")).toThrow(CorruptSpendCapError);
  });

  test("throws on non-finite / infinity", () => {
    expect(() => parseSpendCapCredits("Infinity")).toThrow(CorruptSpendCapError);
    expect(() => parseSpendCapCredits(Number.POSITIVE_INFINITY)).toThrow(CorruptSpendCapError);
  });

  test("throws on a negative cap", () => {
    expect(() => parseSpendCapCredits("-5")).toThrow(CorruptSpendCapError);
  });

  test("throws on empty / whitespace", () => {
    expect(() => parseSpendCapCredits("   ")).toThrow(CorruptSpendCapError);
  });
});
