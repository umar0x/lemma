"use client";

import { EyeOff, Eye } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { renderDocumentCached } from "@/core/latex/renderCache";

export function StatusBar() {
  const activeDoc = useWorkspace((state) =>
    state.documents.find((d) => d.id === state.activeDocumentId) ?? null,
  );
  const saveState = useWorkspace((state) => state.saveState);
  const viewMode = useWorkspace((state) => state.viewMode);
  const webmcpStatus = useWorkspace((state) => state.webmcpStatus);
  const registeredTools = useWorkspace((state) => state.registeredTools);
  const showResolved = useWorkspace((state) => state.commentsShowResolved);
  const setCommentsShowResolved = useWorkspace((state) => state.setCommentsShowResolved);

  if (!activeDoc) return null;

  let errors = 0;
  let ok = 0;
  for (const render of renderDocumentCached(activeDoc.blocks).values()) {
    if (render.status === "error") errors += 1;
    if (render.status === "ok") ok += 1;
  }
  const resolvedCount = activeDoc.threads.filter((t) => t.resolved).length;

  const saveLabel =
    saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : "Saved · local";

  return (
    <footer className="no-print flex h-[28px] shrink-0 items-center gap-3 border-t border-line bg-card px-3 pb-[env(safe-area-inset-bottom)] text-[11px] leading-none text-ink-soft">
      <span
        className={
          saveState === "saved"
            ? "inline-flex items-center gap-1.5 text-forest"
            : "inline-flex items-center gap-1.5"
        }
      >
        <span
          className={
            saveState === "saved"
              ? "h-1.5 w-1.5 rounded-full bg-forest"
              : "h-1.5 w-1.5 animate-pulse rounded-full bg-gold"
          }
        />
        {saveLabel}
      </span>
      <span className="hidden sm:inline">
        {activeDoc.blocks.length} blocks · {ok} rendered
        {errors > 0 ? (
          <span className="ml-2 font-semibold text-oxblood">{errors} with errors</span>
        ) : null}
      </span>
      {errors > 0 ? (
        <span className="font-semibold text-oxblood sm:hidden">{errors} err</span>
      ) : null}
      <span className="flex-1" />
      {resolvedCount > 0 ? (
        <button
          type="button"
          onClick={() => setCommentsShowResolved(!showResolved)}
          aria-pressed={showResolved}
          title={showResolved ? "Hide resolved comment threads in the preview" : "Show resolved comment threads in the preview"}
          className="inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 font-semibold text-ink-soft transition-colors hover:text-bronze"
        >
          {showResolved ? <Eye size={11} /> : <EyeOff size={11} />}
          <span className="hidden sm:inline">{resolvedCount} resolved</span>
        </button>
      ) : null}
      <span className="hidden md:inline">{viewMode} view</span>
      <span className="hidden xl:inline">
        {webmcpStatus === "ready"
          ? `${registeredTools.length} agent tools registered`
          : "Open in ChatGPT or Chrome to connect an agent"}
      </span>
    </footer>
  );
}
