"use client";

import { useMemo, useState } from "react";
import posthog from "posthog-js";
import { Download, FileText, Printer } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { renderDocumentCached } from "@/core/latex/renderCache";
import { readDocumentPolicies } from "@/core/latex/geometry";
import { exportActiveTex } from "@/lib/export";
import { cn } from "@/lib/text";
import { Dialog } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import {
  FONT_STEPS,
  MARGIN_PRESETS,
  contentHeightPx,
  pageCssSize,
  paperDimensions,
  type FooterChoice,
  type PaperChoice,
  type PrintConfig,
} from "./printConfig";

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded-ctl border px-2.5 text-[11.5px] font-semibold transition-all",
            option.value === value
              ? "border-[color-mix(in_srgb,var(--bronze)_35%,transparent)] bg-bronze-soft text-bronze-ink"
              : "border-line bg-card text-ink-soft hover:border-line-strong hover:bg-inset",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full border transition-colors",
          checked
            ? "border-[color-mix(in_srgb,var(--forest)_45%,transparent)] bg-forest"
            : "border-line bg-inset",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-3.5 w-3.5 rounded-full bg-card shadow-soft transition-all",
            checked ? "left-[18px]" : "left-[3px]",
          )}
        />
      </span>
      <span className="text-[12.5px] font-medium text-ink">{label}</span>
    </button>
  );
}

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const activeDoc = useWorkspace((state) =>
    state.documents.find((d) => d.id === state.activeDocumentId) ?? null,
  );
  const setPrintConfig = useWorkspace((state) => state.setPrintConfig);

  const documentSetup = useMemo(
    () => (activeDoc ? readDocumentPolicies(activeDoc.blocks) : null),
    [activeDoc],
  );

  const [paper, setPaper] = useState<PaperChoice>("auto");
  const [landscape, setLandscape] = useState(false);
  const [margin, setMargin] = useState<number | "auto">("auto");
  const [font, setFont] = useState<number>(12.5);
  const [pageNumbers, setPageNumbers] = useState(true);
  const [footer, setFooter] = useState<FooterChoice>("title+date");

  const config: PrintConfig | null = useMemo(() => {
    if (!documentSetup) return null;
    const resolvedPaper = paper === "auto" ? documentSetup.pageSetup.paper : paper;
    const resolvedLandscape = landscape || (paper === "auto" && documentSetup.pageSetup.landscape);
    const margins = margin === "auto"
      ? {
          top: documentSetup.pageSetup.margins.top,
          right: documentSetup.pageSetup.margins.right,
          bottom: documentSetup.pageSetup.margins.bottom,
          left: documentSetup.pageSetup.margins.left,
        }
      : { top: margin, right: margin, bottom: margin, left: margin };
    return { paper: resolvedPaper, landscape: resolvedLandscape, marginMm: margins, fontPt: font, pageNumbers, footer };
  }, [documentSetup, paper, landscape, margin, font, pageNumbers, footer]);

  const estimatedPages = useMemo(() => {
    if (!activeDoc || !config) return 0;
    const renders = renderDocumentCached(activeDoc.blocks);
    const contentWidth = ((paperDimensions(config).widthMm - config.marginMm.left - config.marginMm.right) * 96) / 25.4;
    const fontScale = config.fontPt / 12.5;
    let totalHeight = 130;
    for (const block of activeDoc.blocks) {
      const render = renders.get(block.id);
      if (!render?.html) continue;
      if (block.type === "preamble") continue;
      const plainLength = render.html.replace(/<[^>]+>/g, "").length;
      const lineGuess = Math.max(1, Math.ceil((plainLength * 7 * fontScale) / Math.max(200, contentWidth)));
      const extra = render.html.includes("katex-display") || render.html.includes("tikz-figure") ? 90 : 0;
      totalHeight += lineGuess * 21 * fontScale + extra + 18;
    }
    return Math.max(1, Math.ceil(totalHeight / contentHeightPx(config)));
  }, [activeDoc, config]);

  const handlePrint = () => {
    if (!config) return;
    posthog.capture("pdf_printed", {
      paper: config.paper,
      landscape: config.landscape,
      estimated_pages: estimatedPages,
    });
    setPrintConfig(config);
    onClose();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  if (!activeDoc || !config) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Print & export"
      description="A print-optimized PDF with your document's page setup. Choose Save as PDF in the print dialog."
      width="620px"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[190px_1fr]">
        <div className="flex flex-col items-center">
          <div
            className="relative w-full overflow-hidden rounded-[10px] border border-line bg-[#fffdf8] shadow-soft"
            style={{ aspectRatio: `${paperDimensions(config).widthMm} / ${paperDimensions(config).heightMm}` }}
            aria-hidden="true"
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 py-4 text-center">
              <FileText size={22} className="text-bronze" />
              <div className="w-full truncate font-display text-[12.5px] font-semibold text-ink">{activeDoc.title}</div>
              <div className="text-[10px] leading-relaxed text-ink-faint">
                {pageCssSize(config).replace("mm", " mm")}
                <br />
                ~{estimatedPages} page{estimatedPages === 1 ? "" : "s"}
                {documentSetup?.microtype ? " · microtype" : ""}
              </div>
              {pageNumbers ? (
                <div className="absolute bottom-2 left-4 right-4 border-t border-line pt-1 text-[8px] text-ink-faint">
                  {activeDoc.title} · {new Date().getFullYear()}
                </div>
              ) : null}
            </div>
          </div>
          <p className="mt-2.5 text-center text-[10.5px] leading-relaxed text-ink-faint">
            {margin === "auto" && documentSetup?.pageSetup.source === "geometry"
              ? "Margins follow your geometry package."
              : `Margins: ${config.marginMm.top}mm all sides.`}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-[10.5px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
              Paper
            </span>
            <Segmented<PaperChoice>
              ariaLabel="Paper size"
              value={paper}
              onChange={setPaper}
              options={[
                { value: "auto", label: documentSetup ? `Doc (${documentSetup.pageSetup.paper === "a4" ? "A4" : documentSetup.pageSetup.paper === "letter" ? "Letter" : "Legal"})` : "Auto" },
                { value: "a4", label: "A4" },
                { value: "letter", label: "Letter" },
                { value: "legal", label: "Legal" },
              ]}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[10.5px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
              Orientation
            </span>
            <Segmented<string>
              ariaLabel="Orientation"
              value={landscape ? "landscape" : "portrait"}
              onChange={(value) => setLandscape(value === "landscape")}
              options={[
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[10.5px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
              Margins
            </span>
            <Segmented<string>
              ariaLabel="Margins"
              value={String(margin)}
              onChange={(value) => setMargin(value === "auto" ? "auto" : Number(value))}
              options={[
                { value: "auto", label: "Auto" },
                ...MARGIN_PRESETS.map((preset) => ({ value: String(preset.value), label: preset.label.split(" · ")[1] ?? preset.label })),
              ]}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[10.5px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
              Typography
            </span>
            <Segmented<number>
              ariaLabel="Typography"
              value={font}
              onChange={setFont}
              options={FONT_STEPS.map((step) => ({ value: step.value, label: step.label }))}
            />
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
            <Toggle checked={pageNumbers} onChange={setPageNumbers} label="Paginate with page numbers" />
            <div className={cn("transition-opacity", !pageNumbers && "opacity-50")}>
              <span className="mb-1.5 block text-[10.5px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
                Footer
              </span>
              <Segmented<FooterChoice>
                ariaLabel="Footer content"
                value={footer}
                onChange={setFooter}
                options={[
                  { value: "title+date", label: "Title · Date" },
                  { value: "title", label: "Title" },
                  { value: "none", label: "None" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse justify-end gap-2 border-t border-line pt-4 sm:flex-row">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={() => exportActiveTex(activeDoc)}>
          <Download size={14} />
          Download .tex
        </Button>
        <Button variant="primary" onClick={handlePrint}>
          <Printer size={14} />
          Print / Save PDF
        </Button>
      </div>
    </Dialog>
  );
}
