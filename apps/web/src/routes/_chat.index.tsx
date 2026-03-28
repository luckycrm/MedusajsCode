import { FolderOpenIcon } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Button } from "../components/ui/button";
import { toastManager } from "../components/ui/toast";
import { isElectron } from "../env";
import { useProjectStarter } from "../hooks/useProjectStarter";
import { starterTemplates } from "../starterTemplates";
import { useStore } from "../store";

function normalizeDate(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function splitPath(pathValue: string) {
  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return {
    name: segments[segments.length - 1] ?? pathValue,
    parent:
      segments.length > 1
        ? `~/${segments.slice(0, -1).join("/")}`.replace(/^~\/Users\/[^/]+/, "~")
        : "",
  };
}

function ChatIndexRouteView() {
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const { cloneRepository, pickFolderAndStartProject, startProjectFromPath } = useProjectStarter();
  const [busyAction, setBusyAction] = useState<"open-folder" | "template" | null>(null);
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);

  const recentProjects = useMemo(() => {
    return projects
      .map((project) => {
        const projectThreadTimes = threads
          .filter((thread) => thread.projectId === project.id)
          .map((thread) =>
            Math.max(normalizeDate(thread.updatedAt), normalizeDate(thread.createdAt)),
          );
        const lastActivity = Math.max(
          normalizeDate(project.updatedAt),
          normalizeDate(project.createdAt),
          ...projectThreadTimes,
        );
        return {
          id: project.id,
          cwd: project.cwd,
          lastActivity,
          ...splitPath(project.cwd),
        };
      })
      .toSorted((left, right) => right.lastActivity - left.lastActivity)
      .slice(0, 6);
  }, [projects, threads]);

  const handleOpenFolder = async () => {
    if (busyAction) return;
    setBusyAction("open-folder");
    try {
      await pickFolderAndStartProject();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not open folder",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleUseTemplate = async (template: (typeof starterTemplates)[number]) => {
    if (busyAction) return;
    const desktopBridge = window.desktopBridge;
    if (!desktopBridge) {
      toastManager.add({
        type: "error",
        title: "Templates are desktop-only",
        description: "Open the desktop app to create a workspace from a starter template.",
      });
      return;
    }

    setBusyAction("template");
    setBusyTemplateId(template.id);
    try {
      const parentDirectory = await desktopBridge.pickFolder();
      if (!parentDirectory) {
        return;
      }
      await cloneRepository({
        repoUrl: template.repository,
        parentDirectory,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not create starter project",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setBusyAction(null);
      setBusyTemplateId(null);
    }
  };

  return (
    <div className="flex h-[100svh] min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {isElectron && (
        <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5 pl-[90px]">
          <span className="truncate text-xs font-medium tracking-wide text-muted-foreground/70">
            New Workspace
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="flex min-h-full w-full flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
            <div className="flex flex-col items-center gap-8">
              <div className="text-center">
                <img
                  src="/apple-touch-icon.png"
                  alt="MedusaJS Code"
                  className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover sm:h-20 sm:w-20"
                  loading="eager"
                />
                <div className="text-[1.75rem] font-semibold tracking-[-0.06em] text-foreground sm:text-[2rem]">
                  <span className="font-black">MedusaJS</span> Code
                </div>
              </div>

              <section className="w-full">
                <div className="mb-3 text-sm font-semibold text-foreground">Recent Workspaces</div>
                <div className="space-y-2">
                  {recentProjects.length > 0 ? (
                    recentProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => void startProjectFromPath(project.cwd)}
                        className="w-full rounded-xl border border-border/70 bg-card px-4 py-3 text-left transition-colors hover:bg-accent/40"
                      >
                        <div className="truncate text-sm font-semibold text-foreground">
                          {project.name}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {project.parent || project.cwd}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                      No workspaces yet. Open a folder or clone a repository to get started.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="flex w-full flex-col gap-3">
              <Button
                size="lg"
                className="w-full"
                onClick={() => void handleOpenFolder()}
                disabled={busyAction !== null}
              >
                <FolderOpenIcon className="size-4" />
                Open Folder
              </Button>
            </div>
          </div>

          {starterTemplates.length > 0 && (
            <section className="mt-8 w-full pt-2">
              <div className="mb-3 text-sm font-semibold text-foreground">
                Clone Starter Templates
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {starterTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => void handleUseTemplate(template)}
                    disabled={busyAction !== null}
                    className="w-full overflow-hidden rounded-2xl border border-border/70 bg-card text-left transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {template.previewImage ? (
                      <div className="aspect-[1.9/1] w-full overflow-hidden border-b border-border/60 bg-muted">
                        <img
                          src={template.previewImage}
                          alt={template.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    <div className="flex min-h-[132px] flex-col px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {template.name}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {template.description}
                          </div>
                        </div>
                        {template.tag ? (
                          <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {template.tag}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-auto pt-3 text-xs text-muted-foreground">
                        {busyTemplateId === template.id
                          ? "Choosing destination..."
                          : "Use template"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
