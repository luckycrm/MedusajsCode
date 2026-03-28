import type {
  ProjectKnowledgeSource,
  ServerResolveKnowledgeSourcesResult,
  ServerResolvedKnowledgeSource,
} from "@mctools/contracts";

const KNOWLEDGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_KNOWLEDGE_CHARS = 8_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_KNOWLEDGE_CHARS) {
    return { content, truncated: false };
  }
  return {
    content: `${content.slice(0, MAX_KNOWLEDGE_CHARS).trimEnd()}\n\n[Content truncated]`,
    truncated: true,
  };
}

async function resolveKnowledgeSource(
  source: ProjectKnowledgeSource,
): Promise<ServerResolvedKnowledgeSource | null> {
  if (source.kind === "docs-index") {
    return {
      sourceId: source.id,
      name: source.name,
      url: source.url,
      content: `${source.description}\nPrimary docs entry: ${source.url}`,
      truncated: false,
    };
  }

  const response = await withTimeout(fetch(source.url), KNOWLEDGE_FETCH_TIMEOUT_MS, source.name);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${source.url}`);
  }

  const raw = await withTimeout(response.text(), KNOWLEDGE_FETCH_TIMEOUT_MS, `${source.name} body`);
  const normalized = normalizeContent(raw);
  if (!normalized) {
    return null;
  }

  const truncated = truncateContent(normalized);
  return {
    sourceId: source.id,
    name: source.name,
    url: source.url,
    content: truncated.content,
    truncated: truncated.truncated,
  };
}

export async function resolveKnowledgeSources(
  sources: ReadonlyArray<ProjectKnowledgeSource>,
): Promise<ServerResolveKnowledgeSourcesResult> {
  const entries = await Promise.all(
    sources.map(async (source) => {
      try {
        return await resolveKnowledgeSource(source);
      } catch {
        return null;
      }
    }),
  );

  return {
    entries: entries.filter((entry): entry is ServerResolvedKnowledgeSource => entry !== null),
  };
}
