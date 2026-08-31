"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import {
  CircleHelp,
  Download,
  Ellipsis,
  Moon,
  PanelLeft,
  Printer,
  Redo2,
  Sun,
  Terminal,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useWorkspace, type ViewMode } from "@/state/workspace";
import { renderDocumentCached } from "@/core/latex/renderCache";
import { exportActiveTex } from "@/lib/export";
import { cn } from "@/lib/text";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { IconButton } from "@/components/primitives/IconButton";
import { SegmentedControl } from "@/components/primitives/SegmentedControl";
import { Tooltip } from "@/components/primitives/Tooltip";

export interface ToolbarProps {
  onOpenGuide: () => void;
  onOpenExport: () => void;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}

function Menu({
  items,
  statusLabel,
  statusTone,
  onClose,
}: {
  items: MenuItem[];
  statusLabel: string;
  statusTone: "forest" | "gold" | "oxblood";
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="animate-fade-in-up absolute top-[calc(100%+6px)] right-2 z-50 w-[248px] overflow-hidden rounded-panel border border-line bg-card shadow-panel"
    >
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            statusTone === "forest" && "bg-forest",
            statusTone === "gold" && "bg-gold",
            statusTone === "oxblood" && "bg-oxblood",
          )}
        />
        <span className="text-[11.5px] font-semibold text-ink-soft">{statusLabel}</span>
      </div>
      <div className="p-1.5">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={cn(
              "flex h-11 w-full items-center gap-3 rounded-ctl px-3 text-left text-[13.5px] font-medium transition-colors",
              item.disabled
                ? "cursor-not-allowed text-ink-faint/60"
                : item.tone === "danger"
                  ? "text-oxblood hover:bg-oxblood-soft"
                  : "text-ink hover:bg-inset",
            )}
          >
            <span className="shrink-0 text-ink-soft">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toolbar({ onOpenGuide, onOpenExport }: ToolbarProps) {
  const activeDoc = useWorkspace((state) =>
    state.documents.find((d) => d.id === state.activeDocumentId) ?? null,
  );
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const viewMode = useWorkspace((state) => state.viewMode);
  const setViewMode = useWorkspace((state) => state.setViewMode);
  const toggleSidebar = useWorkspace((state) => state.toggleSidebar);
  const sidebarOpen = useWorkspace((state) => state.sidebarOpen);
  const inspectorOpen = useWorkspace((state) => state.inspectorOpen);
  const toggleInspector = useWorkspace((state) => state.toggleInspector);
  const theme = useWorkspace((state) => state.theme);
  const setTheme = useWorkspace((state) => state.setTheme);
  const webmcpStatus = useWorkspace((state) => state.webmcpStatus);
  const registeredTools = useWorkspace((state) => state.registeredTools);
  const undo = useWorkspace((state) => state.undo);
  const redo = useWorkspace((state) => state.redo);
  const undoDepth = useWorkspace((state) => state.undoDepth);
  const redoDepth = useWorkspace((state) => state.redoDepth);
  const renameDocument = useWorkspace((state) => state.renameDocument);

  const [titleDraft, setTitleDraft] = useState(activeDoc?.title ?? "");
  const [syncedDocId, setSyncedDocId] = useState(activeDoc?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  if (activeDoc?.id !== syncedDocId) {
    setSyncedDocId(activeDoc?.id);
    setTitleDraft(activeDoc?.title ?? "");
  }

  const errorEntries = activeDoc
    ? [...renderDocumentCached(activeDoc.blocks).entries()].filter(([, r]) => r.status === "error")
    : [];
  const errorCount = errorEntries.length;

  const handleExport = () => {
    if (!activeDoc) return;
    exportActiveTex(activeDoc);
    posthog.capture("tex_exported");
  };

  const statusConfig =
    webmcpStatus === "ready"
      ? { label: `${registeredTools.length} tools live`, tone: "forest" as const }
      : webmcpStatus === "registering"
        ? { label: "Connecting…", tone: "gold" as const }
        : webmcpStatus === "error"
          ? { label: "WebMCP error", tone: "oxblood" as const }
          : { label: "WebMCP off", tone: "gold" as const };

  const commitTitle = () => {
    if (!activeDoc) return;
    const next = titleDraft.trim();
    if (next && next !== activeDoc.title) {
      renameDocument(activeDoc.id, next);
      posthog.capture("document_renamed");
    } else {
      setTitleDraft(activeDoc.title);
    }
  };

  const handleOpenGuide = () => {
    posthog.capture("agent_guide_opened");
    onOpenGuide();
  };

  const handleToggleInspector = () => {
    posthog.capture("inspector_toggled", { opening: !inspectorOpen });
    toggleInspector();
  };

  const handleSetTheme = (newTheme: "light" | "dark") => {
    posthog.capture("theme_changed", { theme: newTheme });
    setTheme(newTheme);
  };

  const handleSetViewMode = (mode: ViewMode) => {
    posthog.capture("view_mode_changed", { view_mode: mode });
    setViewMode(mode);
  };

  const titleInput = (
    <input
      ref={titleRef}
      value={titleDraft}
      aria-label="Document title"
      onChange={(event) => setTitleDraft(event.target.value)}
      onBlur={commitTitle}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          titleRef.current?.blur();
        }
        if (event.key === "Escape") {
          setTitleDraft(activeDoc?.title ?? "");
          titleRef.current?.blur();
        }
      }}
      disabled={!activeDoc}
      className="font-display min-w-0 flex-1 truncate rounded-ctl border border-transparent bg-transparent px-2 py-1.5 text-[16px] font-semibold tracking-[-0.01em] text-ink outline-none hover:border-line focus:border-bronze focus:bg-card disabled:opacity-50"
    />
  );

  const errorChip = errorCount > 0 && activeDoc ? (
    <button
      type="button"
      onClick={() => {
        const [blockId] = errorEntries[0];
        useWorkspace.getState().focusBlock(blockId);
        if (viewMode === "preview") setViewMode("split");
      }}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-ctl border border-[color-mix(in_srgb,var(--oxblood)_38%,transparent)] bg-oxblood-soft px-2.5 text-[12px] font-bold text-oxblood-ink transition-all hover:brightness-97"
      aria-label={`${errorCount} render ${errorCount === 1 ? "error" : "errors"}. Jump to first.`}
    >
      <TriangleAlert size={13} />
      {errorCount}
      <span className="hidden sm:inline">{errorCount === 1 ? "error" : "errors"}</span>
    </button>
  ) : null;

  const viewOptions = isDesktop
    ? [
        { value: "source" as ViewMode, label: "Source" },
        { value: "split" as ViewMode, label: "Split" },
        { value: "preview" as ViewMode, label: "Preview" },
      ]
    : [
        { value: "source" as ViewMode, label: "Source" },
        { value: "preview" as ViewMode, label: "Preview" },
      ];

  const menuItems: MenuItem[] = [
    { label: "Print / export PDF", icon: <Printer size={16} />, onClick: onOpenExport, disabled: !activeDoc },
    { label: "Connect your agent", icon: <CircleHelp size={16} />, onClick: handleOpenGuide },
    { label: theme === "dark" ? "Light theme" : "Dark theme", icon: theme === "dark" ? <Sun size={16} /> : <Moon size={16} />, onClick: () => handleSetTheme(theme === "dark" ? "light" : "dark") },
  ];

  return (
    <header className="no-print bg-card">
      <div className="flex h-[52px] items-center gap-1.5 border-b border-line px-2 sm:px-3">
        <IconButton
          label={sidebarOpen ? "Hide documents" : "Show documents"}
          icon={<PanelLeft size={17} />}
          onClick={() => toggleSidebar()}
          active={sidebarOpen}
        />

        {titleInput}
        {errorChip}

        <div className="hidden flex-1 md:block" />

        <div className="hidden items-center gap-0.5 md:flex">
          <SegmentedControl<ViewMode>
            ariaLabel="View mode"
            value={isDesktop ? viewMode : viewMode === "split" ? "preview" : viewMode}
            onChange={(mode) => handleSetViewMode(mode)}
            options={viewOptions}
          />
        </div>

        <div className="hidden items-center gap-0.5 md:flex">
          <Tooltip content="Undo (⌘Z)" align="start">
            <IconButton label="Undo" icon={<Undo2 size={15} />} onClick={undo} disabled={undoDepth === 0} />
          </Tooltip>
          <Tooltip content="Redo (⇧⌘Z)">
            <IconButton label="Redo" icon={<Redo2 size={15} />} onClick={redo} disabled={redoDepth === 0} />
          </Tooltip>
        </div>

        <div className="hidden h-5 w-px bg-line md:block" />

        <div className="hidden items-center gap-0.5 md:flex">
          <Tooltip content="Export .tex (⌘S)">
            <IconButton label="Export as .tex" icon={<Download size={15} />} onClick={handleExport} disabled={!activeDoc} />
          </Tooltip>
          <Tooltip content="Print / PDF">
            <IconButton
              label="Print or export as PDF"
              icon={<Printer size={15} />}
              onClick={onOpenExport}
              disabled={!activeDoc}
            />
          </Tooltip>
          <Tooltip content="Tool Inspector">
            <IconButton
              label="Open Tool Inspector"
              icon={<Terminal size={15} />}
              onClick={handleToggleInspector}
              active={inspectorOpen}
            />
          </Tooltip>
          <Tooltip content={theme === "dark" ? "Light theme" : "Dark theme"} align="end">
            <IconButton
              label="Toggle theme"
              icon={theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              onClick={() => handleSetTheme(theme === "dark" ? "light" : "dark")}
              className="hidden sm:inline-flex"
            />
          </Tooltip>
        </div>

        <div className="hidden h-5 w-px bg-line lg:block" />

        <Tooltip content="How to connect your agent" align="end">
          <button
            type="button"
            onClick={handleOpenGuide}
            className={cn(
              "hidden h-8 shrink-0 items-center gap-1.5 rounded-ctl border px-2.5 text-[11.5px] font-semibold transition-all lg:inline-flex",
              statusConfig.tone === "forest" &&
                "border-[color-mix(in_srgb,var(--forest)_32%,transparent)] bg-forest-soft text-forest-ink",
              statusConfig.tone === "gold" &&
                "border-[color-mix(in_srgb,var(--gold)_35%,transparent)] bg-bronze-soft text-gold",
              statusConfig.tone === "oxblood" &&
                "border-[color-mix(in_srgb,var(--oxblood)_30%,transparent)] bg-oxblood-soft text-oxblood-ink",
            )}
            aria-label={`WebMCP status: ${statusConfig.label}. Open the agent guide.`}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                webmcpStatus === "ready" && "bg-forest",
                webmcpStatus === "registering" && "animate-pulse bg-gold",
                webmcpStatus === "error" && "bg-oxblood",
                webmcpStatus === "unavailable" && "bg-gold",
              )}
            />
            {statusConfig.label}
            <CircleHelp size={12.5} />
          </button>
        </Tooltip>

        <div className="relative md:hidden">
          <IconButton
            label="More actions"
            icon={<Ellipsis size={18} />}
            onClick={() => setMenuOpen((open) => !open)}
            active={menuOpen}
          />
          {menuOpen ? (
            <Menu
              items={menuItems}
              statusLabel={statusConfig.label}
              statusTone={statusConfig.tone}
              onClose={() => setMenuOpen(false)}
            />
          ) : null}
        </div>
      </div>

      <div className="flex h-[46px] items-center gap-1 border-b border-line px-2 md:hidden">
        <div className="min-w-0 flex-1">
          <SegmentedControl<ViewMode>
            ariaLabel="View mode"
            value={viewMode === "split" ? "preview" : viewMode}
            onChange={(mode) => handleSetViewMode(mode)}
            options={viewOptions}
          />
        </div>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <IconButton label="Undo" icon={<Undo2 size={16} />} onClick={undo} disabled={undoDepth === 0} />
        <IconButton label="Redo" icon={<Redo2 size={16} />} onClick={redo} disabled={redoDepth === 0} />
        <IconButton label="Export as .tex" icon={<Download size={16} />} onClick={handleExport} disabled={!activeDoc} />
        <IconButton
          label="Open Tool Inspector"
          icon={<Terminal size={16} />}
          onClick={handleToggleInspector}
          active={inspectorOpen}
        />
      </div>
    </header>
  );
}
