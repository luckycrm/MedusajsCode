import { ProjectId } from "@mctools/contracts";
import { describe, expect, it } from "vitest";

import { prependProjectAiContext, stripProjectAiContext } from "./projectAiPack";

describe("projectAiPack", () => {
  it("injects resolved knowledge entries into the hidden project AI context", () => {
    const text = prependProjectAiContext({
      project: {
        id: ProjectId.makeUnsafe("project-1"),
        name: "Medusa Project",
        cwd: "/repo",
        defaultModelSelection: null,
        expanded: true,
        scripts: [],
        skills: [
          {
            id: "medusa-build",
            name: "Build with Medusa",
            description: "Use Medusa backend patterns.",
            promptHint: "Follow Medusa backend conventions.",
            referenceUrl:
              "https://docs.medusajs.com/learn/introduction/build-with-llms-ai/index.html.md",
          },
        ],
        knowledgeSources: [
          {
            id: "medusa-llms-full",
            name: "Medusa llms-full.txt",
            description: "Full docs.",
            kind: "llms-full",
            url: "https://docs.medusajs.com/llms-full.txt",
          },
        ],
        mcpServers: [],
      },
      resolvedKnowledgeEntries: [
        {
          sourceId: "medusa-llms-full",
          name: "Medusa llms-full.txt",
          url: "https://docs.medusajs.com/llms-full.txt",
          content: "Medusa docs content",
          truncated: false,
        },
      ],
      text: "Build me a module",
    });

    expect(text).toContain("Resolved knowledge snippets:");
    expect(text).toContain("Medusa docs content");
    expect(stripProjectAiContext(text)).toBe("Build me a module");
  });
});
