import type { ProjectKnowledgeSource, ProjectMcpServer, ProjectSkill } from "@mctools/contracts";

export const MEDUSA_PROJECT_SKILLS: ProjectSkill[] = [
  {
    id: "medusa-build",
    name: "Build with Medusa",
    description: "Use Medusa backend, module, workflow, and API route patterns.",
    promptHint:
      "When working on Medusa backend features, follow Medusa module, workflow, API route, and data model conventions.",
    referenceUrl: "https://docs.medusajs.com/learn/introduction/build-with-llms-ai/index.html.md",
  },
  {
    id: "medusa-storefront",
    name: "Medusa Storefront",
    description: "Use Medusa storefront and commerce best practices.",
    promptHint:
      "For storefront tasks, prefer Medusa storefront patterns, SDK integration guidance, and ecommerce best practices.",
    referenceUrl: "https://docs.medusajs.com/learn/introduction/build-with-llms-ai/index.html.md",
  },
  {
    id: "medusa-learn",
    name: "Learn Medusa",
    description: "Guide implementation in a teaching-oriented Medusa style when helpful.",
    promptHint:
      "When the request is exploratory or instructional, explain Medusa concepts clearly and structure implementation steps progressively.",
    referenceUrl: "https://docs.medusajs.com/learn/introduction/build-with-llms-ai/index.html.md",
  },
];

export const MEDUSA_PROJECT_KNOWLEDGE_SOURCES: ProjectKnowledgeSource[] = [
  {
    id: "medusa-llms-full",
    name: "Medusa llms-full.txt",
    description: "Full Medusa docs text optimized for LLM context and retrieval.",
    kind: "llms-full",
    url: "https://docs.medusajs.com/llms-full.txt",
  },
  {
    id: "medusa-build-with-ai-md",
    name: "Build with AI markdown",
    description: "Medusa guide for AI assistants, skills, docs, and MCP usage.",
    kind: "page-markdown",
    url: "https://docs.medusajs.com/learn/introduction/build-with-llms-ai/index.html.md",
  },
  {
    id: "medusa-docs-index",
    name: "Medusa docs index",
    description: "Primary Medusa documentation entry point for broader reference.",
    kind: "docs-index",
    url: "https://docs.medusajs.com",
  },
];

export const MEDUSA_PROJECT_MCP_SERVERS: ProjectMcpServer[] = [
  {
    id: "medusa-docs-mcp",
    name: "Medusa Docs MCP",
    description: "Remote Medusa MCP server for docs-aware tools and resources.",
    transport: "streamable-http",
    url: "https://docs.medusajs.com/mcp",
  },
];
