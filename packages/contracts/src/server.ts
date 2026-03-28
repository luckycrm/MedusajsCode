import { Schema } from "effect";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";
import { KeybindingRule, ResolvedKeybindingsConfig } from "./keybindings";
import { EditorId } from "./editor";
import { ModelCapabilities } from "./model";
import { ProjectKnowledgeSource, ProjectMcpServerTransport, ProviderKind } from "./orchestration";
import { ServerSettings } from "./settings";

const KeybindingsMalformedConfigIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.malformed-config"),
  message: TrimmedNonEmptyString,
});

const KeybindingsInvalidEntryIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.invalid-entry"),
  message: TrimmedNonEmptyString,
  index: Schema.Number,
});

export const ServerConfigIssue = Schema.Union([
  KeybindingsMalformedConfigIssue,
  KeybindingsInvalidEntryIssue,
]);
export type ServerConfigIssue = typeof ServerConfigIssue.Type;

const ServerConfigIssues = Schema.Array(ServerConfigIssue);

export const ServerProviderState = Schema.Literals(["ready", "warning", "error", "disabled"]);
export type ServerProviderState = typeof ServerProviderState.Type;

export const ServerProviderAuthStatus = Schema.Literals([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type ServerProviderAuthStatus = typeof ServerProviderAuthStatus.Type;

export const ServerProviderModel = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  isCustom: Schema.Boolean,
  capabilities: Schema.NullOr(ModelCapabilities),
});
export type ServerProviderModel = typeof ServerProviderModel.Type;

export const ServerProvider = Schema.Struct({
  provider: ProviderKind,
  enabled: Schema.Boolean,
  installed: Schema.Boolean,
  version: Schema.NullOr(TrimmedNonEmptyString),
  status: ServerProviderState,
  authStatus: ServerProviderAuthStatus,
  checkedAt: IsoDateTime,
  message: Schema.optional(TrimmedNonEmptyString),
  models: Schema.Array(ServerProviderModel),
});
export type ServerProvider = typeof ServerProvider.Type;

const ServerProviders = Schema.Array(ServerProvider);

export const ServerConfig = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  keybindingsConfigPath: TrimmedNonEmptyString,
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
  providers: ServerProviders,
  availableEditors: Schema.Array(EditorId),
  settings: ServerSettings,
});
export type ServerConfig = typeof ServerConfig.Type;

export const ServerUpsertKeybindingInput = KeybindingRule;
export type ServerUpsertKeybindingInput = typeof ServerUpsertKeybindingInput.Type;

export const ServerUpsertKeybindingResult = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerUpsertKeybindingResult = typeof ServerUpsertKeybindingResult.Type;

export const ServerConfigUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
  settings: Schema.optional(ServerSettings),
});
export type ServerConfigUpdatedPayload = typeof ServerConfigUpdatedPayload.Type;

export const ServerProviderUpdatedPayload = Schema.Struct({
  providers: ServerProviders,
});
export type ServerProviderUpdatedPayload = typeof ServerProviderUpdatedPayload.Type;

export const ServerInspectMcpServerInput = Schema.Struct({
  transport: ProjectMcpServerTransport,
  url: TrimmedNonEmptyString,
});
export type ServerInspectMcpServerInput = typeof ServerInspectMcpServerInput.Type;

export const ServerMcpTool = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  inputSchema: Schema.optional(Schema.Unknown),
});
export type ServerMcpTool = typeof ServerMcpTool.Type;

export const ServerMcpResource = Schema.Struct({
  uri: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  mimeType: Schema.optional(TrimmedNonEmptyString),
});
export type ServerMcpResource = typeof ServerMcpResource.Type;

export const ServerInspectMcpServerResult = Schema.Struct({
  serverName: TrimmedNonEmptyString,
  serverVersion: Schema.optional(TrimmedNonEmptyString),
  instructions: Schema.optional(TrimmedNonEmptyString),
  tools: Schema.Array(ServerMcpTool),
  resources: Schema.Array(ServerMcpResource),
});
export type ServerInspectMcpServerResult = typeof ServerInspectMcpServerResult.Type;

export const ServerResolveKnowledgeSourcesInput = Schema.Struct({
  sources: Schema.Array(ProjectKnowledgeSource),
});
export type ServerResolveKnowledgeSourcesInput = typeof ServerResolveKnowledgeSourcesInput.Type;

export const ServerResolvedKnowledgeSource = Schema.Struct({
  sourceId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  content: TrimmedNonEmptyString,
  truncated: Schema.Boolean,
});
export type ServerResolvedKnowledgeSource = typeof ServerResolvedKnowledgeSource.Type;

export const ServerResolveKnowledgeSourcesResult = Schema.Struct({
  entries: Schema.Array(ServerResolvedKnowledgeSource),
});
export type ServerResolveKnowledgeSourcesResult = typeof ServerResolveKnowledgeSourcesResult.Type;
