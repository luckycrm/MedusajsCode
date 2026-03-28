import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";

import { projectQueryKeys } from "../lib/projectReactQuery";
import { readNativeApi } from "../nativeApi";
import { Button } from "./ui/button";
import { Sheet, SheetPopup } from "./ui/sheet";
import { toastManager } from "./ui/toast";

type ProjectEditorFile = {
  cwd: string;
  projectName: string;
  relativePath: string;
};

const ProjectFileEditorContext = createContext<{
  activeFile: ProjectEditorFile | null;
  openFile: (file: ProjectEditorFile) => Promise<boolean>;
  closeFile: () => Promise<boolean>;
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
} | null>(null);

export function useProjectFileEditor() {
  const context = useContext(ProjectFileEditorContext);
  if (!context) {
    throw new Error("useProjectFileEditor must be used within ProjectFileEditorProvider.");
  }
  return context;
}

export function ProjectFileEditorProvider({ children }: { children: ReactNode }) {
  const [activeFile, setActiveFile] = useState<ProjectEditorFile | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const confirmDiscardChanges = useCallback(async () => {
    if (!hasUnsavedChanges) {
      return true;
    }

    const api = readNativeApi();
    if (!api) {
      return false;
    }

    return api.dialogs.confirm("Discard unsaved changes in the editor?");
  }, [hasUnsavedChanges]);

  const openFile = useCallback(
    async (file: ProjectEditorFile) => {
      if (
        activeFile &&
        activeFile.cwd === file.cwd &&
        activeFile.relativePath === file.relativePath
      ) {
        return true;
      }

      const confirmed = await confirmDiscardChanges();
      if (!confirmed) {
        return false;
      }

      setActiveFile(file);
      setHasUnsavedChanges(false);
      return true;
    },
    [activeFile, confirmDiscardChanges],
  );

  const closeFile = useCallback(async () => {
    if (activeFile === null) {
      return true;
    }

    const confirmed = await confirmDiscardChanges();
    if (!confirmed) {
      return false;
    }

    setActiveFile(null);
    setHasUnsavedChanges(false);
    return true;
  }, [activeFile, confirmDiscardChanges]);

  const contextValue = useMemo(
    () => ({
      activeFile,
      openFile,
      closeFile,
      setHasUnsavedChanges,
    }),
    [activeFile, closeFile, openFile],
  );

  return (
    <ProjectFileEditorContext.Provider value={contextValue}>
      {children}
      <ProjectFileEditorSheet />
    </ProjectFileEditorContext.Provider>
  );
}

function ProjectFileEditorSheet() {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { activeFile, closeFile, setHasUnsavedChanges } = useProjectFileEditor();
  const [draft, setDraft] = useState("");
  const [savedContents, setSavedContents] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const fileQuery = useQuery({
    queryKey: projectQueryKeys.readFile(activeFile?.cwd ?? null, activeFile?.relativePath ?? null),
    enabled: activeFile !== null,
    queryFn: async () => {
      const api = readNativeApi();
      if (!api || !activeFile) {
        throw new Error("Unable to load file.");
      }
      return api.projects.readFile({
        cwd: activeFile.cwd,
        relativePath: activeFile.relativePath,
      });
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!fileQuery.data) {
      return;
    }
    setDraft(fileQuery.data.contents);
    setSavedContents(fileQuery.data.contents);
  }, [fileQuery.data]);

  const isDirty = draft !== savedContents;
  const lineNumbers = useMemo(() => {
    const lineCount = Math.max(1, draft.split("\n").length);
    return Array.from({ length: lineCount }, (_, index) => index + 1);
  }, [draft]);

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
    return () => {
      setHasUnsavedChanges(false);
    };
  }, [isDirty, setHasUnsavedChanges]);

  useEffect(() => {
    if (!activeFile || fileQuery.isPending) {
      return;
    }
    textareaRef.current?.focus();
  }, [activeFile, fileQuery.isPending]);

  const saveMutation = useMutation({
    mutationFn: async (contents: string) => {
      const api = readNativeApi();
      if (!api || !activeFile) {
        throw new Error("Unable to save file.");
      }
      return api.projects.writeFile({
        cwd: activeFile.cwd,
        relativePath: activeFile.relativePath,
        contents,
      });
    },
    onSuccess: async (_, contents) => {
      if (!activeFile) {
        return;
      }

      setSavedContents(contents);
      queryClient.setQueryData(projectQueryKeys.readFile(activeFile.cwd, activeFile.relativePath), {
        relativePath: activeFile.relativePath,
        contents,
      });
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
      toastManager.add({
        type: "success",
        title: "File saved",
        description: activeFile.relativePath,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Unable to save file",
        description: error instanceof Error ? error.message : "Unknown save error.",
      });
    },
  });

  const handleSave = useCallback(async () => {
    if (!activeFile || !isDirty || saveMutation.isPending) {
      return;
    }
    await saveMutation.mutateAsync(draft);
  }, [activeFile, draft, isDirty, saveMutation]);

  const handleEditorScroll = useCallback((event: UIEvent<HTMLTextAreaElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    if (!activeFile) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [activeFile, handleSave]);

  return (
    <Sheet
      open={activeFile !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          void closeFile();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        className="w-[min(100vw,56rem)] max-w-none border-l border-border bg-background p-0"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {activeFile?.relativePath ?? "File editor"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {activeFile?.projectName ?? ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => {
                  setDraft(savedContents);
                }}
              >
                <RotateCcwIcon className="size-3.5" />
                Revert
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5"
                disabled={!isDirty || saveMutation.isPending || fileQuery.isPending}
                onClick={() => {
                  void handleSave();
                }}
              >
                {saveMutation.isPending ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <SaveIcon className="size-3.5" />
                )}
                Save
              </Button>
            </div>
          </div>

          {fileQuery.isPending ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Loading file...
            </div>
          ) : fileQuery.isError ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
              {fileQuery.error instanceof Error ? fileQuery.error.message : "Unable to load file."}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
              <div className="w-14 shrink-0 overflow-hidden border-r border-border/70 bg-muted/30 text-right font-mono text-xs leading-6 text-muted-foreground">
                <div className="px-3 py-3" style={{ transform: `translateY(-${scrollTop}px)` }}>
                  {lineNumbers.map((lineNumber) => (
                    <div key={lineNumber}>{lineNumber}</div>
                  ))}
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onScroll={handleEditorScroll}
                spellCheck={false}
                className="min-h-0 flex-1 resize-none bg-background px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none"
              />
            </div>
          )}
        </div>
      </SheetPopup>
    </Sheet>
  );
}
