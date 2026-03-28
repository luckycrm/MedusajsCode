import type { ServerResolvedKnowledgeSource } from "@mctools/contracts";
import type { Project } from "./types";

export const PROJECT_AI_CONTEXT_START = "<!-- medusajscode:project-ai-context:start -->";
export const PROJECT_AI_CONTEXT_END = "<!-- medusajscode:project-ai-context:end -->";

function formatProjectAiContext(
  project: Pick<Project, "name" | "skills" | "knowledgeSources" | "mcpServers">,
  resolvedKnowledgeEntries: ReadonlyArray<ServerResolvedKnowledgeSource> = [],
) {
  const skills = project.skills ?? [];
  const knowledgeSources = project.knowledgeSources ?? [];
  const mcpServers = project.mcpServers ?? [];
  if (skills.length === 0 && knowledgeSources.length === 0 && mcpServers.length === 0) {
    return null;
  }

  const lines = [
    PROJECT_AI_CONTEXT_START,
    `Project AI context for ${project.name}:`,
    "Use these Medusa-specific references when they are relevant to the user's request.",
  ];

  if (skills.length > 0) {
    lines.push("Skills:");
    for (const skill of skills) {
      lines.push(`- ${skill.name}: ${skill.promptHint} Reference: ${skill.referenceUrl}`);
    }
  }

  if (knowledgeSources.length > 0) {
    lines.push("Knowledgebase:");
    for (const source of knowledgeSources) {
      lines.push(`- ${source.name}: ${source.description} Source: ${source.url}`);
    }
  }

  if (resolvedKnowledgeEntries.length > 0) {
    lines.push("Resolved knowledge snippets:");
    for (const entry of resolvedKnowledgeEntries) {
      lines.push(`- ${entry.name} (${entry.url})`);
      lines.push(entry.content);
    }
  }

  if (mcpServers.length > 0) {
    lines.push("MCP servers:");
    for (const server of mcpServers) {
      lines.push(
        `- ${server.name}: ${server.description} Transport: ${server.transport}. Endpoint: ${server.url}`,
      );
    }
  }

  lines.push(PROJECT_AI_CONTEXT_END);
  return lines.join("\n");
}

export function prependProjectAiContext(input: {
  project: Project | null | undefined;
  text: string;
  resolvedKnowledgeEntries?: ReadonlyArray<ServerResolvedKnowledgeSource>;
}): string {
  if (!input.project) {
    return input.text;
  }
  const context = formatProjectAiContext(input.project, input.resolvedKnowledgeEntries ?? []);
  if (!context) {
    return input.text;
  }
  return `${context}\n\n${input.text}`;
}

export function stripProjectAiContext(text: string): string {
  const start = text.indexOf(PROJECT_AI_CONTEXT_START);
  const end = text.indexOf(PROJECT_AI_CONTEXT_END);
  if (start === -1 || end === -1 || end < start) {
    return text;
  }
  const stripped = `${text.slice(0, start)}${text.slice(end + PROJECT_AI_CONTEXT_END.length)}`;
  return stripped.replace(/^\s+/, "");
}

export function isMedusaAiPackEnabled(project: Project | null | undefined): boolean {
  return Boolean(
    project &&
    ((project.skills?.length ?? 0) > 0 ||
      (project.knowledgeSources?.length ?? 0) > 0 ||
      (project.mcpServers?.length ?? 0) > 0),
  );
}
