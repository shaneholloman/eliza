import { expect, test } from "bun:test";
import { SUPPORTED_VIDEO_MODELS } from "../ai-pricing-definitions";
import type { PreparedPricingEntry } from "./types";

const { fetchAtlasCloudCatalogEntries } = await import("./providers/atlascloud");

async function collectAtlasVideoGenerationRows(): Promise<PreparedPricingEntry[]> {
  const rows = await fetchAtlasCloudCatalogEntries();
  return rows.filter(
    (row) =>
      row.billingSource === "atlascloud" &&
      row.productFamily === "video" &&
      row.chargeType === "generation",
  );
}

test("every supported Atlas video model has a video:generation pricing row", async () => {
  const atlasVideoModels = SUPPORTED_VIDEO_MODELS.filter(
    (model) => model.billingSource === "atlascloud",
  );
  const rows = await collectAtlasVideoGenerationRows();

  expect(atlasVideoModels.length).toBeGreaterThan(0);
  for (const model of atlasVideoModels) {
    const row = rows.find((candidate) => candidate.model === model.modelId);
    expect(row).toBeDefined();
    expect(row?.unit).toBe("second");
    expect(row?.provider).toBe(model.provider);
    expect(row?.unitPrice ?? 0).toBeGreaterThan(0);
    expect(row?.sourceUrl).toBe(model.pageUrl);
  }
});
