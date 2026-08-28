export type PaperChoice = "auto" | "a4" | "letter" | "legal";
export type FooterChoice = "none" | "title" | "title+date";

export interface PrintConfig {
  paper: "a4" | "letter" | "legal";
  landscape: boolean;
  marginMm: { top: number; right: number; bottom: number; left: number };
  fontPt: number;
  pageNumbers: boolean;
  footer: FooterChoice;
}

export const PAPER_SIZES: Record<PrintConfig["paper"], { width: number; height: number; label: string }> = {
  a4: { width: 210, height: 297, label: "A4" },
  letter: { width: 215.9, height: 279.4, label: "Letter" },
  legal: { width: 215.9, height: 355.6, label: "Legal" },
};

export const FONT_STEPS = [
  { value: 11, label: "Compact" },
  { value: 12.5, label: "Normal" },
  { value: 14, label: "Large" },
] as const;

export const MARGIN_PRESETS = [
  { value: 15, label: "Narrow · 15mm" },
  { value: 20, label: "Moderate · 20mm" },
  { value: 25.4, label: "Wide · 1in" },
] as const;

export function paperDimensions(config: PrintConfig): { widthMm: number; heightMm: number } {
  const base = PAPER_SIZES[config.paper];
  return config.landscape
    ? { widthMm: base.height, heightMm: base.width }
    : { widthMm: base.width, heightMm: base.height };
}

export function contentWidthPx(config: PrintConfig): number {
  const { widthMm } = paperDimensions(config);
  return ((widthMm - config.marginMm.left - config.marginMm.right) * 96) / 25.4;
}

export function contentHeightPx(config: PrintConfig): number {
  const { heightMm } = paperDimensions(config);
  const footerMm = config.pageNumbers || config.footer !== "none" ? 9 : 0;
  return (((heightMm - config.marginMm.top - config.marginMm.bottom - footerMm) * 96) / 25.4) - 2;
}

export function pageCssSize(config: PrintConfig): string {
  const { widthMm, heightMm } = paperDimensions(config);
  return `${widthMm}mm ${heightMm}mm`;
}
