import { ChevronRightIcon, FolderIcon, PanelLeftCloseIcon, PanelLeftIcon } from "lucide-react";
import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Schema } from "effect";
import { type ProjectEntry } from "@mctools/contracts";
import { useQueries } from "@tanstack/react-query";

import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { getLocalStorageItem, setLocalStorageItem } from "../hooks/useLocalStorage";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { VscodeEntryIcon } from "./chat/VscodeEntryIcon";
import { Button } from "./ui/button";
import { Sheet, SheetPopup } from "./ui/sheet";
import {
  SidebarContent,
  SidebarGroup,
} from "./ui/sidebar";

const ROOT_DIRECTORY_PATH = "__root__";
const PROJECT_EXPLORER_WIDTH_STORAGE_KEY = "project_explorer_sidebar_width";
const PROJECT_EXPLORER_COLLAPSED_STORAGE_KEY = "project_explorer_sidebar_collapsed";
const PROJECT_EXPLORER_DEFAULT_WIDTH = 18 * 16;
const PROJECT_EXPLORER_MIN_WIDTH = 14 * 16;
const PROJECT_EXPLORER_MAX_WIDTH = 32 * 16;

const ProjectExplorerContext = createContext<{
  desktopCollapsed: boolean;
  setDesktopCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggle: () => void;
} | null>(null);

function useProjectExplorer() {
  const context = useContext(ProjectExplorerContext);
  if (!context) {
    throw new Error("useProjectExplorer must be used within ProjectExplorerProvider.");
  }
  return context;
}

export function ProjectExplorerProvider({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery("lg");
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    const storedValue = getLocalStorageItem(PROJECT_EXPLORER_COLLAPSED_STORAGE_KEY, Schema.Boolean);
    return storedValue ?? false;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const persistDesktopCollapsed = useCallback((collapsed: boolean) => {
    setLocalStorageItem(PROJECT_EXPLORER_COLLAPSED_STORAGE_KEY, collapsed, Schema.Boolean);
  }, []);

  const toggle = useCallback(() => {
    if (isDesktop) {
      setDesktopCollapsed((current) => {
        const next = !current;
        persistDesktopCollapsed(next);
        return next;
      });
      return;
    }
    setMobileOpen((current) => !current);
  }, [isDesktop, persistDesktopCollapsed]);

  const contextValue = useMemo(
    () => ({ desktopCollapsed, setDesktopCollapsed, mobileOpen, setMobileOpen, toggle }),
    [desktopCollapsed, mobileOpen, toggle],
  );

  return (
    <ProjectExplorerContext.Provider value={contextValue}>
      {children}
    </ProjectExplorerContext.Provider>
  );
}

export function ProjectExplorerTrigger({ className = "size-7 shrink-0" }: { className?: string }) {
  const projects = useStore((store) => store.projects);
  const { activeDraftThread, activeThread } = useHandleNewThread();
  const isDesktop = useMediaQuery("lg");
  const { desktopCollapsed, mobileOpen, toggle } = useProjectExplorer();
  const activeProjectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? null;
  const hasActiveProject = projects.some((project) => project.id === activeProjectId);

  if (!hasActiveProject) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Toggle explorer"
      onClick={toggle}
    >
      {isDesktop ? (
        desktopCollapsed ? <PanelLeftIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />
      ) : mobileOpen ? (
        <PanelLeftCloseIcon className="size-4" />
      ) : (
        <PanelLeftIcon className="size-4" />
      )}
    </Button>
  );
}

export default function ProjectExplorerSidebar() {
  const projects = useStore((store) => store.projects);
  const { activeDraftThread, activeThread } = useHandleNewThread();
  const { desktopCollapsed, mobileOpen, setMobileOpen } = useProjectExplorer();
  const [desktopWidth, setDesktopWidth] = useState(() => {
    const storedWidth = getLocalStorageItem(PROJECT_EXPLORER_WIDTH_STORAGE_KEY, Schema.Finite);
    if (storedWidth === null) {
      return PROJECT_EXPLORER_DEFAULT_WIDTH;
    }
    return Math.min(PROJECT_EXPLORER_MAX_WIDTH, Math.max(PROJECT_EXPLORER_MIN_WIDTH, storedWidth));
  });
  const [expandedDirectories, setExpandedDirectories] = useState<ReadonlySet<string>>(
    () => new Set([ROOT_DIRECTORY_PATH]),
  );
  const resizeStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const activeProjectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? null;
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const explorerDirectoryPaths = useMemo(
    () =>
      activeProject
        ? [
            ROOT_DIRECTORY_PATH,
            ...Array.from(expandedDirectories).filter(
              (directoryPath) => directoryPath !== ROOT_DIRECTORY_PATH,
            ),
          ]
        : [],
    [activeProject, expandedDirectories],
  );

  const explorerDirectoryQueries = useQueries({
    queries: explorerDirectoryPaths.map((directoryPath) => ({
      queryKey: ["project-directory", activeProject?.cwd ?? null, directoryPath],
      queryFn: async () => {
        const api = readNativeApi();
        if (!api || !activeProject) {
          return { entries: [] as ProjectEntry[] };
        }

        return api.projects.listDirectory(
          directoryPath === ROOT_DIRECTORY_PATH
            ? { cwd: activeProject.cwd }
            : { cwd: activeProject.cwd, relativePath: directoryPath },
        );
      },
      enabled: activeProject !== null,
      staleTime: 15_000,
    })),
  });

  const explorerEntriesByParentPath = useMemo(() => {
    const nextMap = new Map<string, readonly ProjectEntry[]>();
    explorerDirectoryPaths.forEach((directoryPath, index) => {
      const result = explorerDirectoryQueries[index]?.data;
      if (!result) {
        return;
      }
      nextMap.set(directoryPath, result.entries);
    });
    return nextMap;
  }, [explorerDirectoryPaths, explorerDirectoryQueries]);

  const isExplorerLoading = explorerDirectoryQueries.some(
    (query) => query.isPending || query.isFetching,
  );
  const explorerTheme =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";

  const toggleDirectory = useCallback((directoryPath: string) => {
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(directoryPath)) {
        next.delete(directoryPath);
      } else {
        next.add(directoryPath);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setExpandedDirectories(new Set([ROOT_DIRECTORY_PATH]));
  }, [activeProject?.cwd]);

  const persistDesktopWidth = useCallback((width: number) => {
    setLocalStorageItem(PROJECT_EXPLORER_WIDTH_STORAGE_KEY, width, Schema.Finite);
  }, []);

  const commitDesktopWidth = useCallback(
    (width: number) => {
      const nextWidth = Math.min(
        PROJECT_EXPLORER_MAX_WIDTH,
        Math.max(PROJECT_EXPLORER_MIN_WIDTH, Math.round(width)),
      );
      setDesktopWidth(nextWidth);
      persistDesktopWidth(nextWidth);
    },
    [persistDesktopWidth],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const nextWidth = resizeState.startWidth + delta;
      setDesktopWidth(
        Math.min(PROJECT_EXPLORER_MAX_WIDTH, Math.max(PROJECT_EXPLORER_MIN_WIDTH, nextWidth)),
      );
    };

    const handlePointerEnd = () => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      resizeStateRef.current = null;
      commitDesktopWidth(desktopWidth);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [commitDesktopWidth, desktopWidth]);

  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: desktopWidth,
    };
    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");
  }, [desktopWidth]);

  function renderExplorerTree(parentPath: string, depth = 0): ReactNode {
    const entries = explorerEntriesByParentPath.get(parentPath) ?? [];
    return entries.map((entry) => {
      const isDirectory = entry.kind === "directory";
      const isExpanded = isDirectory && expandedDirectories.has(entry.path);
      const entryName = entry.path.split("/").at(-1) ?? entry.path;

      return (
        <div key={entry.path}>
          <div
            className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            style={{ paddingLeft: `${12 + depth * 14}px` }}
          >
            <button
              type="button"
              className="inline-flex w-3 shrink-0 items-center justify-center"
              aria-label={isDirectory ? `${isExpanded ? "Collapse" : "Expand"} ${entryName}` : undefined}
              onClick={() => {
                if (isDirectory) {
                  toggleDirectory(entry.path);
                }
              }}
            >
              {isDirectory ? (
                <ChevronRightIcon
                  className={`size-3 text-muted-foreground/70 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              ) : null}
            </button>
            <VscodeEntryIcon pathValue={entry.path} kind={entry.kind} theme={explorerTheme} />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => {
                if (isDirectory) {
                  toggleDirectory(entry.path);
                }
              }}
            >
              {entryName}
            </button>
          </div>
          {isDirectory && isExpanded ? renderExplorerTree(entry.path, depth + 1) : null}
        </div>
      );
    });
  }

  if (!activeProject) {
    return null;
  }

  const explorerContent = (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Explorer
        </span>
      </div>

      <SidebarContent className="gap-0">
        <SidebarGroup className="gap-0 p-2">
          <div className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-foreground/90 transition-colors hover:bg-accent">
            <button
              type="button"
              className="inline-flex w-3 shrink-0 items-center justify-center"
              aria-label={`${expandedDirectories.has(ROOT_DIRECTORY_PATH) ? "Collapse" : "Expand"} ${activeProject.name}`}
              onClick={() => {
                toggleDirectory(ROOT_DIRECTORY_PATH);
              }}
            >
              <ChevronRightIcon
                className={`size-3 shrink-0 text-muted-foreground/70 transition-transform ${
                  expandedDirectories.has(ROOT_DIRECTORY_PATH) ? "rotate-90" : ""
                }`}
              />
            </button>
            <FolderIcon className="size-4 shrink-0 text-muted-foreground/80" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => {
                toggleDirectory(ROOT_DIRECTORY_PATH);
              }}
            >
              {activeProject.name}
            </button>
          </div>

          {expandedDirectories.has(ROOT_DIRECTORY_PATH) ? (
            <div className="space-y-0.5">
              {renderExplorerTree(ROOT_DIRECTORY_PATH)}
              {!isExplorerLoading &&
              (explorerEntriesByParentPath.get(ROOT_DIRECTORY_PATH)?.length ?? 0) === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground/60">No files available</div>
              ) : null}
            </div>
          ) : null}
        </SidebarGroup>
      </SidebarContent>

    </>
  );

  return (
    <>
      <aside
        className={`relative hidden h-full min-h-0 shrink-0 overflow-hidden border-r border-border bg-card text-foreground lg:flex lg:flex-col ${
          desktopCollapsed ? "lg:hidden" : ""
        }`}
        style={{ width: `${desktopWidth}px` }}
      >
        {explorerContent}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize explorer"
          className="absolute top-0 right-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize"
          onPointerDown={handleResizeStart}
        />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetPopup
          side="left"
          showCloseButton={false}
          className="w-[min(88vw,360px)] max-w-[360px] border-r border-border bg-card p-0 text-foreground lg:hidden"
        >
          <div className="flex min-h-0 h-full flex-col">{explorerContent}</div>
        </SheetPopup>
      </Sheet>
    </>
  );
}
