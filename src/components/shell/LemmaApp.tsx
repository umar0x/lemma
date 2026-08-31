"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace, flushPendingSaves } from "@/state/workspace";
import { exportActiveTex } from "@/lib/export";
import { useWebMcpRegistration } from "@/hooks/useWebMcpRegistration";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/text";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { EditorArea } from "./EditorArea";
import { StatusBar } from "./StatusBar";
import { ActivityToasts } from "./ActivityToasts";
import { TemplateDialog } from "@/components/documents/TemplateDialog";
import { AgentGuideDialog } from "@/components/documents/AgentGuideDialog";
import { ToolInspector } from "@/components/inspector/ToolInspector";
import { PrintSurface } from "@/components/print/PrintSurface";
import { ExportDialog } from "@/components/print/ExportDialog";
import { BrandMark } from "./BrandMark";

const VIEW_MODES = ["source", "split", "preview"] as const;

function Splash() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-paper">
      <span className="bg-gradient-brand flex h-14 w-14 animate-pulse items-center justify-center rounded-[18px] shadow-raised">
        <BrandMark size={30} />
      </span>
      <div className="text-center">
        <div className="font-display text-[20px] font-semibold tracking-[-0.01em] text-ink">Lemma</div>
        <div className="mt-1 text-[12.5px] text-ink-faint">Preparing your workspace…</div>
      </div>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "TEXTAREA" ||
    element.tagName === "INPUT" ||
    element.isContentEditable ||
    element.closest(".cm-content") !== null
  );
}

export default function LemmaApp() {
  const status = useWorkspace((state) => state.status);
  const hydrate = useWorkspace((state) => state.hydrate);
  const sidebarOpen = useWorkspace((state) => state.sidebarOpen);
  const inspectorOpen = useWorkspace((state) => state.inspectorOpen);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isRoomyWithoutSidebar = useMediaQuery("(min-width: 1200px)");
  const isRoomyWithSidebar = useMediaQuery("(min-width: 1520px)");
  const inspectorInline =
    isRoomyWithSidebar || (!sidebarOpen && isRoomyWithoutSidebar && isDesktop);
  const inspectorVariant = !isDesktop ? "sheet" : inspectorInline ? "inline" : "dock";
  const [templateOpen, setTemplateOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const hydratedRef = useRef(false);

  useWebMcpRegistration();

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (sidebarOpen && !isDesktop) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") useWorkspace.getState().toggleSidebar(false);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener("keydown", onKeyDown);
      };
    }
  }, [sidebarOpen, isDesktop]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flushPendingSaves();
    };
    const onPageHide = () => {
      void flushPendingSaves();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const state = useWorkspace.getState();
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        const active = state.documents.find((d) => d.id === state.activeDocumentId);
        if (active) exportActiveTex(active);
      } else if (event.key.toLowerCase() === "z") {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      } else if (event.key === "1" || event.key === "2" || event.key === "3") {
        const next = VIEW_MODES[Number(event.key) - 1];
        if (next) state.setViewMode(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (status === "loading") {
    return <Splash />;
  }

  const closeInspector = () => useWorkspace.getState().toggleInspector(false);

  return (
    <>
      <div className="app-shell flex h-dvh overflow-hidden bg-paper text-ink">
      <div
        className={cn(
          "no-print hidden h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out lg:block",
          sidebarOpen ? "w-[272px]" : "w-0",
        )}
      >
        <Sidebar onNewDocument={() => setTemplateOpen(true)} />
      </div>
      {sidebarOpen && !isDesktop ? (
        <div className="no-print fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-[rgba(20,15,9,0.4)] backdrop-blur-[2px]"
            onClick={() => useWorkspace.getState().toggleSidebar(false)}
            aria-hidden="true"
          />
          <div className="animate-fade-in-up absolute top-0 bottom-0 left-0 w-[min(86vw,300px)] shadow-panel">
            <Sidebar
              onNewDocument={() => {
                useWorkspace.getState().toggleSidebar(false);
                setTemplateOpen(true);
              }}
              onNavigate={() => useWorkspace.getState().toggleSidebar(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar onOpenGuide={() => setGuideOpen(true)} onOpenExport={() => setExportOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <EditorArea onNewDocument={() => setTemplateOpen(true)} />
            {inspectorOpen && inspectorVariant === "dock" ? (
              <ToolInspector open variant="dock" onClose={closeInspector} />
            ) : null}
            <StatusBar />
          </div>
          {inspectorOpen && inspectorVariant === "inline" ? (
            <ToolInspector open variant="inline" onClose={closeInspector} />
          ) : null}
        </div>
      </div>

      <ActivityToasts />
      <TemplateDialog open={templateOpen} onClose={() => setTemplateOpen(false)} />
      <AgentGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      </div>
      {inspectorOpen && inspectorVariant === "sheet" ? (
        <ToolInspector open variant="sheet" onClose={closeInspector} />
      ) : null}
      <PrintSurface />
    </>
  );
}
