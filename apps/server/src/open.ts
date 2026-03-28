/**
 * Open - Browser/editor launch service interface.
 *
 * Owns process launch helpers for opening URLs in a browser and workspace
 * paths in a configured editor.
 *
 * @module Open
 */
import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { extname, join } from "node:path";

import { EDITORS, type EditorId } from "@mctools/contracts";
import { ServiceMap, Schema, Effect, Layer } from "effect";

// ==============================
// Definitions
// ==============================

export class OpenError extends Schema.TaggedErrorClass<OpenError>()("OpenError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export interface OpenInEditorInput {
  readonly cwd: string;
  readonly editor: EditorId;
  readonly workspaceRoot?: string | undefined;
}

interface EditorLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

function macApplicationNameForEditor(editorId: EditorId): string | null {
  switch (editorId) {
    case "cursor":
      return "Cursor";
    case "vscode":
      return "Visual Studio Code";
    case "vscode-insiders":
      return "Visual Studio Code - Insiders";
    case "vscodium":
      return "VSCodium";
    case "zed":
      return "Zed";
    case "antigravity":
      return "Antigravity";
    default:
      return null;
  }
}

function stripLineColumnSuffix(value: string): string {
  return value.replace(LINE_COLUMN_SUFFIX_PATTERN, "");
}

function isWorkspaceScopedFileTarget(target: string, workspaceRoot: string): boolean {
  const normalizedTarget = stripLineColumnSuffix(target);
  if (normalizedTarget === workspaceRoot) {
    return false;
  }
  return (
    normalizedTarget.startsWith(`${workspaceRoot}/`) ||
    normalizedTarget.startsWith(`${workspaceRoot}\\`)
  );
}

function supportsProjectWindowRouting(editorId: EditorId): boolean {
  return (
    editorId === "cursor" ||
    editorId === "vscode" ||
    editorId === "vscode-insiders" ||
    editorId === "vscodium"
  );
}

function activationLaunchForEditor(
  editorId: EditorId,
  platform: NodeJS.Platform,
): EditorLaunch | null {
  if (platform !== "darwin") {
    return null;
  }
  const appName = macApplicationNameForEditor(editorId);
  if (!appName) {
    return null;
  }
  return { command: "open", args: ["-a", appName] };
}

interface CommandAvailabilityOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
}

const LINE_COLUMN_SUFFIX_PATTERN = /:\d+(?::\d+)?$/;

function shouldUseGotoFlag(editor: (typeof EDITORS)[number], target: string): boolean {
  return editor.supportsGoto && LINE_COLUMN_SUFFIX_PATTERN.test(target);
}

function fileManagerCommandForPlatform(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "open";
    case "win32":
      return "explorer";
    default:
      return "xdg-open";
  }
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^"+|"+$/g, "");
}

function resolvePathEnvironmentVariable(env: NodeJS.ProcessEnv): string {
  return env.PATH ?? env.Path ?? env.path ?? "";
}

function resolveWindowsPathExtensions(env: NodeJS.ProcessEnv): ReadonlyArray<string> {
  const rawValue = env.PATHEXT;
  const fallback = [".COM", ".EXE", ".BAT", ".CMD"];
  if (!rawValue) return fallback;

  const parsed = rawValue
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry.startsWith(".") ? entry.toUpperCase() : `.${entry.toUpperCase()}`));
  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function resolveCommandCandidates(
  command: string,
  platform: NodeJS.Platform,
  windowsPathExtensions: ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (platform !== "win32") return [command];
  const extension = extname(command);
  const normalizedExtension = extension.toUpperCase();

  if (extension.length > 0 && windowsPathExtensions.includes(normalizedExtension)) {
    const commandWithoutExtension = command.slice(0, -extension.length);
    return Array.from(
      new Set([
        command,
        `${commandWithoutExtension}${normalizedExtension}`,
        `${commandWithoutExtension}${normalizedExtension.toLowerCase()}`,
      ]),
    );
  }

  const candidates: string[] = [];
  for (const extension of windowsPathExtensions) {
    candidates.push(`${command}${extension}`);
    candidates.push(`${command}${extension.toLowerCase()}`);
  }
  return Array.from(new Set(candidates));
}

function isExecutableFile(
  filePath: string,
  platform: NodeJS.Platform,
  windowsPathExtensions: ReadonlyArray<string>,
): boolean {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return false;
    if (platform === "win32") {
      const extension = extname(filePath);
      if (extension.length === 0) return false;
      return windowsPathExtensions.includes(extension.toUpperCase());
    }
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolvePathDelimiter(platform: NodeJS.Platform): string {
  return platform === "win32" ? ";" : ":";
}

export function isCommandAvailable(
  command: string,
  options: CommandAvailabilityOptions = {},
): boolean {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const windowsPathExtensions = platform === "win32" ? resolveWindowsPathExtensions(env) : [];
  const commandCandidates = resolveCommandCandidates(command, platform, windowsPathExtensions);

  if (command.includes("/") || command.includes("\\")) {
    return commandCandidates.some((candidate) =>
      isExecutableFile(candidate, platform, windowsPathExtensions),
    );
  }

  const pathValue = resolvePathEnvironmentVariable(env);
  if (pathValue.length === 0) return false;
  const pathEntries = pathValue
    .split(resolvePathDelimiter(platform))
    .map((entry) => stripWrappingQuotes(entry.trim()))
    .filter((entry) => entry.length > 0);

  for (const pathEntry of pathEntries) {
    for (const candidate of commandCandidates) {
      if (isExecutableFile(join(pathEntry, candidate), platform, windowsPathExtensions)) {
        return true;
      }
    }
  }
  return false;
}

export function resolveAvailableEditors(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<EditorId> {
  const available: EditorId[] = [];

  for (const editor of EDITORS) {
    const command = editor.command ?? fileManagerCommandForPlatform(platform);
    if (isCommandAvailable(command, { platform, env })) {
      available.push(editor.id);
    }
  }

  return available;
}

/**
 * OpenShape - Service API for browser and editor launch actions.
 */
export interface OpenShape {
  /**
   * Open a URL target in the default browser.
   */
  readonly openBrowser: (target: string) => Effect.Effect<void, OpenError>;

  /**
   * Open a workspace path in a selected editor integration.
   *
   * Launches the editor as a detached process so server startup is not blocked.
   */
  readonly openInEditor: (input: OpenInEditorInput) => Effect.Effect<void, OpenError>;
}

/**
 * Open - Service tag for browser/editor launch operations.
 */
export class Open extends ServiceMap.Service<Open, OpenShape>()("mc/open") {}

// ==============================
// Implementations
// ==============================

export const resolveEditorLaunch = Effect.fnUntraced(function* (
  input: OpenInEditorInput,
  platform: NodeJS.Platform = process.platform,
): Effect.fn.Return<EditorLaunch, OpenError> {
  const editorDef = EDITORS.find((editor) => editor.id === input.editor);
  if (!editorDef) {
    return yield* new OpenError({ message: `Unknown editor: ${input.editor}` });
  }

  if (editorDef.command) {
    return shouldUseGotoFlag(editorDef, input.cwd)
      ? { command: editorDef.command, args: ["--goto", input.cwd] }
      : { command: editorDef.command, args: [input.cwd] };
  }

  if (editorDef.id !== "file-manager") {
    return yield* new OpenError({ message: `Unsupported editor: ${input.editor}` });
  }

  return { command: fileManagerCommandForPlatform(platform), args: [input.cwd] };
});

export function resolveEditorLaunchSequence(
  input: OpenInEditorInput,
  openedProjectWindows: ReadonlyMap<EditorId, ReadonlySet<string>>,
  platform: NodeJS.Platform = process.platform,
): Effect.Effect<ReadonlyArray<EditorLaunch>, OpenError> {
  return Effect.gen(function* () {
    const editorDef = EDITORS.find((editor) => editor.id === input.editor);
    if (!editorDef) {
      return yield* new OpenError({ message: `Unknown editor: ${input.editor}` });
    }

    const activationLaunch = activationLaunchForEditor(input.editor, platform);
    const workspaceRoot = input.workspaceRoot;
    const canRouteToProjectWindow =
      Boolean(editorDef.command) &&
      workspaceRoot !== undefined &&
      supportsProjectWindowRouting(input.editor) &&
      isWorkspaceScopedFileTarget(input.cwd, workspaceRoot);

    if (canRouteToProjectWindow && editorDef.command) {
      const openedRoots = openedProjectWindows.get(input.editor);
      const projectAlreadyOpened = openedRoots?.has(workspaceRoot!) ?? false;

      if (!projectAlreadyOpened) {
        return [
          shouldUseGotoFlag(editorDef, input.cwd)
            ? {
                command: editorDef.command,
                args: ["--new-window", workspaceRoot!, "--goto", input.cwd],
              }
            : {
                command: editorDef.command,
                args: ["--new-window", workspaceRoot!, input.cwd],
              },
          ...(activationLaunch ? [activationLaunch] : []),
        ];
      }

      return [
        shouldUseGotoFlag(editorDef, input.cwd)
          ? {
              command: editorDef.command,
              args: ["--reuse-window", workspaceRoot!, "--goto", input.cwd],
            }
          : { command: editorDef.command, args: ["--reuse-window", workspaceRoot!, input.cwd] },
        ...(activationLaunch ? [activationLaunch] : []),
      ];
    }

    const singleLaunch = yield* resolveEditorLaunch(input, platform);
    return [singleLaunch, ...(activationLaunch ? [activationLaunch] : [])];
  });
}

export const launchDetached = (launch: EditorLaunch) =>
  Effect.gen(function* () {
    if (!isCommandAvailable(launch.command)) {
      return yield* new OpenError({ message: `Editor command not found: ${launch.command}` });
    }

    yield* Effect.callback<void, OpenError>((resume) => {
      let child;
      try {
        child = spawn(launch.command, [...launch.args], {
          detached: true,
          stdio: "ignore",
          shell: process.platform === "win32",
        });
      } catch (error) {
        return resume(
          Effect.fail(new OpenError({ message: "failed to spawn detached process", cause: error })),
        );
      }

      const handleSpawn = () => {
        child.unref();
        resume(Effect.void);
      };

      child.once("spawn", handleSpawn);
      child.once("error", (cause) =>
        resume(Effect.fail(new OpenError({ message: "failed to spawn detached process", cause }))),
      );
    });
  });

export const launchDetachedSequence = (launches: ReadonlyArray<EditorLaunch>) =>
  Effect.gen(function* () {
    for (const [index, launch] of launches.entries()) {
      yield* launchDetached(launch);
      if (index < launches.length - 1) {
        yield* Effect.sleep("250 millis");
      }
    }
  });

const make = Effect.gen(function* () {
  const open = yield* Effect.tryPromise({
    try: () => import("open"),
    catch: (cause) => new OpenError({ message: "failed to load browser opener", cause }),
  });
  const openedProjectWindows = new Map<EditorId, Set<string>>();

  return {
    openBrowser: (target) =>
      Effect.tryPromise({
        try: () => open.default(target),
        catch: (cause) => new OpenError({ message: "Browser auto-open failed", cause }),
      }),
    openInEditor: (input) =>
      Effect.gen(function* () {
        const launches = yield* resolveEditorLaunchSequence(input, openedProjectWindows);
        yield* launchDetachedSequence(launches);

        if (
          input.workspaceRoot &&
          supportsProjectWindowRouting(input.editor) &&
          isWorkspaceScopedFileTarget(input.cwd, input.workspaceRoot)
        ) {
          const editorRoots = openedProjectWindows.get(input.editor) ?? new Set<string>();
          editorRoots.add(input.workspaceRoot);
          openedProjectWindows.set(input.editor, editorRoots);
        }
      }),
  } satisfies OpenShape;
});

export const OpenLive = Layer.effect(Open, make);
