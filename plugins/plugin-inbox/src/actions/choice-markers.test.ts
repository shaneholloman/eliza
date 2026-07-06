/**
 * Unit coverage for inbox choice marker command strings. The chat shell sends
 * the selected command back through the planner, so these tests pin the markers
 * to INBOX operations that the action can actually execute.
 */

import { describe, expect, it } from "vitest";
import { appendInboxDraftChoiceMarker } from "./choice-markers.ts";

describe("appendInboxDraftChoiceMarker", () => {
  it("emits only supported INBOX queue operations", () => {
    const text = appendInboxDraftChoiceMarker("Draft ready.", "entry-1");

    expect(text).toContain("inbox approve entry-1=Send");
    expect(text).toContain("inbox archive entry-1=Discard");
    expect(text).not.toContain("inbox edit entry-1");
    expect(text).not.toContain("inbox discard entry-1");
  });
});
