import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  ServerInspectMcpServerInput,
  ServerInspectMcpServerResult,
  ServerMcpResource,
  ServerMcpTool,
} from "@mctools/contracts";

const MCP_INSPECT_TIMEOUT_MS = 10_000;

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

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

function normalizeTool(tool: {
  name: string;
  description?: string | undefined;
  inputSchema?: unknown;
}): ServerMcpTool {
  return {
    name: tool.name,
    ...(asTrimmedString(tool.description)
      ? { description: asTrimmedString(tool.description) }
      : {}),
    ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
  };
}

function normalizeResource(resource: {
  uri: string;
  name: string;
  description?: string | undefined;
  mimeType?: string | undefined;
}): ServerMcpResource {
  return {
    uri: resource.uri,
    name: resource.name,
    ...(asTrimmedString(resource.description)
      ? { description: asTrimmedString(resource.description) }
      : {}),
    ...(asTrimmedString(resource.mimeType) ? { mimeType: asTrimmedString(resource.mimeType) } : {}),
  };
}

export async function inspectMcpServer(
  input: ServerInspectMcpServerInput,
): Promise<ServerInspectMcpServerResult> {
  if (input.transport !== "streamable-http") {
    throw new Error(`Unsupported MCP transport: ${input.transport}`);
  }

  const transport = new StreamableHTTPClientTransport(new URL(input.url));
  const client = new Client(
    {
      name: "medusajscode-mcp-inspector",
      version: "0.2.0",
    },
    { capabilities: {} },
  );

  try {
    await withTimeout(
      client.connect(transport as Parameters<typeof client.connect>[0]),
      MCP_INSPECT_TIMEOUT_MS,
      "MCP connection",
    );

    const [toolsResponse, resourcesResponse] = await Promise.all([
      withTimeout(client.listTools(), MCP_INSPECT_TIMEOUT_MS, "MCP tool listing"),
      withTimeout(client.listResources(), MCP_INSPECT_TIMEOUT_MS, "MCP resource listing").catch(
        () => ({ resources: [] }),
      ),
    ]);

    const serverVersion = client.getServerVersion();

    return {
      serverName: asTrimmedString(serverVersion?.name) ?? "Unknown MCP Server",
      ...(asTrimmedString(serverVersion?.version)
        ? { serverVersion: asTrimmedString(serverVersion?.version) }
        : {}),
      ...(asTrimmedString(client.getInstructions())
        ? { instructions: asTrimmedString(client.getInstructions()) }
        : {}),
      tools: toolsResponse.tools.map(normalizeTool),
      resources: resourcesResponse.resources.map(normalizeResource),
    };
  } finally {
    await transport.close().catch(() => undefined);
  }
}
