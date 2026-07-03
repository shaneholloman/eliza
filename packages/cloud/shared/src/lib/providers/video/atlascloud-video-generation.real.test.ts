import { describe, expect, test } from "bun:test";
import { generateAtlasCloudVideo } from "./atlascloud-video-generation";

const liveEnabled =
  process.env.TEST_LANE === "post-merge" || process.env.ATLASCLOUD_VIDEO_LIVE_TEST === "1";

describe("Atlas Cloud video provider live", () => {
  test.skipIf(!liveEnabled)("generates a real Atlas-hosted video", async () => {
    const apiKey = process.env.ATLASCLOUD_API_KEY;
    if (!apiKey) {
      throw new Error("ATLASCLOUD_API_KEY is required when Atlas video live tests are enabled");
    }

    const result = await generateAtlasCloudVideo({
      model: process.env.ATLASCLOUD_VIDEO_MODEL ?? "vidu/q3-turbo/text-to-video",
      prompt: "A five second product-style shot of a matte orange cube rotating on a white table",
      durationSeconds: 5,
      resolution: "720p",
      audio: false,
      apiKeys: {
        ATLASCLOUD_API_KEY: apiKey,
        ATLASCLOUD_BASE_URL: process.env.ATLASCLOUD_BASE_URL,
      },
    });

    expect(result.video.url).toMatch(/^https?:\/\//);
    expect(result.video.content_type ?? "video/mp4").toMatch(/^video\//);
  });
});
