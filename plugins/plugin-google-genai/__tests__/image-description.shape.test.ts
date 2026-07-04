/**
 * Unit tests for `handleImageDescription`: the JSON and prose parse paths plus
 * the failure paths that must surface as typed errors instead of a fabricated
 * `{ title, description }` result — uninitialized client, image fetch failure,
 * provider (`generateContent`) rejection, and an empty model completion. The
 * config, tokenization, `recordLlmCall`, and global `fetch` layers are mocked;
 * no live model or network call is made.
 */
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGoogleGenAI: vi.fn(),
  generateContent: vi.fn(),
  countTokens: vi.fn(),
  recordLlmCall: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
  recordLlmCall: mocks.recordLlmCall,
}));

vi.mock("../utils/config", () => ({
  createGoogleGenAI: mocks.createGoogleGenAI,
  getImageModel: vi.fn(() => "gemini-2.0-flash"),
  getSafetySettings: vi.fn(() => []),
}));

vi.mock("../utils/tokenization", () => ({
  countTokens: mocks.countTokens,
}));

import { handleImageDescription } from "../models/image";

function createRuntime(): IAgentRuntime {
  return {
    getSetting: vi.fn(() => null),
  } as unknown as IAgentRuntime;
}

function mockFetchOk() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    statusText: "OK",
    headers: { get: () => "image/png" },
    arrayBuffer: async () => new ArrayBuffer(8),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Google GenAI image description", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.countTokens.mockResolvedValue(5);
    // recordLlmCall just runs the wrapped work and returns its result.
    mocks.recordLlmCall.mockImplementation(async (_runtime, _details, fn) =>
      fn(),
    );
    mocks.createGoogleGenAI.mockReturnValue({
      models: { generateContent: mocks.generateContent },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the model's JSON title/description on success", async () => {
    mockFetchOk();
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({
        title: "A cat",
        description: "A ginger cat on a sofa.",
      }),
    });

    const result = await handleImageDescription(
      createRuntime(),
      "https://example.com/cat.png",
    );

    expect(result).toEqual({
      title: "A cat",
      description: "A ginger cat on a sofa.",
    });
  });

  it("parses a title/description out of prose when the model returns non-JSON", async () => {
    mockFetchOk();
    mocks.generateContent.mockResolvedValue({
      text: "Title: Sunset\nA warm orange sunset over the ocean.",
    });

    const result = await handleImageDescription(
      createRuntime(),
      "https://example.com/sunset.png",
    );

    expect(result.title).toBe("Sunset");
    expect(result.description).toContain("warm orange sunset");
  });

  it("throws when the client is not initialized instead of fabricating a result", async () => {
    mockFetchOk();
    mocks.createGoogleGenAI.mockReturnValue(null);

    await expect(
      handleImageDescription(createRuntime(), "https://example.com/x.png"),
    ).rejects.toThrow("Google Generative AI client not initialized");

    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("throws when the image fetch fails instead of fabricating a result", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      statusText: "Not Found",
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = handleImageDescription(
      createRuntime(),
      "https://example.com/missing.png",
    );

    await expect(result).rejects.toThrow("Failed to fetch image: Not Found");
    // Must not swallow into a { title: "Failed to analyze image", ... } object.
    await expect(result).rejects.not.toHaveProperty("title");
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("propagates a provider rejection instead of fabricating a result", async () => {
    mockFetchOk();
    mocks.generateContent.mockRejectedValue(
      new Error("429 rate limit exceeded"),
    );

    const call = handleImageDescription(
      createRuntime(),
      "https://example.com/rate-limited.png",
    );

    await expect(call).rejects.toThrow("429 rate limit exceeded");
    // The rejection value is the real error, not a fabricated description object.
    await expect(call).rejects.toBeInstanceOf(Error);
    await expect(call).rejects.not.toHaveProperty("title");
  });

  it("throws on an empty model completion instead of returning an empty description", async () => {
    mockFetchOk();
    mocks.generateContent.mockResolvedValue({ text: "   " });

    await expect(
      handleImageDescription(createRuntime(), "https://example.com/blank.png"),
    ).rejects.toThrow("Google GenAI API returned an empty image description");
  });
});
