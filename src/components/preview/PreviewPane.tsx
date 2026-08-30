"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import {
  Bot,
  Check,
  CircleCheck,
  EyeOff,
  MessageSquarePlus,
  Sparkles,
  TriangleAlert,
  User,
} from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { renderDocumentCached } from "@/core/latex/renderCache";
import { buildRenderContext } from "@/core/latex/context";
import { renderRichText } from "@/core/latex/richtext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { BlockRenderResult } from "@/core/latex/render";
import type { Block as BlockModel, CommentThread } from "@/core/blocks/types";
import { cn, truncate } from "@/lib/text";

function renderCommentHtml(text: string, refs: Map<string, string>): string {
  return renderRichText(text, {
    renderMath: (tex, display) => {
      try {
        return { html: katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "ignore" }) };
      } catch (error) {
        return { html: "", error: { message: (error as Error).message, position: 0 } };
      }
    },
    resolveRef: (label) => refs.get(label),
  }).html;
}

function authorBadge(author: "user" | "agent") {
  return author === "agent" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-bronze-soft px-1.5 py-[1.5px] text-[10px] leading-none font-bold tracking-wide text-bronze-ink uppercase">
      <Bot size={10} className="shrink-0" strokeWidth={2.4} />
      Agent
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-forest-soft px-1.5 py-[1.5px] text-[10px] leading-none font-bold tracking-wide text-forest-ink uppercase">
      <User size={10} className="shrink-0" strokeWidth={2.4} />
      You
    </span>
  );
}

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CommentThreadCard({
  thread,
  documentId,
  refs,
}: {
  thread: CommentThread;
  documentId: string;
  refs: Map<string, string>;
}) {
  const replyToComment = useWorkspace((state) => state.replyToComment);
  const resolveThread = useWorkspace((state) => state.resolveThread);
  const [draft, setDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(!thread.resolved);

  const submitReply = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    replyToComment(documentId, thread.id, trimmed, "user");
    setDraft("");
    setReplying(false);
  };

  const lastComment = thread.comments[thread.comments.length - 1];

  if (thread.resolved && !expanded) {
    return (
      <div className="rounded-card border border-line bg-card shadow-soft opacity-[0.72] transition-opacity hover:opacity-100">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
          aria-label={`Resolved thread with ${thread.comments.length} comments. Expand.`}
        >
          <CircleCheck size={13} className="shrink-0 text-forest" strokeWidth={2.2} />
          <span className="text-[11.5px] font-semibold text-ink-soft">
            Resolved · {thread.comments.length === 1 ? "1 comment" : `${thread.comments.length} comments`}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-faint italic">
            {truncate(lastComment?.text.replace(/[\\{}$]/g, ""), 48)}
          </span>
        </button>
        <div className="flex items-center justify-end gap-1.5 border-t border-line px-3 py-1.5">
          <button
            type="button"
            onClick={() => resolveThread(documentId, thread.id, false)}
            className="rounded-[6px] px-1.5 py-0.5 text-[10.5px] leading-none font-semibold text-ink-faint transition-colors hover:text-bronze"
          >
            Reopen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-card border bg-card shadow-soft",
        thread.resolved ? "border-[color-mix(in_srgb,var(--forest)_26%,transparent)]" : "border-line",
      )}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        {authorBadge(thread.comments[0].author)}
        {thread.resolved ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] leading-none font-semibold text-forest">
            <CircleCheck size={11} />
            Resolved
          </span>
        ) : null}
        <span className="text-[10.5px] text-ink-faint">{relativeTime(lastComment?.createdAt ?? 0)}</span>
        <span className="flex-1" />
        {thread.resolved ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded-[6px] px-1.5 py-1 text-[10.5px] leading-none font-semibold text-ink-faint transition-colors hover:text-ink"
          >
            Collapse
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => resolveThread(documentId, thread.id, !thread.resolved)}
          className="rounded-[6px] px-1.5 py-1 text-[10.5px] leading-none font-semibold text-ink-faint transition-colors hover:text-bronze"
        >
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
      </div>

      <div className="space-y-2.5 px-3 py-2.5">
        {thread.quote ? (
          <div className="border-l-2 border-[color-mix(in_srgb,var(--bronze)_40%,transparent)] bg-[color-mix(in_srgb,var(--bronze-soft)_45%,var(--card))] px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink-soft italic">
            {thread.quote}
          </div>
        ) : null}
        {thread.comments.map((comment) => (
          <div key={comment.id}>
            <div className="mb-0.5 flex items-center gap-1.5">
              {authorBadge(comment.author)}
              {comment.createdAt ? (
                <span className="text-[10px] text-ink-faint">{relativeTime(comment.createdAt)}</span>
              ) : null}
            </div>
            <div
              className="comment-body text-[12.5px] leading-relaxed text-ink"
              dangerouslySetInnerHTML={{ __html: renderCommentHtml(comment.text, refs) }}
            />
          </div>
        ))}
      </div>

      <div className="border-t border-line px-3 py-2">
        {replying ? (
          <div className="space-y-1.5">
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitReply();
                }
                if (event.key === "Escape") setReplying(false);
              }}
              rows={2}
              placeholder="Reply… ($math$ works)"
              className="w-full resize-none rounded-ctl border border-line bg-inset px-2.5 py-1.5 text-[16px] text-ink placeholder:text-ink-faint focus:border-bronze focus:bg-card focus:outline-none md:text-[12.5px]"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setReplying(false)}
                className="rounded-[6px] px-2 py-1 text-[11.5px] font-medium text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReply}
                disabled={!draft.trim()}
                className="inline-flex items-center gap-1 rounded-[6px] bg-bronze-soft px-2 py-1 text-[11.5px] font-semibold text-bronze-ink transition-all hover:brightness-105 disabled:opacity-50"
              >
                <Check size={11} />
                Reply
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="text-[11.5px] font-semibold text-ink-faint transition-colors hover:text-bronze"
          >
            Reply in thread…
          </button>
        )}
      </div>
    </div>
  );
}

interface BlockViewProps {
  block: BlockModel;
  render: BlockRenderResult | undefined;
  threads: CommentThread[];
  documentId: string;
  activeFocus: boolean;
  coarse: boolean;
  onAddComment: (blockId: string) => void;
  onShowInSource: (blockId: string) => void;
  refs: Map<string, string>;
  showResolved: boolean;
  microtype: boolean;
}

function BlockView({
  block,
  render,
  threads,
  documentId,
  activeFocus,
  coarse,
  onAddComment,
  onShowInSource,
  refs,
  showResolved,
  microtype,
}: BlockViewProps) {
  const openThreads = threads.filter((t) => !t.resolved);
  const resolvedThreads = threads.filter((t) => t.resolved);
  const setCommentsShowResolved = useWorkspace((state) => state.setCommentsShowResolved);
  const hasThreads = openThreads.length > 0 || resolvedThreads.length > 0;

  const body = (() => {
    if (block.type === "preamble") {
      return (
        <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-line bg-inset px-3 py-2">
          <Sparkles size={13} className="shrink-0 text-bronze" />
          <span className="text-[11px] font-bold tracking-[0.07em] text-ink-soft uppercase">Preamble</span>
          {render?.meta?.pageLabel ? (
            <span className="rounded-full bg-card px-2 py-[2px] text-[10.5px] font-semibold text-ink-soft">
              {render.meta.pageLabel}
            </span>
          ) : null}
          {render?.meta?.microtype ? (
            <span className="rounded-full bg-card px-2 py-[2px] text-[10.5px] font-semibold text-forest-ink">
              microtype
            </span>
          ) : null}
          <span className="text-[11.5px] text-ink-faint">
            {render?.meta?.macroCount ?? 0} macro{(render?.meta?.macroCount ?? 0) === 1 ? "" : "s"} applied document-wide
          </span>
        </div>
      );
    }
    if (render?.status === "empty" && block.type === "text") {
      return (
        <p className="font-serif text-[15px] text-ink-faint italic">
          Empty paragraph. Start typing, or ask your agent.
        </p>
      );
    }
    return <div dangerouslySetInnerHTML={{ __html: render?.html ?? "" }} />;
  })();

  return (
    <article
      data-block-id={block.id}
      key={`${block.id}:${block.lastEditedBy}:${block.lastEditedAt}`}
      className={cn(
        "preview-block group relative rounded-[10px] py-1 pr-1 pl-7 transition-colors duration-200",
        activeFocus && "bg-[color-mix(in_srgb,var(--bronze)_12%,transparent)]",
        block.lastEditedBy === "agent" && "agent-glow",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onAddComment(block.id);
        }}
        title={`Comment on block ${block.id}`}
        aria-label={`Comment on block ${block.id}`}
        className={cn(
          "absolute top-2 left-0 z-10 flex h-6 w-6 items-center justify-center rounded-[7px] transition-all",
          coarse
            ? "border border-line bg-card text-ink-faint shadow-soft opacity-45 active:opacity-100 active:text-bronze"
            : "text-ink-faint opacity-0 group-hover:opacity-100 hover:text-bronze focus-visible:opacity-100",
        )}
      >
        <MessageSquarePlus size={13} strokeWidth={2.2} />
      </button>

      {render?.status === "error" ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[10px] border border-[color-mix(in_srgb,var(--oxblood)_26%,transparent)] border-l-[3px] bg-[color-mix(in_srgb,var(--oxblood-soft)_60%,var(--card))] px-3.5 py-2.5 pl-3">
          <TriangleAlert size={14} className="shrink-0 text-oxblood" />
          <span className="text-[12.5px] leading-snug font-medium text-oxblood-ink">{render.error?.message}</span>
          {render.error?.suggestion ? (
            <span className="text-[12.5px] leading-snug text-oxblood-ink">
              · did you mean <span className="rounded-[5px] bg-card px-1 py-px font-mono text-[12px] font-semibold">{render.error.suggestion}</span>?
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onShowInSource(block.id)}
            className="ml-auto rounded-[7px] border border-[color-mix(in_srgb,var(--oxblood)_40%,transparent)] bg-card px-2.5 py-1 text-[11.5px] font-semibold text-oxblood-ink transition-all hover:brightness-97"
          >
            Show in source
          </button>
        </div>
      ) : null}

      {render?.status === "unsupported" ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-ctl border border-[color-mix(in_srgb,var(--gold)_35%,transparent)] bg-bronze-soft px-3 py-2">
          <EyeOff size={13} className="shrink-0 text-gold" />
          <span className="text-[12px] font-medium text-bronze-ink">
            {(render.meta?.unsupported ?? ["Unsupported construct"]).join(", ")}. Not rendered live, but preserved in
            the .tex export.
          </span>
        </div>
      ) : null}

      <div className={cn("preview-body min-w-0", microtype && "microtype")}>{body}</div>

      {hasThreads ? (
        <div className="mt-2 flex max-w-[600px] flex-col gap-2">
          {openThreads.map((thread) => (
            <CommentThreadCard key={thread.id} thread={thread} documentId={documentId} refs={refs} />
          ))}
          {showResolved
            ? resolvedThreads.map((thread) => (
                <CommentThreadCard key={thread.id} thread={thread} documentId={documentId} refs={refs} />
              ))
            : null}
          {!showResolved && resolvedThreads.length > 0 ? (
            <button
              type="button"
              onClick={() => setCommentsShowResolved(true)}
              className="inline-flex items-center gap-1.5 self-start rounded-[6px] px-1 py-0.5 text-[11px] font-semibold text-ink-faint transition-colors hover:text-bronze"
            >
              <EyeOff size={10.5} />
              Show {resolvedThreads.length} resolved
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export interface PreviewPaneProps {
  documentId: string;
  blocks: BlockModel[];
  activeBlockIndex?: number;
}

export function PreviewPane({ documentId, blocks, activeBlockIndex }: PreviewPaneProps) {
  const threads = useWorkspace((state) =>
    state.documents.find((d) => d.id === documentId)?.threads ?? [],
  );
  const focusTarget = useWorkspace((state) => state.focusTarget);
  const addComment = useWorkspace((state) => state.addComment);
  const focusBlock = useWorkspace((state) => state.focusBlock);
  const showResolved = useWorkspace((state) => state.commentsShowResolved);
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");
  const containerRef = useRef<HTMLDivElement>(null);
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const renders = useMemo(() => renderDocumentCached(blocks), [blocks]);
  const renderContext = useMemo(() => buildRenderContext(blocks), [blocks]);
  const threadsByBlock = useMemo(() => {
    const map = new Map<string, CommentThread[]>();
    for (const thread of threads) {
      const list = map.get(thread.blockId) ?? [];
      list.push(thread);
      map.set(thread.blockId, list);
    }
    return map;
  }, [threads]);

  useEffect(() => {
    if (!focusTarget || !containerRef.current) return;
    const element = containerRef.current.querySelector(
      `[data-block-id="${focusTarget.blockId}"]`,
    );
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusTarget]);

  useEffect(() => {
    if (activeBlockIndex === undefined || !containerRef.current) return;
    const elements = containerRef.current.querySelectorAll("[data-block-id]");
    const element = elements[activeBlockIndex];
    if (element) {
      const container = containerRef.current;
      const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
      if (top < 24 || top > container.clientHeight * 0.6) {
        container.scrollTo({ top: container.scrollTop + top - 60, behavior: "smooth" });
      }
    }
  }, [activeBlockIndex]);

  const showInSource = (blockId: string) => {
    focusBlock(blockId);
    const { viewMode, setViewMode } = useWorkspace.getState();
    if (viewMode === "preview") setViewMode("split");
  };

  const submitComposer = () => {
    const trimmed = draft.trim();
    if (!trimmed || !composerFor) return;
    addComment(documentId, composerFor, trimmed, "user");
    setDraft("");
    setComposerFor(null);
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-paper" ref={containerRef}>
      <div className="mx-auto w-full max-w-[680px] px-3 py-6 sm:px-5">
        {blocks.map((block) => (
          <div key={block.id}>
            <BlockView
              block={block}
              render={renders.get(block.id)}
              threads={threadsByBlock.get(block.id) ?? []}
              documentId={documentId}
              activeFocus={focusTarget?.blockId === block.id}
              coarse={isCoarsePointer}
              onAddComment={(blockId) => setComposerFor(blockId)}
              onShowInSource={showInSource}
              refs={renderContext.refs}
              showResolved={showResolved}
              microtype={renderContext.microtype}
            />
            {composerFor === block.id ? (
              <div className="mt-2 mb-1 max-w-[600px] rounded-card border border-line bg-card p-3 shadow-soft">
                <div className="mb-1.5 flex items-center gap-1.5">{authorBadge("user")}</div>
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submitComposer();
                    if (event.key === "Escape") setComposerFor(null);
                  }}
                  rows={2}
                  placeholder="Ask or note something about this block… ($math$ works)"
                  className="w-full resize-none rounded-ctl border border-line bg-inset px-2.5 py-1.5 text-[16px] text-ink placeholder:text-ink-faint focus:border-bronze focus:bg-card focus:outline-none md:text-[12.5px]"
                />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] text-ink-faint">⌘↵ to post</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setComposerFor(null)}
                      className="rounded-[6px] px-2 py-1 text-[11.5px] font-medium text-ink-faint hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitComposer}
                      disabled={!draft.trim()}
                      className="rounded-[6px] bg-bronze-soft px-2 py-1 text-[11.5px] font-semibold text-bronze-ink transition-all hover:brightness-105 disabled:opacity-50"
                    >
                      Post comment
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
