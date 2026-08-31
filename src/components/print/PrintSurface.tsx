"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { renderDocumentCached } from "@/core/latex/renderCache";
import { readDocumentPolicies } from "@/core/latex/geometry";
import { cn } from "@/lib/text";
import type { BlockRenderResult } from "@/core/latex/render";
import type { Block as BlockModel } from "@/core/blocks/types";
import { contentHeightPx, contentWidthPx, paperDimensions, type PrintConfig } from "./printConfig";

interface PageModel {
  blocks: BlockModel[];
}

export function PrintSurface() {
  const activeDoc = useWorkspace((state) =>
    state.documents.find((d) => d.id === state.activeDocumentId) ?? null,
  );
  const printConfig = useWorkspace((state) => state.printConfig);
  const renders = useMemo(
    () => (activeDoc ? renderDocumentCached(activeDoc.blocks) : new Map<string, BlockRenderResult>()),
    [activeDoc],
  );
  const microtype = useMemo(
    () => (activeDoc ? readDocumentPolicies(activeDoc.blocks).microtype : false),
    [activeDoc],
  );
  const [pages, setPages] = useState<PageModel[] | null>(null);
  const measureHostRef = useRef<HTMLDivElement>(null);

  const config = printConfig;
  const paged = Boolean(config?.pageNumbers);

  useLayoutEffect(() => {
    if (!activeDoc || !config || !config.pageNumbers) {
      queueMicrotask(() => setPages(null));
      return;
    }
    const host = measureHostRef.current;
    if (!host) return;
    const elements = Array.from(host.querySelectorAll<HTMLElement>("[data-print-block]"));
    if (elements.length === 0) {
      queueMicrotask(() => setPages([]));
      return;
    }
    const maxHeight = contentHeightPx(config);
    const pageModels: PageModel[] = [];
    let current: BlockModel[] = [];
    let used = 0;
    elements.forEach((element, index) => {
      const block = activeDoc.blocks[index];
      const height = element.offsetHeight + 10;
      if (used > 0 && used + height > maxHeight) {
        pageModels.push({ blocks: current });
        current = [];
        used = 0;
      }
      current.push(block);
      used += height;
    });
    if (current.length > 0) pageModels.push({ blocks: current });
    queueMicrotask(() => setPages(pageModels));
  }, [activeDoc, config, renders]);

  if (!activeDoc) return null;

  const titleBlock = (
    <header className="print-header">
      <h1 className="print-title">{activeDoc.title}</h1>
      <div className="print-meta">
        {new Date(activeDoc.updatedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </div>
    </header>
  );

  const blockMarkup = (block: BlockModel) => (
    <div
      key={block.id}
      className="print-block"
      dangerouslySetInnerHTML={{ __html: renders.get(block.id)?.html ?? "" }}
    />
  );

  const footerLabel = (pageNumber: number) => {
    if (!config || config.footer === "none") return String(pageNumber);
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    if (config.footer === "title") return `${activeDoc.title} · ${pageNumber}`;
    return `${activeDoc.title} · ${date} · ${pageNumber}`;
  };

  return (
    <>
      <div className="print-root" aria-hidden="true" data-print-mode={paged ? "pages" : "flow"}>
        {paged ? (
          <div className={cn("print-pages", microtype && "microtype")}>
            {pages?.map((page, index) => (
              <section
                key={index}
                className="print-page print-doc"
                data-page-number={index + 1}
              >
                <div className="print-page-content">
                  {index === 0 ? titleBlock : null}
                  {page.blocks.map(blockMarkup)}
                </div>
                <footer className="print-page-footer">{footerLabel(index + 1)}</footer>
              </section>
            )) ?? null}
          </div>
        ) : (
          <div className={cn("print-doc", microtype && "microtype")}>{titleBlock}{activeDoc.blocks.map(blockMarkup)}</div>
        )}
        <style>{printSurfaceStyle(config)}</style>
      </div>
      <div className="print-measure-host" ref={measureHostRef} aria-hidden="true">
        {paged
          ? activeDoc.blocks.map((block) => (
              <div key={block.id} data-print-block>{blockMarkup(block)}</div>
            ))
          : null}
      </div>
    </>
  );
}

function printSurfaceStyle(config: PrintConfig | null): string {
  if (!config) return "";
  const { widthMm, heightMm } = paperDimensions(config);
  const margins = config.marginMm;
  const footerHeightMm = config.pageNumbers || config.footer !== "none" ? 8 : 0;
  if (config.pageNumbers) {
    return `
@media print {
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  .print-page {
    width: ${widthMm}mm;
    height: ${heightMm}mm;
    padding: ${margins.top}mm ${margins.right}mm ${Math.max(margins.bottom, footerHeightMm)}mm ${margins.left}mm;
    box-sizing: border-box;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    position: relative;
    display: flex;
    flex-direction: column;
    font-size: ${config.fontPt}pt;
  }
  .print-page:last-child { page-break-after: auto; break-after: auto; }
  .print-page-content { flex: 1 1 auto; min-height: 0; }
  .print-page-footer {
    position: absolute;
    bottom: ${Math.max(4, margins.bottom / 2.2)}mm;
    left: ${margins.left}mm;
    right: ${margins.right}mm;
    text-align: center;
    font-family: var(--font-sans);
    font-size: 8pt;
    color: #6b6353;
    border-top: 0.5pt solid #d5c9b1;
    padding-top: 1.5mm;
  }
  .print-measure-host { display: none !important; }
}
@media screen {
  .print-measure-host {
    position: fixed;
    top: 0;
    left: -30000px;
    width: ${contentWidthPx(config)}px;
    visibility: hidden;
    pointer-events: none;
    font-family: var(--font-serif);
    font-size: ${config.fontPt}pt;
    line-height: 1.65;
    color: #000;
  }
  .print-measure-host .print-block { margin: 0; }
  .print-pages .print-page { display: none; }
}`.trim();
  }
  return `
@media print {
  @page { size: ${widthMm}mm ${heightMm}mm; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }
  .print-doc { font-size: ${config.fontPt}pt; }
  .print-measure-host { display: none !important; }
}`.trim();
}
