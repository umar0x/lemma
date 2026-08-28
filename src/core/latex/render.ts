import katex from "katex";
import "katex/contrib/mhchem";
import type { Block } from "@/core/blocks/types";
import { escapeHtml } from "@/lib/text";
import { collectMacros, countMacros, extractLabels, spacePadLabels } from "./macros";
import { buildRenderContext, isNumberedMathBlock, type RenderContext } from "./context";
import { renderRichText, type InlineMathError } from "./richtext";
import { suggestCommand } from "./suggest";
import { theoremLabel } from "./theorems";
import { containsTikzPicture, renderTikzPicture, type TikzRenderResult } from "./tikz";

export interface RenderError {
  message: string;
  suggestion?: string;
  position: number;
  length: number;
  context: string;
}

export type RenderStatus = "ok" | "error" | "unsupported" | "empty";

export interface BlockRenderResult {
  status: RenderStatus;
  html: string;
  error?: RenderError;
  meta?: {
    labels?: string[];
    image?: string;
    caption?: string;
    kind?: string;
    macroCount?: number;
    unsupported?: string[];
    number?: number;
    pageLabel?: string;
    microtype?: boolean;
    paper?: string;
  };
}

export interface RenderOptions {
  macros?: Record<string, string>;
  refs?: Map<string, string>;
  theoremNumber?: number;
  equationNumber?: number;
  pageLabel?: string;
  microtype?: boolean;
}

const UNSUPPORTED_CONSTRUCTS: Array<[RegExp, string]> = [
  [/\\begin\{pgfplots[^}]*\}/, "pgfplots"],
  [/\\begin\{axis\}/, "pgfplots axis"],
  [/\\begin\{pspicture\}/, "PostScript graphics"],
  [/\\begin\{CD\}/, "Commutative diagrams (CD)"],
  [/\\begin\{xy\}/, "XY matrices"],
  [/\\begin\{picture\}/, "Picture environments"],
];

export function proseVisibleText(latex: string): string {
  return latex
    .replace(/(^|[^\\])%[^\n]*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanKaTeXMessage(raw: string): string {
  return raw
    .replace(/^KaTeX parse error:\s*/, "")
    .replace(/\s*at (?:position \d+|end of input):[\s\S]*$/, "")
    .trim();
}

function buildError(
  rawMessage: string,
  position: number | undefined,
  source: string,
  sourceOffset: number,
): RenderError {
  const message = cleanKaTeXMessage(rawMessage);
  const controlSequence = /Undefined control sequence: \\([a-zA-Z]+)/.exec(message);
  const suggestion = controlSequence ? suggestCommand(controlSequence[1]) : undefined;
  const blockPosition = Math.max(0, sourceOffset + (position ?? 0));
  const length = controlSequence ? controlSequence[1].length + 1 : 1;
  return {
    message,
    suggestion: suggestion && suggestion !== controlSequence?.[1] ? `\\${suggestion}` : undefined,
    position: blockPosition,
    length,
    context: source.slice(Math.max(0, blockPosition - 34), Math.min(source.length, blockPosition + 34)),
  };
}

function renderKaTeX(
  tex: string,
  displayMode: boolean,
  macros: Record<string, string>,
): { html: string; error?: { message: string; position?: number } } {
  try {
    const html = katex.renderToString(tex, {
      displayMode,
      throwOnError: true,
      strict: "ignore",
      trust: false,
      maxSize: 400,
      macros: { ...macros },
    });
    return { html };
  } catch (error) {
    const parseError = error as { name?: string; message?: string; position?: number };
    return {
      html: "",
      error: {
        message: parseError.message ?? "Unknown render error",
        position: parseError.position,
      },
    };
  }
}

function richTextOptions(macros: Record<string, string>, refs?: Map<string, string>) {
  return {
    renderMath: (tex: string, displayMode: boolean) => renderKaTeX(tex, displayMode, macros),
    resolveRef: refs ? (label: string) => refs.get(label) : undefined,
  };
}

function toRenderError(error: InlineMathError): RenderError {
  return {
    message: error.message,
    position: error.position,
    length: error.length,
    context: error.context,
  };
}

function stripDisplayDelimiters(latex: string): { tex: string; offset: number } {
  const trimmed = latex.trim();
  if (trimmed.startsWith("\\[")) {
    const end = trimmed.lastIndexOf("\\]");
    return { tex: trimmed.slice(2, end === -1 ? undefined : end), offset: latex.indexOf(trimmed) + 2 };
  }
  if (trimmed.startsWith("$$")) {
    const end = trimmed.lastIndexOf("$$");
    return { tex: trimmed.slice(2, end === -1 ? undefined : end), offset: latex.indexOf(trimmed) + 2 };
  }
  const envMatch = /\\begin\{(equation\*?|displaymath)\}/.exec(latex);
  if (envMatch) {
    const endMatch = new RegExp(`\\\\end\\{${envMatch[1]}\\}`).exec(latex);
    const innerStart = envMatch.index + envMatch[0].length;
    const innerEnd = endMatch ? endMatch.index : latex.length;
    return { tex: latex.slice(innerStart, innerEnd), offset: innerStart };
  }
  return { tex: trimmed, offset: latex.indexOf(trimmed) };
}

function appendTagToEnv(latex: string, tag: number): string {
  const index = latex.lastIndexOf("\\end{");
  return index === -1 ? `${latex}\\tag{${tag}}` : `${latex.slice(0, index)}\\tag{${tag}}${latex.slice(index)}`;
}

function renderTheorem(
  latex: string,
  options: RenderOptions,
): BlockRenderResult {
  const macros = options.macros ?? {};
  const match = /\\begin\{([a-zA-Z*]+)\}/.exec(latex);
  const env = match ? match[1].replace(/\*$/, "") : "theorem";
  const label = theoremLabel(env);
  let body = latex.slice(match ? match.index + match[0].length : 0);
  const endMatch = new RegExp(`\\\\end\\{[a-zA-Z*]+\\}\\s*$`).exec(body);
  if (endMatch) body = body.slice(0, endMatch.index);

  let title: string | null = null;
  const titleMatch = /^\s*\[([^\]]*)\]/.exec(body);
  if (titleMatch) {
    title = titleMatch[1];
    body = body.slice(titleMatch[0].length);
  }

  const result = renderRichText(body, richTextOptions(macros, options.refs));
  const heading = options.theoremNumber
    ? `${label} ${options.theoremNumber}`
    : label;
  const titleHtml = title ? `<span class="thm-title">(${escapeHtml(title)})</span>` : "";
  const qed = env === "proof" ? '<span class="thm-qed">\u25a1</span>' : "";
  const html = `<div class="thm thm-${env}"><span class="thm-kind">${heading}</span>${titleHtml}${result.html}${qed}</div>`;
  return {
    status: result.error ? "error" : "ok",
    html,
    error: result.error ? toRenderError(result.error) : undefined,
    meta: { kind: env, number: options.theoremNumber, labels: extractLabels(latex) },
  };
}

interface ColumnSpec {
  align: "l" | "c" | "r";
}

function skipBalanced(text: string, from: number): number {
  if (text[from] !== "{") return from + 1;
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function expandColSpec(spec: string): string {
  let out = "";
  let i = 0;
  while (i < spec.length) {
    if (spec[i] === "*") {
      const countGroup = /\{(\d+)\}/.exec(spec.slice(i + 1));
      if (countGroup) {
        const innerStart = i + 1 + countGroup.index + countGroup[0].length;
        const innerEnd = skipBalanced(spec, innerStart);
        const inner = spec.slice(innerStart + 1, innerEnd - 1);
        out += inner.repeat(Number(countGroup[1]));
        i = innerEnd;
        continue;
      }
    }
    out += spec[i];
    i += 1;
  }
  return out;
}

function parseColSpec(spec: string): ColumnSpec[] {
  const columns: ColumnSpec[] = [];
  const expanded = expandColSpec(spec);
  let i = 0;
  while (i < expanded.length) {
    const ch = expanded[i];
    if (ch === "l" || ch === "c" || ch === "r") {
      columns.push({ align: ch });
      i += 1;
    } else if (ch === "p" || ch === "m" || ch === "b") {
      i = skipBalanced(expanded, i + 1);
      columns.push({ align: "l" });
    } else if (ch === "@" || ch === ">" || ch === "<" || ch === "!") {
      i = skipBalanced(expanded, i + 1);
    } else {
      i += 1;
    }
  }
  return columns;
}

interface ParsedRow {
  cells: string[];
  ruleBelow: "none" | "light" | "mid";
}

function parseTableRows(inner: string): { rows: ParsedRow[]; topRule: "none" | "light" | "strong"; bottomRule: "none" | "light" | "strong" } {
  const rawRows = inner.split(/\\\\(?:\s*\[[^\]]*\])?/);
  const rows: ParsedRow[] = [];
  let topRule: "none" | "light" | "strong" = "none";
  let bottomRule: "none" | "light" | "strong" = "none";

  const ruleRank = { none: 0, light: 1, mid: 1, strong: 2 } as const;
  const applyRule = (kind: "hline" | "toprule" | "midrule" | "bottomrule" | "cline"): "light" | "mid" | "strong" | null => {
    if (kind === "toprule") return "strong";
    if (kind === "bottomrule") return "strong";
    if (kind === "midrule") return "mid";
    if (kind === "hline" || kind === "cline") return "light";
    return null;
  };

  for (const raw of rawRows) {
    const ruleRe = /\\(?:toprule|midrule|bottomrule|hline|cline\{[^}]*\})/g;
    const ruleTokens: string[] = [];
    let ruleMatch = ruleRe.exec(raw);
    while (ruleMatch) {
      ruleTokens.push(ruleMatch[0].replace(/[{}]/g, "").replace(/\\/g, ""));
      ruleMatch = ruleRe.exec(raw);
    }
    const content = raw.replace(ruleRe, "").replace(/\\(?:endhead|endfirsthead|endfoot|endlastfoot|centering)/g, "").trim();

    if (!content) {
      for (const token of ruleTokens) {
        const applied = applyRule(token as "hline");
        if (!applied) continue;
        if (rows.length === 0) {
          topRule = ruleRank[applied] > ruleRank[topRule] ? (applied === "mid" ? "light" : applied) : topRule;
        } else {
          const last = rows[rows.length - 1];
          if (ruleRank[applied] > ruleRank[last.ruleBelow]) {
            last.ruleBelow = applied === "strong" ? "mid" : applied === "mid" ? "mid" : "light";
          }
          if (applied === "strong") bottomRule = "strong";
        }
      }
      continue;
    }

    const cells = content.split(/(?<!\\)&/).map((cell) => cell.trim());
    const row: ParsedRow = { cells, ruleBelow: "none" };
    for (const token of ruleTokens) {
      const applied = applyRule(token as "hline");
      if (!applied) continue;
      if (applied === "strong") {
        bottomRule = "strong";
      } else {
        row.ruleBelow = "light";
      }
    }
    rows.push(row);
  }

  return { rows, topRule, bottomRule };
}

function renderTableCell(cell: string, options: RenderOptions): string {
  const cleaned = cell
    .replace(/\\multirow\{[^{}]*\}\{[^{}]*\}/g, "")
    .replace(/\\label\{[^}]*\}/g, "")
    .trim();
  const rendered = renderRichText(cleaned, richTextOptions(options.macros ?? {}, options.refs)).html;
  const singleParagraph = /^<p class="rt-p">([\s\S]*)<\/p>$/.exec(rendered);
  return singleParagraph ? singleParagraph[1] : rendered;
}

function readBalancedColSpec(latex: string, searchFrom: number): { spec: string; end: number } | null {
  let cursor = searchFrom;
  while (cursor < latex.length && /\s/.test(latex[cursor])) cursor += 1;
  const optionalArg = /^\[[^\]]*\]/.exec(latex.slice(cursor));
  if (optionalArg) cursor += optionalArg[0].length;
  while (cursor < latex.length && /\s/.test(latex[cursor])) cursor += 1;
  if (latex[cursor] !== "{") return null;
  const end = skipBalanced(latex, cursor);
  return { spec: latex.slice(cursor + 1, end - 1), end };
}

function renderTable(latex: string, options: RenderOptions): BlockRenderResult {
  const beginMatch = /\\begin\{tabular\*?\}/.exec(latex);
  const colSpecMatch = beginMatch ? readBalancedColSpec(latex, beginMatch.index + beginMatch[0].length) : null;
  if (!beginMatch || !colSpecMatch) {
    const result = renderRichText(latex, richTextOptions(options.macros ?? {}, options.refs));
    return { status: result.error ? "error" : "ok", html: result.html };
  }
  let inner = latex.slice(colSpecMatch.end);
  const endMatch = /\\end\{tabular\*?\}/.exec(inner);
  if (endMatch) inner = inner.slice(0, endMatch.index);

  const colSpec = colSpecMatch.spec;
  const columns = parseColSpec(colSpec);
  const columnCount = Math.max(1, columns.length);
  const hasBorders = colSpec.includes("|");
  const { rows, topRule, bottomRule } = parseTableRows(inner);
  const booktabs = /\\(?:toprule|midrule|bottomrule)/.test(inner);

  const alignClass = (align: "l" | "c" | "r") => (align === "l" ? "ta-l" : align === "r" ? "ta-r" : "ta-c");

  const body = rows
    .map((row) => {
      const tds: string[] = [];
      let colIndex = 0;
      for (const cell of row.cells) {
        if (colIndex >= columnCount) break;
        const multicolumn = /^\\multicolumn\{(\d+)\}\{([^{}]*)\}\{([\s\S]*)\}$/.exec(cell);
        if (multicolumn) {
          const span = Math.max(1, Math.min(Number(multicolumn[1]), columnCount - colIndex));
          const specAlign = /l/.test(multicolumn[2]) ? "l" : /r/.test(multicolumn[2]) ? "r" : "c";
          tds.push(
            `<td colspan="${span}" class="${alignClass(specAlign)}">${renderTableCell(multicolumn[3], options) || "&nbsp;"}</td>`,
          );
          colIndex += span;
          continue;
        }
        tds.push(`<td class="${alignClass(columns[colIndex]?.align ?? "c")}">${renderTableCell(cell, options) || "&nbsp;"}</td>`);
        colIndex += 1;
      }
      while (colIndex < columnCount) {
        tds.push(`<td class="ta-c">&nbsp;</td>`);
        colIndex += 1;
      }
      const ruleClass = row.ruleBelow === "mid" ? " rule-below-strong" : row.ruleBelow === "light" ? " rule-below" : "";
      return `<tr class="${ruleClass.trim()}">${tds.join("")}</tr>`;
    })
    .join("");

  const captionMatch = /\\caption\{([^{}]*)\}/.exec(latex);
  const caption = captionMatch
    ? `<figcaption>${renderRichText(captionMatch[1].replace(/\\label\{[^}]*\}/g, ""), richTextOptions(options.macros ?? {}, options.refs)).html}</figcaption>`
    : "";

  const tableClass = [
    "rt-table",
    booktabs ? "rt-table-booktabs" : "",
    hasBorders ? "rt-table-bordered" : "",
    topRule === "strong" ? "rt-table-top" : "",
    bottomRule === "strong" ? "rt-table-bottom" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    status: "ok",
    html: `<figure class="tbl-figure">${caption}<table class="${tableClass}"><tbody>${body}</tbody></table></figure>`,
    meta: { kind: "tabular", labels: extractLabels(latex) },
  };
}

function renderFigure(latex: string, options: RenderOptions): BlockRenderResult {
  const macros = options.macros ?? {};
  if (containsTikzPicture(latex)) {
    const unsupported = UNSUPPORTED_CONSTRUCTS.filter(([re]) => re.test(latex)).map(([, name]) => name);
    if (unsupported.length > 0) {
      return {
        status: "unsupported",
        html: `<figure class="rt-figure"><pre class="fig-source">${escapeHtml(latex.trim())}</pre></figure>`,
        meta: { unsupported, labels: extractLabels(latex) },
      };
    }
    return renderTikzFigure(latex, options);
  }
  const imageMatch = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/.exec(latex);
  const captionMatch = /\\caption\{([^{}]*)\}/.exec(latex);

  if (!imageMatch) {
    const result = renderRichText(latex, richTextOptions(macros, options.refs));
    return { status: result.error ? "error" : "ok", html: result.html };
  }

  const captionHtml = captionMatch
    ? `<figcaption>${renderRichText(captionMatch[1], richTextOptions(macros, options.refs)).html}</figcaption>`
    : "";
  const body = `<div class="fig-frame"><span class="fig-name">${escapeHtml(imageMatch[1])}</span></div>`;

  return {
    status: "ok",
    html: `<figure class="rt-figure">${body}${captionHtml}</figure>`,
    meta: {
      image: imageMatch[1],
      labels: extractLabels(latex),
    },
  };
}

function tikzNodeText(text: string, options: RenderOptions): string {
  if (!text.trim()) return "";
  if (!text.includes("$")) return escapeHtml(text);
  const html = renderRichText(text, richTextOptions(options.macros ?? {}, options.refs)).html;
  const single = /^<p class="rt-p">([\s\S]*)<\/p>$/.exec(html);
  return `<span class="tikz-label">${single ? single[1] : html}</span>`;
}

function wrapTikzLabel(content: string, cx: number, cy: number, fontSize: number): string {
  const width = Math.max(36, content.length * 4 + 24);
  const height = fontSize * 1.8;
  return `<foreignObject x="${r(cx - width / 2)}" y="${r(cy - height / 2)}" width="${r(width)}" height="${r(height)}"><div xmlns="http://www.w3.org/1999/xhtml" class="tikz-label-box">${content}</div></foreignObject>`;
}

function r(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function renderTikzFigure(latex: string, options: RenderOptions): BlockRenderResult {
  const result: TikzRenderResult = renderTikzPicture(latex, {
    renderText: (text) => tikzNodeText(text, options),
  });
  const captionMatch = /\\caption\{([^{}]*)\}/.exec(latex);
  const captionHtml = captionMatch
    ? `<figcaption>${renderRichText(captionMatch[1].replace(/\\label\{[^}]*\}/g, ""), richTextOptions(options.macros ?? {}, options.refs)).html}</figcaption>`
    : "";

  if (result.error || !result.svg) {
    return {
      status: "error",
      html: `<div class="eq-error-source">${escapeHtml(latex.trim())}</div>`,
      error: {
        message: result.error ?? "This tikzpicture could not be rendered.",
        position: 0,
        length: 1,
        context: latex.trim().slice(0, 68),
      },
      meta: { labels: extractLabels(latex) },
    };
  }

  const svg = result.svg.replace(/<text x="(-?[\d.]+)" y="(-?[\d.]+)"([^>]*)>([\s\S]*?)<\/text>/g, (_all, xRaw, yRaw, attrs: string, inner: string) => {
    if (!inner.includes("tikz-label")) return `<text x="${xRaw}" y="${yRaw}"${attrs}>${inner}</text>`;
    const fontSize = /font-size="([\d.]+)"/.exec(attrs)?.[1] ?? "11";
    return wrapTikzLabel(inner, Number(xRaw), Number(yRaw) - Number(fontSize) * 0.36, Number(fontSize));
  });

  return {
    status: "ok",
    html: `<figure class="rt-figure tikz-figure">${svg}${captionHtml}</figure>`,
    meta: {
      labels: extractLabels(latex),
      ...(result.unsupported.length > 0 ? { unsupported: result.unsupported } : {}),
    },
  };
}

function renderCode(latex: string): BlockRenderResult {
  const match = /\\begin\{[a-zA-Z*]+\}\s*(?:\[[^\]]*\])?\s*(?:\{[^{}]*\})?/.exec(latex);
  let body = latex.slice(match ? match.index + match[0].length : 0);
  const endMatch = /\\end\{[a-zA-Z*]+\}\s*$/.exec(body);
  if (endMatch) body = body.slice(0, endMatch.index);
  return {
    status: "ok",
    html: `<pre class="rt-code"><code>${escapeHtml(body.replace(/^\n/, ""))}</code></pre>`,
    meta: { kind: "code" },
  };
}

function renderPreamble(latex: string, options: RenderOptions): BlockRenderResult {
  return {
    status: "ok",
    html: "",
    meta: {
      macroCount: countMacros(latex),
      kind: "preamble",
      pageLabel: options.pageLabel,
      microtype: options.microtype,
    },
  };
}

export function renderBlock(block: Block, options: RenderOptions = {}): BlockRenderResult {
  const macros = options.macros ?? {};
  switch (block.type) {
    case "preamble":
      return renderPreamble(block.latex, options);
    case "code":
      return renderCode(block.latex);
    case "theorem":
      return renderTheorem(block.latex, options);
    case "table":
      return renderTable(block.latex, options);
    case "figure":
      return renderFigure(block.latex, options);
    case "text": {
      if (!proseVisibleText(block.latex)) return { status: "empty", html: "" };
      const result = renderRichText(block.latex, richTextOptions(macros, options.refs));
      return {
        status: result.error ? "error" : "ok",
        html: result.html,
        error: result.error ? toRenderError(result.error) : undefined,
      };
    }
    case "equation": {
      const { tex, offset } = stripDisplayDelimiters(block.latex);
      let body = spacePadLabels(tex);
      if (options.equationNumber && !/\\tag\{/.test(tex)) {
        body = `${body}\\tag{${options.equationNumber}}`;
      }
      const result = renderKaTeX(body, true, macros);
      if (result.error) {
        return {
          status: "error",
          html: `<div class="eq-error-source">${escapeHtml(tex)}</div>`,
          error: buildError(result.error.message, result.error.position, block.latex, offset),
          meta: { labels: extractLabels(block.latex) },
        };
      }
      return {
        status: "ok",
        html: `<div class="eq-display">${result.html}</div>`,
        meta: { labels: extractLabels(block.latex), number: options.equationNumber },
      };
    }
    case "align": {
      const padded = spacePadLabels(block.latex);
      const tagged =
        options.equationNumber && !/\\tag\{/.test(block.latex)
          ? appendTagToEnv(padded, options.equationNumber)
          : padded;
      const result = renderKaTeX(tagged, true, macros);
      if (result.error) {
        return {
          status: "error",
          html: `<div class="eq-error-source">${escapeHtml(block.latex)}</div>`,
          error: buildError(result.error.message, result.error.position, block.latex, 0),
          meta: { labels: extractLabels(block.latex) },
        };
      }
      return {
        status: "ok",
        html: `<div class="eq-display">${result.html}</div>`,
        meta: { labels: extractLabels(block.latex), number: options.equationNumber },
      };
    }
    default:
      return { status: "empty", html: "" };
  }
}

export interface BlockRenderPlan {
  block: Block;
  options: RenderOptions;
}

export function prepareRenderPlans(blocks: Block[]): { context: RenderContext; plans: BlockRenderPlan[] } {
  const context = buildRenderContext(blocks);
  const plans: BlockRenderPlan[] = [];
  let equationNumber = 0;
  const theoremCounts = new Map<string, number>();

  for (const block of blocks) {
    if (block.type === "theorem") {
      const match = /\\begin\{([a-zA-Z*]+)\}/.exec(block.latex.trim());
      const env = (match ? match[1] : "theorem").replace(/\*$/, "");
      let theoremNumber: number | undefined;
      if (env !== "proof") {
        const next = (theoremCounts.get(env) ?? 0) + 1;
        theoremCounts.set(env, next);
        theoremNumber = next;
      }
      plans.push({ block, options: { macros: context.macros, refs: context.refs, theoremNumber } });
      continue;
    }
    if (block.type === "equation" || block.type === "align") {
      const numbered = isNumberedMathBlock(block.latex);
      if (numbered) equationNumber += 1;
      plans.push({
        block,
        options: {
          macros: context.macros,
          refs: context.refs,
          equationNumber: numbered ? equationNumber : undefined,
        },
      });
      continue;
    }
    plans.push({ block, options: { macros: context.macros, refs: context.refs, pageLabel: context.pageLabel, microtype: context.microtype } });
  }

  return { context, plans };
}

export function renderDocument(blocks: Block[]): Map<string, BlockRenderResult> {
  const { plans } = prepareRenderPlans(blocks);
  const results = new Map<string, BlockRenderResult>();
  for (const plan of plans) {
    results.set(plan.block.id, renderBlock(plan.block, plan.options));
  }
  return results;
}

export function documentMacros(blocks: Block[]): Record<string, string> {
  return collectMacros(blocks.map((block) => block.latex));
}

export function summarizeRenderErrors(results: Map<string, BlockRenderResult>): number {
  let count = 0;
  for (const result of results.values()) {
    if (result.status === "error") count += 1;
  }
  return count;
}
