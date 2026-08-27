import type { Block } from "@/core/blocks/types";

export type PaperSize = "a4" | "letter" | "legal";

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSetup {
  paper: PaperSize;
  landscape: boolean;
  margins: PageMargins;
  source: "geometry" | "default";
}

export interface DocumentPolicies {
  microtype: boolean;
  pageSetup: PageSetup;
}

export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
};

const DEFAULT_MARGINS: PageMargins = { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 };

function parseLengthMm(raw: string): number | null {
  const match = /^([\d.]+)\s*(mm|cm|in|pt|bp)?$/.exec(raw.trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  switch (match[2] ?? "cm") {
    case "mm": return value;
    case "cm": return value * 10;
    case "in": return value * 25.4;
    case "pt": case "bp": return value * 0.3528;
    default: return value;
  }
}

function parseGeometryPackageOption(options: string): PageSetup {
  const parts = options.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const setup: PageSetup = {
    paper: "letter",
    landscape: false,
    margins: { ...DEFAULT_MARGINS },
    source: "geometry",
  };

  for (const part of parts) {
    if (part === "a4paper" || part === "a4") setup.paper = "a4";
    if (part === "letterpaper" || part === "letter") setup.paper = "letter";
    if (part === "legalpaper" || part === "legal") setup.paper = "legal";
    if (part === "landscape") setup.landscape = true;
    if (part === "portrait") setup.landscape = false;

    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    const mm = parseLengthMm(value);

    if (key === "margin" && mm !== null) {
      setup.margins = { top: mm, right: mm, bottom: mm, left: mm };
    } else if (key === "top" && mm !== null) setup.margins.top = mm;
    else if (key === "bottom" && mm !== null) setup.margins.bottom = mm;
    else if (key === "left" && mm !== null) setup.margins.left = mm;
    else if (key === "right" && mm !== null) setup.margins.right = mm;
    else if (key === "hmargin" && mm !== null) {
      setup.margins.left = mm;
      setup.margins.right = mm;
    } else if (key === "vmargin" && mm !== null) {
      setup.margins.top = mm;
      setup.margins.bottom = mm;
    } else if (key === "textwidth" && mm !== null) {
      const paperWidth = PAPER_DIMENSIONS[setup.paper].width;
      const horizontal = Math.max(0, paperWidth - mm);
      setup.margins.left = horizontal / 2;
      setup.margins.right = horizontal / 2;
    } else if (key === "textheight" && mm !== null) {
      const paperHeight = PAPER_DIMENSIONS[setup.paper].height;
      const vertical = Math.max(0, paperHeight - mm);
      setup.margins.top = vertical / 2;
      setup.margins.bottom = vertical / 2;
    }
  }
  return setup;
}

const GEOMETRY_RE = /\\usepackage\s*(?:\[((?:[^{}]|\{[^{}]*\})*)\])?\s*\{[^{}]*geometry[^{}]*\}/;
const DOCUMENTCLASS_RE = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{[^{}]*\}/;

export function parsePageSetup(latex: string): PageSetup {
  const geometryMatch = GEOMETRY_RE.exec(latex);
  if (geometryMatch) {
    const setup = parseGeometryPackageOption(geometryMatch[1] ?? "");
    if (setup.paper === "letter" && !/(letter|a4|legal)/.test(geometryMatch[1] ?? "")) {
      const classMatch = DOCUMENTCLASS_RE.exec(latex);
      const classOptions = (classMatch?.[1] ?? "").toLowerCase();
      if (classOptions.includes("a4paper") || classOptions.includes("a4")) setup.paper = "a4";
      if (classOptions.includes("legalpaper") || classOptions.includes("legal")) setup.paper = "legal";
    }
    return setup;
  }
  const classMatch = DOCUMENTCLASS_RE.exec(latex);
  const classOptions = (classMatch?.[1] ?? "").toLowerCase();
  const paper: PaperSize = classOptions.includes("a4paper") || classOptions.includes("a4")
    ? "a4"
    : classOptions.includes("legalpaper") || classOptions.includes("legal")
      ? "legal"
      : "letter";
  return { paper, landscape: false, margins: { ...DEFAULT_MARGINS }, source: "default" };
}

export function usesMicrotype(latex: string): boolean {
  return /\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^{}]*microtype[^{}]*\}/.test(latex);
}

export function readDocumentPolicies(blocks: Block[]): DocumentPolicies {
  const preambleSources = blocks
    .filter((block) => block.type === "preamble")
    .map((block) => block.latex);
  const joined = preambleSources.join("\n");
  return {
    microtype: usesMicrotype(joined),
    pageSetup: parsePageSetup(joined),
  };
}

export function pageSetupLabel(setup: PageSetup): string {
  const paper = setup.paper === "a4" ? "A4" : setup.paper === "letter" ? "Letter" : "Legal";
  const orientation = setup.landscape ? " landscape" : "";
  const margin = Math.round(setup.margins.top);
  const uniform = setup.margins.top === setup.margins.right && setup.margins.top === setup.margins.bottom && setup.margins.top === setup.margins.left;
  return `${paper}${orientation} · ${uniform ? `${margin}mm margins` : "custom margins"}`;
}

export function pageSetupCssSize(setup: PageSetup): string {
  const dimensions = PAPER_DIMENSIONS[setup.paper];
  const width = setup.landscape ? dimensions.height : dimensions.width;
  const height = setup.landscape ? dimensions.width : dimensions.height;
  return `${width}mm ${height}mm`;
}

export function geometryOptionsFromSetup(setup: PageSetup): string[] {
  const options: string[] = [];
  if (setup.paper === "a4") options.push("a4paper");
  if (setup.paper === "legal") options.push("legalpaper");
  if (setup.landscape) options.push("landscape");
  const uniform = setup.margins.top === setup.margins.right && setup.margins.top === setup.margins.bottom && setup.margins.top === setup.margins.left;
  if (uniform) {
    if (setup.margins.top !== DEFAULT_MARGINS.top) options.push(`margin=${setup.margins.top}mm`);
  } else {
    options.push(`top=${setup.margins.top}mm`, `bottom=${setup.margins.bottom}mm`, `left=${setup.margins.left}mm`, `right=${setup.margins.right}mm`);
  }
  return options;
}
