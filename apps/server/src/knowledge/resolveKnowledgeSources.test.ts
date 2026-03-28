import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveKnowledgeSources } from "./resolveKnowledgeSources";

describe("resolveKnowledgeSources", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves fetchable knowledge sources and preserves docs-index references", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith("/llms-full.txt")) {
        return new Response("Medusa docs plain text\n\nBuild modules.\n", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      return new Response("not found", { status: 404 });
    });

    const result = await resolveKnowledgeSources([
      {
        id: "medusa-llms-full",
        name: "Medusa llms-full.txt",
        description: "Full Medusa docs text optimized for LLM context and retrieval.",
        kind: "llms-full",
        url: "https://docs.medusajs.com/llms-full.txt",
      },
      {
        id: "medusa-docs-index",
        name: "Medusa docs index",
        description: "Primary Medusa documentation entry point for broader reference.",
        kind: "docs-index",
        url: "https://docs.medusajs.com",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      sourceId: "medusa-llms-full",
      truncated: false,
    });
    expect(result.entries[0]?.content).toContain("Build modules.");
    expect(result.entries[1]?.content).toContain("Primary docs entry");
  });

  it("truncates oversized knowledge sources", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("A".repeat(9000), {
        status: 200,
        headers: { "Content-Type": "text/markdown" },
      }),
    );

    const result = await resolveKnowledgeSources([
      {
        id: "medusa-big-md",
        name: "Medusa big markdown",
        description: "Large markdown source.",
        kind: "page-markdown",
        url: "https://docs.medusajs.com/learn/introduction/build-with-llms-ai/index.html.md",
      },
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.truncated).toBe(true);
    expect(result.entries[0]?.content).toContain("[Content truncated]");
  });
});
