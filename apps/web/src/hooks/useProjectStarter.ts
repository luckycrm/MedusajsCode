import { DEFAULT_MODEL_BY_PROVIDER, type ProjectId, type ThreadId } from "@mctools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { toastManager } from "../components/ui/toast";
import { useComposerDraftStore } from "../composerDraftStore";
import { newCommandId, newProjectId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useTerminalStateStore } from "../terminalStateStore";
import { DEFAULT_THREAD_TERMINAL_ID } from "../types";
import { useStore } from "../store";
import { useSettings } from "./useSettings";
import { useHandleNewThread } from "./useHandleNewThread";

type StartProjectResult = {
  projectId: ProjectId;
  threadId: ThreadId | null;
  cwd: string;
  created: boolean;
};

function normalizePathInput(value: string): string {
  return value.trim().replace(/[\\/]+$/, "");
}

function lastPathSegment(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? pathValue;
}

function sortThreadsByRecency<
  TThread extends {
    updatedAt?: string | undefined;
    createdAt: string;
  },
>(threads: readonly TThread[]): TThread[] {
  return [...threads].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt);
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt);
    return rightTime - leftTime;
  });
}

function joinPath(basePath: string, nextSegment: string): string {
  const base = basePath.replace(/[\\/]+$/, "");
  const segment = nextSegment.replace(/^[/\\]+/, "");
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return `${base}${separator}${segment}`;
}

function deriveRepoFolderName(repoUrl: string): string {
  const trimmed = repoUrl.trim().replace(/\/+$/, "");
  const withoutGitSuffix = trimmed.replace(/\.git$/i, "");
  const lastSlashIndex = Math.max(withoutGitSuffix.lastIndexOf("/"), withoutGitSuffix.lastIndexOf(":"));
  const candidate = lastSlashIndex >= 0 ? withoutGitSuffix.slice(lastSlashIndex + 1) : withoutGitSuffix;
  const sanitized = candidate.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "repo";
}

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

const CLONE_SENTINEL_FILE = ".medusajs-code-template";

export function useProjectStarter() {
  const navigate = useNavigate();
  const { handleNewThread, projects } = useHandleNewThread();
  const threads = useStore((store) => store.threads);
  const appSettings = useSettings();

  const focusProjectThread = useCallback(
    async (projectId: ProjectId): Promise<ThreadId | null> => {
      const projectThreads = sortThreadsByRecency(
        threads.filter((thread) => thread.projectId === projectId),
      );
      const mostRecentThread = projectThreads[0] ?? null;
      if (mostRecentThread) {
        await navigate({
          to: "/$threadId",
          params: { threadId: mostRecentThread.id },
        });
        return mostRecentThread.id;
      }

      await handleNewThread(projectId, {
        envMode: appSettings.defaultThreadEnvMode,
      });

      return useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)?.threadId ?? null;
    },
    [appSettings.defaultThreadEnvMode, handleNewThread, navigate, threads],
  );

  const startProjectFromPath = useCallback(
    async (rawPath: string): Promise<StartProjectResult> => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Native API not found");
      }

      const cwd = normalizePathInput(rawPath);
      if (!cwd) {
        throw new Error("Enter a folder path to continue.");
      }

      const existingProject = projects.find((project) => project.cwd === cwd);
      if (existingProject) {
        const threadId = await focusProjectThread(existingProject.id);
        return {
          projectId: existingProject.id,
          threadId,
          cwd,
          created: false,
        };
      }

      const projectId = newProjectId();
      const createdAt = new Date().toISOString();
      await api.orchestration.dispatchCommand({
        type: "project.create",
        commandId: newCommandId(),
        projectId,
        title: lastPathSegment(cwd),
        workspaceRoot: cwd,
        defaultModelSelection: {
          provider: "codex",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
        },
        createdAt,
      });

      const threadId = await focusProjectThread(projectId);
      return {
        projectId,
        threadId,
        cwd,
        created: true,
      };
    },
    [focusProjectThread, projects],
  );

  const pickFolderAndStartProject = useCallback(async (): Promise<StartProjectResult | null> => {
    const api = readNativeApi();
    if (!api) {
      throw new Error("Native API not found");
    }
    const pickedPath = await api.dialogs.pickFolder();
    if (!pickedPath) {
      return null;
    }
    return startProjectFromPath(pickedPath);
  }, [startProjectFromPath]);

  const cloneRepository = useCallback(
    async (input: {
      repoUrl: string;
      parentDirectory: string;
      folderName?: string;
    }): Promise<StartProjectResult> => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Native API not found");
      }

      const repoUrl = input.repoUrl.trim();
      if (!repoUrl) {
        throw new Error("Enter a repository URL to clone.");
      }

      const parentDirectory = normalizePathInput(input.parentDirectory);
      if (!parentDirectory) {
        throw new Error("Choose a destination folder first.");
      }

      const folderName = normalizePathInput(input.folderName ?? "") || deriveRepoFolderName(repoUrl);
      const targetPath = joinPath(parentDirectory, folderName);

      // Create the target directory before registering the project. The starter
      // flow clones into ".", so we remove this sentinel right before cloning.
      await api.projects.writeFile({
        cwd: targetPath,
        relativePath: CLONE_SENTINEL_FILE,
        contents: "",
      });

      const result = await startProjectFromPath(targetPath);
      if (!result.threadId) {
        throw new Error("Unable to prepare a thread for the cloned repository.");
      }

      const terminalStore = useTerminalStateStore.getState();
      terminalStore.setTerminalOpen(result.threadId, true);
      terminalStore.setActiveTerminal(result.threadId, DEFAULT_THREAD_TERMINAL_ID);

      await api.terminal.open({
        threadId: result.threadId,
        terminalId: DEFAULT_THREAD_TERMINAL_ID,
        cwd: parentDirectory,
      });
      await api.terminal.write({
        threadId: result.threadId,
        terminalId: DEFAULT_THREAD_TERMINAL_ID,
        data: `rm -f ${shellQuote(joinPath(targetPath, CLONE_SENTINEL_FILE))} && git clone ${shellQuote(repoUrl)} ${shellQuote(folderName)}\r`,
      });

      return result;
    },
    [startProjectFromPath],
  );

  const openFolderFromMenu = useCallback(async () => {
    try {
      const result = await pickFolderAndStartProject();
      if (!result) {
        return;
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not open folder",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  }, [pickFolderAndStartProject]);

  return {
    startProjectFromPath,
    pickFolderAndStartProject,
    cloneRepository,
    openFolderFromMenu,
  };
}
