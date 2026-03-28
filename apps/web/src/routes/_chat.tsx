import { ThreadId, type EditorId, type ResolvedKeybindingsConfig } from "@mctools/contracts";
import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeftIcon, PanelRightCloseIcon, PanelRightIcon, SettingsIcon, TerminalSquareIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import ProjectExplorerSidebar, {
  ProjectExplorerProvider,
} from "../components/ProjectExplorerSidebar";
import ThreadSidebar from "../components/Sidebar";
import GitActionsControl from "../components/GitActionsControl";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useProjectStarter } from "../hooks/useProjectStarter";
import { isTerminalFocused } from "../lib/terminalFocus";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { resolveShortcutCommand } from "../keybindings";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useStore } from "../store";
import { resolveSidebarNewThreadEnvMode } from "~/components/Sidebar.logic";
import { OpenInPicker } from "~/components/chat/OpenInPicker";
import { ProjectExplorerTrigger } from "~/components/ProjectExplorerSidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { isElectron } from "~/env";
import { useSettings } from "~/hooks/useSettings";
import { Button } from "~/components/ui/button";
import { Sidebar, SidebarProvider, SidebarRail, useSidebar } from "~/components/ui/sidebar";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];
const EMPTY_AVAILABLE_EDITORS: ReadonlyArray<EditorId> = [];
const PROJECT_EXPLORER_WIDTH = 18 * 16;
const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
export const TOGGLE_TERMINAL_DRAWER_EVENT = "medusajscode:toggle-terminal-drawer";

const GlobalFooterContentContext = createContext<{
  footerContent: ReactNode;
  setFooterContent: (content: ReactNode) => void;
} | null>(null);
const GlobalHeaderContentContext = createContext<{
  headerContent: ReactNode;
  setHeaderContent: (content: ReactNode) => void;
} | null>(null);

export function useGlobalFooterContent() {
  const context = useContext(GlobalFooterContentContext);
  if (!context) {
    throw new Error("useGlobalFooterContent must be used within ChatRouteLayout.");
  }
  return context;
}

export function useGlobalHeaderContent() {
  const context = useContext(GlobalHeaderContentContext);
  if (!context) {
    throw new Error("useGlobalHeaderContent must be used within ChatRouteLayout.");
  }
  return context;
}

function GlobalFooterWordmark() {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[0.9rem] font-black tracking-[-0.06em] text-foreground">
        MedusaJS
      </span>
      <span className="truncate text-xs font-medium tracking-tight text-muted-foreground">Code</span>
    </div>
  );
}

function ChatSidebarHeaderTrigger() {
  const { isMobile, open, openMobile, setOpen, setOpenMobile } = useSidebar();
  const isExpanded = isMobile ? openMobile : open;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label="Toggle chats sidebar"
      onClick={() => {
        if (isMobile) {
          setOpenMobile(!openMobile);
          return;
        }
        setOpen(!open);
      }}
    >
      {isExpanded ? <PanelRightCloseIcon className="size-4" /> : <PanelRightIcon className="size-4" />}
    </Button>
  );
}

function ChatRouteGlobalShortcuts() {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadIdsSize = useThreadSelectionStore((state) => state.selectedThreadIds.size);
  const { activeDraftThread, activeThread, handleNewThread, projects, routeThreadId } =
    useHandleNewThread();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const keybindings = serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS;
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadId
      ? selectThreadTerminalState(state.terminalStateByThreadId, routeThreadId).terminalOpen
      : false,
  );
  const appSettings = useSettings();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape" && selectedThreadIdsSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      const projectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? projects[0]?.id;
      if (!projectId) return;

      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void handleNewThread(projectId, {
          envMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
        });
        return;
      }

      if (command !== "chat.new") return;
      event.preventDefault();
      event.stopPropagation();
      void handleNewThread(projectId, {
        branch: activeThread?.branch ?? activeDraftThread?.branch ?? null,
        worktreePath: activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null,
        envMode: activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
      });
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    clearSelection,
    handleNewThread,
    keybindings,
    projects,
    selectedThreadIdsSize,
    terminalOpen,
    appSettings.defaultThreadEnvMode,
  ]);

  return null;
}

function ChatRouteLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openFolderFromMenu } = useProjectStarter();
  const { activeThread } = useHandleNewThread();
  const projects = useStore((store) => store.projects);
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const keybindings = serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS;
  const availableEditors = serverConfigQuery.data?.availableEditors ?? EMPTY_AVAILABLE_EDITORS;
  const showSidebar = location.pathname !== "/";
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadId
      ? selectThreadTerminalState(state.terminalStateByThreadId, routeThreadId).terminalOpen
      : false,
  );
  const shouldShowProjectExplorer = routeThreadId !== null;
  const activeProject =
    activeThread ? projects.find((project) => project.id === activeThread.projectId) ?? null : null;
  const [headerContent, setHeaderContentState] = useState<ReactNode>(null);
  const [footerContent, setFooterContentState] = useState<ReactNode>(null);
  const setHeaderContent = useCallback((content: ReactNode) => {
    setHeaderContentState(content);
  }, []);
  const setFooterContent = useCallback((content: ReactNode) => {
    setFooterContentState(content);
  }, []);
  const globalHeaderContentValue = useMemo(
    () => ({ headerContent, setHeaderContent }),
    [headerContent, setHeaderContent],
  );
  const globalFooterContentValue = useMemo(
    () => ({ footerContent, setFooterContent }),
    [footerContent, setFooterContent],
  );

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        void navigate({ to: "/settings" });
        return;
      }
      if (action === "open-folder") {
        void openFolderFromMenu();
        return;
      }
      if (action === "new-project") {
        void navigate({ to: "/", search: { action: "new-project" } });
        return;
      }
      if (action === "clone-repository") {
        void navigate({ to: "/", search: { action: "clone" } });
        return;
      }
      if (action === "close-project") {
        void navigate({ to: "/" });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate, openFolderFromMenu]);

  if (!showSidebar) {
    return (
      <>
        <ChatRouteGlobalShortcuts />
        <Outlet />
      </>
    );
  }

  return (
    <GlobalHeaderContentContext.Provider value={globalHeaderContentValue}>
      <GlobalFooterContentContext.Provider value={globalFooterContentValue}>
      <ProjectExplorerProvider>
        <SidebarProvider defaultOpen>
          <ChatRouteGlobalShortcuts />
          <div className={`flex min-h-svh w-full flex-1 flex-col ${isElectron ? "pb-[40px]" : ""}`}>
          {isElectron ? (
            <div className="drag-region relative flex h-[52px] shrink-0 items-center border-b border-border bg-background px-5 pl-[90px]">
              <div className="pointer-events-none absolute left-1/2 flex max-w-[min(38vw,30rem)] -translate-x-1/2 items-center gap-2 px-4">
                <span
                  className="truncate text-center text-xs font-medium tracking-wide text-muted-foreground/70"
                  title={activeThread?.title ?? "No active thread"}
                >
                  {activeThread?.title ?? "No active thread"}
                </span>
                {activeProject ? (
                  <span
                    className="shrink-0 rounded-full border border-border bg-muted/55 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/85"
                    title={activeProject.name}
                  >
                    {activeProject.name}
                  </span>
                ) : null}
              </div>
              <div className="ms-auto flex min-w-0 max-w-[calc(100%-10rem)] items-center justify-end gap-2 [-webkit-app-region:no-drag]">
                {headerContent ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {headerContent}
                  </div>
                ) : null}
                {activeProject ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <OpenInPicker
                      keybindings={keybindings}
                      availableEditors={availableEditors}
                      openInCwd={activeProject.cwd}
                    />
                    {activeThread ? (
                      <GitActionsControl
                        gitCwd={activeProject.cwd}
                        activeThreadId={activeThread.id}
                      />
                    ) : null}
                  </div>
                ) : null}
                <div className="flex shrink-0 items-center gap-1">
                  {activeProject ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            aria-label="Toggle terminal drawer"
                            onClick={() => {
                              window.dispatchEvent(new Event(TOGGLE_TERMINAL_DRAWER_EVENT));
                            }}
                          >
                            <TerminalSquareIcon
                              className={`size-4 ${
                                terminalOpen ? "text-foreground" : "text-muted-foreground"
                              }`}
                            />
                          </Button>
                        }
                      />
                      <TooltipPopup side="bottom">Toggle terminal drawer</TooltipPopup>
                    </Tooltip>
                  ) : null}
                  {shouldShowProjectExplorer ? <ProjectExplorerTrigger /> : null}
                  <ChatSidebarHeaderTrigger />
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {shouldShowProjectExplorer ? <ProjectExplorerSidebar /> : null}
            <Outlet />
            <Sidebar
              side="right"
              collapsible="offcanvas"
              className={`border-l border-border bg-card text-foreground ${
                isElectron ? "md:top-[52px] md:bottom-[40px] md:h-[calc(100svh-92px)]" : ""
              }`}
              resizable={{
                minWidth: THREAD_SIDEBAR_MIN_WIDTH,
                shouldAcceptWidth: ({ nextWidth, wrapper }) =>
                  wrapper.clientWidth - nextWidth >=
                  THREAD_MAIN_CONTENT_MIN_WIDTH +
                    (shouldShowProjectExplorer ? PROJECT_EXPLORER_WIDTH : 0),
                storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
              }}
            >
              <ThreadSidebar />
              <SidebarRail />
            </Sidebar>
          </div>
          {isElectron ? (
            <div className="fixed inset-x-0 bottom-0 z-20 flex h-[40px] items-center gap-4 border-t border-border bg-background px-4">
              <div className="shrink-0 [-webkit-app-region:no-drag]">
                <GlobalFooterWordmark />
              </div>
              <div className="flex min-w-0 flex-1 items-center [-webkit-app-region:no-drag]">
                {footerContent ? (
                  <div className="flex min-w-0 flex-1 items-center overflow-x-auto pl-2">
                    {footerContent}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 [-webkit-app-region:no-drag]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                  onClick={() => {
                    if (location.pathname === "/settings") {
                      window.history.back();
                      return;
                    }
                    void navigate({ to: "/settings" });
                  }}
                >
                  {location.pathname === "/settings" ? (
                    <ArrowLeftIcon className="size-3.5" />
                  ) : (
                    <SettingsIcon className="size-3.5" />
                  )}
                  <span className="text-xs">
                    {location.pathname === "/settings" ? "Back" : "Settings"}
                  </span>
                </Button>
              </div>
            </div>
          ) : null}
          </div>
        </SidebarProvider>
      </ProjectExplorerProvider>
      </GlobalFooterContentContext.Provider>
    </GlobalHeaderContentContext.Provider>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
