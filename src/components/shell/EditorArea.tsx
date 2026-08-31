"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { renderDocumentCached } from "@/core/latex/renderCache";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SourceEditor } from "@/components/editor/SourceEditor";
import { MathKeyBar } from "@/components/editor/MathKeyBar";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { BrandMark } from "./BrandMark";

const MIN_RATIO = 0.24;
const MAX_RATIO = 0.76;
const SPLIT_STORAGE_KEY = "lemma.splitRatio";

function readStoredRatio(): number {
  const stored = Number.parseFloat(localStorage.getItem(SPLIT_STORAGE_KEY) ?? "");
  if (Number.isFinite(stored)) return Math.min(MAX_RATIO, Math.max(MIN_RATIO, stored));
  return window.innerWidth < 1024 ? 0.56 : 0.46;
}

function EmptyWorkspace({ onNewDocument }: { onNewDocument: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <span className="bg-gradient-brand flex h-14 w-14 items-center justify-center rounded-[18px] shadow-raised">
        <BrandMark size={30} />
      </span>
      <div>
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Your workspace is empty
        </h2>
        <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-soft">
          Create a document to start writing math with your agent, or ask your agent to create one
          for you.
        </p>
      </div>
      <Button variant="primary" size="md" onClick={onNewDocument}>
        <FilePlus2 size={14} />
        New document
      </Button>
    </div>
  );
}

export function EditorArea({ onNewDocument }: { onNewDocument: () => void }) {
  const activeDoc = useWorkspace((state) =>
    state.documents.find((d) => d.id === state.activeDocumentId) ?? null,
  );
  const viewMode = useWorkspace((state) => state.viewMode);
  const sourceText = useWorkspace((state) => state.sourceText);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");
  const [ratio, setRatio] = useState(readStoredRatio);
  const [visibleBlockIndex, setVisibleBlockIndex] = useState<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const activeBlocks = activeDoc?.blocks;
  const errorPositions = useMemo(() => {
    if (!activeBlocks) return [];
    const renders = renderDocumentCached(activeBlocks);
    return activeBlocks
      .map((block) => {
        const render = renders.get(block.id);
        if (render?.status !== "error" || !render.error) return null;
        return {
          blockId: block.id,
          position: render.error.position,
          length: Math.max(4, render.error.length * 4),
        };
      })
      .filter((entry): entry is { blockId: string; position: number; length: number } => entry !== null);
  }, [activeBlocks]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const next = (event.clientX - rect.left) / rect.width;
    setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, next)));
  }, []);

  const stopDragging = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem(SPLIT_STORAGE_KEY, String(ratio));
  }, [ratio]);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, [onPointerMove, stopDragging]);

  if (!activeDoc) {
    return <EmptyWorkspace onNewDocument={onNewDocument} />;
  }

  const mode = isDesktop ? viewMode : viewMode === "split" ? "preview" : viewMode;

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      {mode === "source" || mode === "split" ? (
        <div
          className="flex min-h-0 min-w-0 flex-col bg-card"
          style={{ flexBasis: mode === "split" ? `${ratio * 100}%` : "100%", flexGrow: mode === "split" ? 0 : 1, flexShrink: 1 }}
        >
          {isCoarsePointer ? <MathKeyBar /> : null}
          <div className="min-h-0 flex-1">
            <SourceEditor
              documentId={activeDoc.id}
              sourceText={sourceText}
              errorPositions={errorPositions}
              onVisibleBlockChange={mode === "split" ? setVisibleBlockIndex : undefined}
            />
          </div>
        </div>
      ) : null}

      {mode === "split" ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setRatio((r) => Math.max(MIN_RATIO, r - 0.03));
              if (event.key === "ArrowRight") setRatio((r) => Math.min(MAX_RATIO, r + 0.03));
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              draggingRef.current = true;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            className="no-print group relative w-[7px] shrink-0 cursor-col-resize bg-paper transition-colors hover:bg-inset"
          >
            <span className="absolute top-1/2 left-1/2 h-10 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong transition-colors group-hover:bg-bronze" />
          </div>
        </>
      ) : null}

      {mode === "preview" || mode === "split" ? (
        <div className="min-h-0 min-w-0 flex-1">
          <PreviewPane
            documentId={activeDoc.id}
            blocks={activeDoc.blocks}
            activeBlockIndex={mode === "split" ? visibleBlockIndex : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
