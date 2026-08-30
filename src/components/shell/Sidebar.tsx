"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FileText, Search, Plus, MessageSquare, TriangleAlert } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { renderDocumentCached } from "@/core/latex/renderCache";
import { cn, truncate } from "@/lib/text";
import { BrandMark } from "./BrandMark";

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface DocumentSummary {
  id: string;
  title: string;
  snippet: string;
  errorCount: number;
  openComments: number;
  updatedAt: number;
}

function toSnippet(latex: string): string {
  const sectionMatch = /\\(?:sub)*section\*?\{([^}]*)\}/.exec(latex);
  const base = sectionMatch ? sectionMatch[1] : latex;
  return truncate(
    base
      .replace(/\\(?:begin|end)\{[^}]*\}/g, " ")
      .replace(/\\[a-zA-Z]+\*?/g, " ")
      .replace(/[{}$]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    64,
  );
}

function useDocumentSummaries(query: string): DocumentSummary[] {
  const documents = useWorkspace((state) => state.documents);
  return useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return documents
      .filter(
        (doc) =>
          !normalized ||
          doc.title.toLowerCase().includes(normalized) ||
          doc.blocks.some((block) => block.latex.toLowerCase().includes(normalized)),
      )
      .map((doc) => {
        const renders = renderDocumentCached(doc.blocks);
        let errorCount = 0;
        for (const render of renders.values()) {
          if (render.status === "error") errorCount += 1;
        }
        const source =
          doc.blocks.find(
            (b) =>
              b.type === "text" &&
              b.latex.trim() &&
              !b.latex.trimStart().startsWith("%") &&
              !b.latex.trimStart().startsWith("\\begin"),
          ) ??
          doc.blocks.find((b) => b.type === "text" && b.latex.trim());
        return {
          id: doc.id,
          title: doc.title,
          snippet: source ? toSnippet(source.latex) : "",
          errorCount,
          openComments: doc.threads.filter((t) => !t.resolved).length,
          updatedAt: doc.updatedAt,
        };
      });
  }, [documents, query]);
}

function documentFilterPayload(summaries: DocumentSummary[]) {
  return JSON.stringify({
    tool: "filter_documents",
    matched: summaries.length,
    documents: summaries.slice(0, 10).map((doc) => ({
      id: doc.id,
      title: doc.title,
      errorCount: doc.errorCount,
      openComments: doc.openComments,
    })),
  });
}

export interface SidebarProps {
  onNewDocument: () => void;
  onNavigate?: () => void;
}

const DECLARATIVE_TOOL_ATTRS = {
  toolname: "filter_documents",
  tooldescription:
    "Filter the documents in the workspace sidebar by title or content. Use this when the user asks to find, search, or locate one of their documents.",
  toolautosubmit: "",
} as const;

export function Sidebar({ onNewDocument, onNavigate }: SidebarProps) {
  const activeDocumentId = useWorkspace((state) => state.activeDocumentId);
  const openDocument = useWorkspace((state) => state.openDocument);
  const deleteDocument = useWorkspace((state) => state.deleteDocument);
  const [filter, setFilter] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const summaries = useDocumentSummaries(filter);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = formData.get("query");
    const value = typeof query === "string" ? query : "";
    setFilter(value);
    const submitEvent = event.nativeEvent as SubmitEvent;
    if (submitEvent.agentInvoked) {
      if (!useWorkspace.getState().sidebarOpen) useWorkspace.getState().toggleSidebar(true);
      submitEvent.respondWith?.(Promise.resolve(documentFilterPayload(summaries)));
    }
  };

  return (
    <aside className="no-print flex h-full w-full shrink-0 flex-col border-r border-line bg-card lg:w-[272px]">
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2.5">
          <span className="shadow-soft">
            <BrandMark size={30} />
          </span>
          <div className="leading-tight">
            <div className="font-display text-[15.5px] font-semibold tracking-[-0.01em] text-ink">Lemma</div>
            <div className="text-[10.5px] font-medium tracking-[0.06em] text-ink-faint uppercase">Live LaTeX · with your agent</div>
          </div>
        </div>
      </div>

      <form
        role="search"
        {...DECLARATIVE_TOOL_ATTRS}
        onSubmit={handleSearchSubmit}
        className="px-3 pt-1 pb-3"
      >
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
          <input
            name="query"
            type="search"
            value={filter}
            {...{ toolparamdescription: "Text to search for in document titles and content." }}
            placeholder="Search documents…"
            aria-label="Search documents"
            onChange={(event) => setFilter(event.target.value)}
            className="h-9 w-full rounded-ctl border border-line bg-inset pr-2.5 pl-8 text-[16px] text-ink placeholder:text-ink-faint transition-all focus:border-bronze focus:bg-card focus:ring-2 focus:ring-[color-mix(in_srgb,var(--bronze)_18%,transparent)] focus:outline-none md:h-8 md:text-[12.5px]"
          />
        </div>
      </form>

      <div className="flex items-center justify-between px-4 pb-1.5">
        <span className="text-[10.5px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          Documents · {summaries.length}
        </span>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Documents">
        {summaries.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-ink-faint">
            No documents match “{filter}”.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {summaries.map((doc) => {
              const active = doc.id === activeDocumentId;
              return (
                <li key={doc.id}>
                  <div
                    className={cn(
                      "group relative flex cursor-pointer items-start gap-2.5 rounded-ctl border px-3 py-2.5 transition-all duration-150",
                      active
                        ? "border-[color-mix(in_srgb,var(--bronze)_24%,transparent)] bg-bronze-soft shadow-soft"
                        : "border-transparent hover:border-line hover:bg-inset",
                    )}
                    onClick={() => {
                      openDocument(doc.id);
                      onNavigate?.();
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDocument(doc.id);
                        onNavigate?.();
                      }
                    }}
                  >
                    {active ? (
                      <span className="bg-gradient-brand absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full" />
                    ) : null}
                    <FileText
                      size={14}
                      className={cn("mt-0.5 shrink-0 transition-colors", active ? "text-bronze" : "text-ink-faint")}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate text-[13px] font-medium",
                          active ? "text-bronze-ink" : "text-ink",
                        )}
                      >
                        {doc.title}
                      </div>
                      {doc.snippet ? (
                        <div className="mt-0.5 truncate text-[11.5px] leading-snug text-ink-faint">{doc.snippet}</div>
                      ) : null}
                      <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-ink-soft">
                        <span>{relativeTime(doc.updatedAt)}</span>
                        {doc.errorCount > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-oxblood-soft px-1.5 py-px font-semibold text-oxblood-ink"
                            title={`${doc.errorCount} render ${doc.errorCount === 1 ? "error" : "errors"}`}
                          >
                            <TriangleAlert size={9} />
                            {doc.errorCount}
                          </span>
                        ) : null}
                        {doc.openComments > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-forest-soft px-1.5 py-px font-semibold text-forest-ink"
                            title={`${doc.openComments} open comment ${doc.openComments === 1 ? "thread" : "threads"}`}
                          >
                            <MessageSquare size={9} />
                            {doc.openComments}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={confirmingDelete === doc.id ? "Confirm delete" : `Delete ${doc.title}`}
                      className={cn(
                        "mt-0.5 shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold transition-all",
                        confirmingDelete === doc.id
                          ? "bg-oxblood-soft text-oxblood-ink"
                          : "text-ink-faint opacity-0 hover:bg-oxblood-soft hover:text-oxblood focus-visible:opacity-100 group-hover:opacity-100",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (confirmingDelete === doc.id) {
                          deleteDocument(doc.id);
                          setConfirmingDelete(null);
                        } else {
                          setConfirmingDelete(doc.id);
                          setTimeout(() => setConfirmingDelete((current) => (current === doc.id ? null : current)), 2600);
                        }
                      }}
                    >
                      {confirmingDelete === doc.id ? "Sure?" : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-line p-3 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onNewDocument}
          className="bg-gradient-brand flex h-9 w-full items-center justify-center gap-2 rounded-ctl text-[13px] font-semibold text-[#fdf9f0] shadow-soft transition-all hover:brightness-110 active:brightness-95"
        >
          <Plus size={15} />
          New document
        </button>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[10.5px] text-ink-faint">
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1" y="1" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Local-first · stored in this browser
        </p>
      </div>
    </aside>
  );
}
