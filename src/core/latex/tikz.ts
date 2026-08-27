import { escapeHtml } from "@/lib/text";

export interface TikzRenderResult {
  svg: string;
  width: number;
  height: number;
  unsupported: string[];
  error?: string;
}

export interface TikzRenderOptions {
  renderText?: (text: string) => string;
}

const PX_PER_CM = 37.795275591;
const NODE_FONT_PX = 11;

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#dc2626",
  green: "#16a34a",
  blue: "#2563eb",
  cyan: "#0891b2",
  magenta: "#c026d3",
  yellow: "#ca8a04",
  gray: "#6b7280",
  darkgray: "#374151",
  lightgray: "#d1d5db",
  brown: "#92400e",
  lime: "#65a30d",
  olive: "#6b7280",
  orange: "#ea580c",
  pink: "#db2777",
  purple: "#9333ea",
  teal: "#0d9488",
  violet: "#7c3aed",
};

const LINE_WIDTHS: Record<string, number> = {
  "ultra thin": 0.5,
  "very thin": 0.7,
  thin: 0.8,
  semithick: 1.1,
  thick: 1.4,
  "very thick": 2.0,
  "ultra thick": 3.0,
};

const DASH_PATTERNS: Record<string, string> = {
  dashed: "6 4",
  "densely dashed": "3 2",
  "loosely dashed": "9 6",
  dotted: "1.5 3.5",
  "densely dotted": "1 2",
  "loosely dotted": "2 5.5",
  dashdotted: "6 3 1 3",
  "densely dashdotted": "3 1.5 0.5 1.5",
  "dash dot": "6 3 1.5 3",
  "dash dot dot": "6 3 1.5 3 1.5 3",
};

const POSITION_OFFSETS: Record<string, [number, number]> = {
  above: [0, 1],
  "above left": [-0.707, 0.707],
  "above right": [0.707, 0.707],
  below: [0, -1],
  "below left": [-0.707, -0.707],
  "below right": [0.707, -0.707],
  left: [-1, 0],
  right: [1, 0],
};

const PREDEFINED_STYLES: Record<string, string> = {
  "help lines": "gray!60, thin, dashed",
};

interface Point {
  x: number;
  y: number;
}

interface DrawStyle {
  stroke: string | null;
  fill: string | null;
  lineWidth: number;
  dash: string | null;
  arrowStart: boolean;
  arrowEnd: boolean;
  rounded: number;
  opacity: number;
  fillOpacity: number;
}

interface NodeSpec {
  at: Point;
  text: string;
  shape: "rectangle" | "circle" | "ellipse" | "coordinate";
  draw: string | null;
  fill: string | null;
  textColor: string | null;
  minimumSize: number;
  innerSep: number;
  offset: [number, number] | null;
  labels: Array<{ angle: string; text: string }>;
}

type Primitive =
  | { kind: "path"; data: string; style: DrawStyle; bbox: Box }
  | { kind: "ellipse"; center: Point; rx: number; ry: number; style: DrawStyle }
  | { kind: "rect"; from: Point; to: Point; style: DrawStyle }
  | { kind: "grid"; from: Point; to: Point; step: number; style: DrawStyle }
  | { kind: "arc"; center: Point; rx: number; ry: number; startAngle: number; endAngle: number; style: DrawStyle }
  | { kind: "node"; node: NodeSpec };

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface StyleOptions {
  stroke?: string;
  fill?: string;
  textColor?: string;
  lineWidth?: number;
  dash?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  rounded?: number;
  opacity?: number;
  fillOpacity?: number;
  shape?: NodeSpec["shape"];
  minimumSize?: number;
  innerSep?: number;
  offset?: [number, number];
  pos?: number;
  scale?: number;
  bend?: number;
  currentColor?: string;
  labels?: Array<{ angle: string; text: string }>;
}

interface NodeRecord {
  center: Point;
  halfWidth: number;
  halfHeight: number;
}

interface ParseState {
  nodes: Map<string, NodeRecord>;
  styles: Map<string, string>;
  unitX: number;
  unitY: number;
  scale: number;
  rotate: number;
}

function parseLength(raw: string, fallback: number): number {
  const match = /^([\d.]+)\s*(pt|mm|cm|in|bp|ex|em)?$/.exec(raw.trim());
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return fallback;
  switch (match[2] ?? "pt") {
    case "pt": case "bp": return (value * 96) / 72;
    case "mm": return (value * PX_PER_CM) / 10;
    case "cm": return value * PX_PER_CM;
    case "in": return value * 96;
    case "ex": return value * 4.6;
    case "em": return value * NODE_FONT_PX;
    default: return (value * 96) / 72;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.slice(1);
  const full = value.length === 3 ? value.split("").map((c) => `${c}${c}`).join("") : value;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

function mix(base: [number, number, number], other: [number, number, number], ratio: number): [number, number, number] {
  return [base[0] * ratio + other[0] * (1 - ratio), base[1] * ratio + other[1] * (1 - ratio), base[2] * ratio + other[2] * (1 - ratio)];
}

function resolveColor(raw: string): string | null {
  const spec = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  if (!spec) return null;
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(spec)) return spec;
  const parts = spec.split("!");
  const first = NAMED_COLORS[parts[0].trim().toLowerCase()];
  if (!first) return null;
  let rgb = hexToRgb(first);
  for (let i = 1; i < parts.length; i += 1) {
    const split = /^([\d.]*)\s*(.*)$/.exec(parts[i].trim());
    if (!split) continue;
    const share = split[1] === "" ? 50 : Number(split[1]);
    if (!Number.isFinite(share)) continue;
    const otherName = split[2].trim().toLowerCase();
    const other = otherName ? NAMED_COLORS[otherName] : "#ffffff";
    if (other) rgb = mix(rgb, hexToRgb(other), Math.min(1, Math.max(0, share / 100)));
  }
  return rgbToHex(rgb);
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "{" || ch === "(" || ch === "[") depth += 1;
    if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
    if (ch === separator && depth === 0) {
      if (current.trim()) parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function stripBraces(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;
}

function parseStyleEntries(raw: string, state: ParseState, out: StyleOptions): void {
  for (const entry of splitTopLevel(raw, ",")) {
    const item = entry.trim();
    if (!item) continue;
    const styleExpansion = state.styles.get(item) ?? PREDEFINED_STYLES[item];
    if (styleExpansion !== undefined && !item.includes("=")) {
      parseStyleEntries(styleExpansion, state, out);
      continue;
    }
    const eq = item.indexOf("=");
    const key = eq === -1 ? item : item.slice(0, eq).trim();
    const value = eq === -1 ? "" : stripBraces(item.slice(eq + 1));

    if (LINE_WIDTHS[key]) { out.lineWidth = LINE_WIDTHS[key]; continue; }
    if (DASH_PATTERNS[key]) { out.dash = DASH_PATTERNS[key]; continue; }
    if (POSITION_OFFSETS[key]) { out.offset = POSITION_OFFSETS[key]; continue; }
    if (key === "->" || key === "-{>}" || key === "-latex" || key === "-Latex" || key === "-{Stealth}") { out.arrowEnd = true; continue; }
    if (key === "<-" || key === "latex-" || key === "{Stealth}-") { out.arrowStart = true; continue; }
    if (key === "<->" || key === "latex-latex" || key === "Stealth-Stealth" || key === "<=>") { out.arrowStart = true; out.arrowEnd = true; continue; }
    if (key === "line width") { out.lineWidth = parseLength(value, 0.8); continue; }
    if (key === "color" || key === "draw") { out.stroke = resolveColor(value || "black") ?? out.stroke; continue; }
    if (key === "fill") { out.fill = resolveColor(value || "#000000") ?? out.fill; continue; }
    if (key === "text") { out.textColor = resolveColor(value || "black") ?? out.textColor; continue; }
    if (key === "opacity") { out.opacity = clamp01(Number(value)); continue; }
    if (key === "fill opacity") { out.fillOpacity = clamp01(Number(value)); continue; }
    if (key === "rounded corners") { out.rounded = value ? parseLength(value, 4) : 4; continue; }
    if (key === "minimum size") { out.minimumSize = parseLength(value, 20); continue; }
    if (key === "minimum width" || key === "minimum height") { out.minimumSize = Math.max(out.minimumSize ?? 0, parseLength(value, 20)); continue; }
    if (key === "inner sep") { out.innerSep = parseLength(value, 3.7); continue; }
    if (key === "shape") {
      if (value === "circle" || value === "ellipse" || value === "coordinate" || value === "rectangle") out.shape = value;
      continue;
    }
    if (key === "circle" && !value) { out.shape = "circle"; continue; }
    if (key === "rectangle" && !value) { out.shape = "rectangle"; continue; }
    if (key === "coordinate" && !value) { out.shape = "coordinate"; continue; }
    if (key === "anchor") { continue; }
    if (key === "pos" || key === "near start" || key === "near end" || key === "midway" || key === "very near start" || key === "very near end") {
      out.pos = key === "near start" || key === "very near start" ? 0.25 : key === "near end" || key === "very near end" ? 0.75 : key === "midway" ? 0.5 : Number(value);
      continue;
    }
    if (key === "bend left") { out.bend = Number(value || 30); continue; }
    if (key === "bend right") { out.bend = -Number(value || 30); continue; }
    if (key === "bend angle") { out.bend = Number(value || 30); continue; }
    if (key === "scale") { out.scale = Number(value); continue; }
    if (!value) {
      const color = resolveColor(key);
      if (color) { out.currentColor = color; continue; }
    }
    if (key === "label") {
      const match = /^\s*(?:"([^"]*)"|([^:]*?))\s*:\s*([\s\S]*)$/.exec(value);
      const angle = match ? (match[1] ?? match[2] ?? "above").trim() : "above";
      const text = match ? match[3] : value;
      out.labels = [...(out.labels ?? []), { angle, text }];
      continue;
    }
  }
}

function parseOptions(raw: string, state: ParseState): StyleOptions {
  const out: StyleOptions = {};
  if (raw.trim()) parseStyleEntries(raw, state, out);
  return out;
}

function toUnitPx(value: number, unit: string | undefined, fallbackUnit: number): number {
  switch (unit) {
    case "cm": return value * PX_PER_CM;
    case "mm": return (value * PX_PER_CM) / 10;
    case "in": return value * 96;
    case "pt": case "bp": return (value * 96) / 72;
    case "em": return value * NODE_FONT_PX;
    case "ex": return value * 4.6;
    default: return value * fallbackUnit;
  }
}

function lookupNodePoint(body: string, state: ParseState): Point | null {
  const match = /^([A-Za-z][A-Za-z0-9_.-]*?)(?:\.(center|north|south|east|west|north east|north west|south east|south west))?$/.exec(body.trim());
  if (!match) return null;
  const record = state.nodes.get(match[1]);
  if (!record) return null;
  const anchor = match[2] ?? "center";
  let dx = 0;
  let dy = 0;
  if (anchor.includes("north")) dy = record.halfHeight;
  if (anchor.includes("south")) dy = -record.halfHeight;
  if (anchor.includes("east")) dx = record.halfWidth;
  if (anchor.includes("west")) dx = -record.halfWidth;
  return { x: record.center.x + dx, y: record.center.y + dy };
}

function parseCoordinateBody(body: string, state: ParseState): Point | null {
  const trimmed = body.trim();
  const polar = /^\s*([\d.+-]+)\s*:\s*([\d.]+)\s*(cm|mm|in|pt|bp)?\s*$/.exec(trimmed);
  if (polar) {
    const angle = (Number(polar[1]) * Math.PI) / 180;
    const radius = toUnitPx(Number(polar[2]), polar[3], PX_PER_CM);
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  }
  const cartesian = /^\s*([\d.+-]+)\s*(cm|mm|in|pt|bp|em|ex)?\s*,\s*([\d.+-]+)\s*(cm|mm|in|pt|bp|em|ex)?\s*$/.exec(trimmed);
  if (cartesian) {
    return {
      x: toUnitPx(Number(cartesian[1]), cartesian[2], state.unitX),
      y: toUnitPx(Number(cartesian[3]), cartesian[4], state.unitY),
    };
  }
  return lookupNodePoint(trimmed, state);
}

function applyTransforms(point: Point, state: ParseState): Point {
  const scaled = { x: point.x * state.scale, y: point.y * state.scale };
  if (state.rotate) {
    const rad = (state.rotate * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { x: scaled.x * cos - scaled.y * sin, y: scaled.x * sin + scaled.y * cos };
  }
  return scaled;
}

function readCoordinate(text: string, start: number, state: ParseState): { point: Point | null; relative: "none" | "move" | "stay"; end: number } {
  let cursor = start;
  let relative: "none" | "move" | "stay" = "none";
  if (text.startsWith("++", cursor)) { relative = "move"; cursor += 2; }
  else if (text[cursor] === "+") { relative = "stay"; cursor += 1; }
  while (/\s/.test(text[cursor] ?? "")) cursor += 1;
  if (text[cursor] !== "(") return { point: null, relative, end: start };
  let depth = 1;
  let body = "";
  let i = cursor + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === "(") depth += 1;
    if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
    body += text[i];
    i += 1;
  }
  const point = parseCoordinateBody(body, state);
  return { point, relative, end: i + 1 };
}

function readBraced(text: string, open: number): { content: string; end: number } | null {
  if (text[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "\\") { i += 1; continue; }
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return { content: text.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

function readBracketed(text: string, start: number): { content: string; end: number } | null {
  let cursor = start;
  while (/\s/.test(text[cursor] ?? "")) cursor += 1;
  if (text[cursor] !== "[") return null;
  let depth = 0;
  for (let i = cursor; i < text.length; i += 1) {
    if (text[i] === "[") depth += 1;
    if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) return { content: text.slice(cursor + 1, i), end: i + 1 };
    }
  }
  return null;
}

function splitStatements(source: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "\\") {
      current += ch;
      if (i + 1 < source.length) current += source[i + 1];
      i += 1;
      continue;
    }
    if (ch === "%" && depth === 0) {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") depth += 1;
    if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
    if (ch === ";" && depth === 0) {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function expandForeach(source: string, unsupported: string[]): string {
  let output = source;
  for (let guard = 0; guard < 16; guard += 1) {
    const match = /\\foreach\s+\\([a-zA-Z]+)(?:\s*\[[^\]]*\])?\s*in\s*/.exec(output);
    if (!match) break;
    const afterVar = match.index + match[0].length;
    let openBrace = output.indexOf("{", afterVar);
    while (openBrace !== -1 && output[openBrace - 1] === "\\") openBrace = output.indexOf("{", openBrace + 1);
    const listBlock = readBraced(output, openBrace);
    if (!listBlock) break;
    let bodyOpen = listBlock.end;
    while (/\s/.test(output[bodyOpen] ?? "")) bodyOpen += 1;
    const bodyBlock = readBraced(output, bodyOpen);
    if (!bodyBlock) break;
    const values = expandListValues(listBlock.content);
    if (values.length === 0) {
      unsupported.push("\\foreach with empty list");
      break;
    }
    const variable = `\\${match[1]}`;
    const expanded = values.map((value) => bodyBlock.content.split(variable).join(value)).join("\n");
    output = output.slice(0, match.index) + expanded + output.slice(bodyBlock.end);
  }
  return output;
}

function expandListValues(raw: string): string[] {
  const values: string[] = [];
  const parts = splitTopLevel(stripBraces(raw.trim()), ",");
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i].trim();
    if (part === "...") {
      const end = parts[i + 1]?.trim();
      if (end !== undefined) {
        const filled = fillRange(values[values.length - 1] ?? "1", end);
        if (filled) {
          values.push(...filled.slice(1));
          i += 1;
          continue;
        }
      }
      continue;
    }
    if (part.includes(")") || part.includes("(")) {
      const pointValues = splitTopLevel(part, ")").map((entry) => entry.replace(/^\(/, "").trim()).filter(Boolean);
      values.push(...pointValues);
      continue;
    }
    values.push(part);
  }
  return values;
}

function fillRange(start: string, end: string): string[] | null {
  const startNum = Number(start);
  const endNum = Number(end);
  if (Number.isFinite(startNum) && Number.isFinite(endNum)) {
    const span = Math.abs(endNum - startNum);
    const step = span > 0 ? (endNum > startNum ? 1 : -1) * Math.min(1, span) : 1;
    const decimals = Math.max(countDecimals(start), countDecimals(end), countDecimals(String(step)));
    const out: string[] = [startNum.toFixed(decimals)];
    for (let v = startNum + step; step > 0 ? v <= endNum + 1e-9 : v >= endNum - 1e-9; v += step) {
      out.push(Number(v.toFixed(decimals)).toString());
    }
    return out;
  }
  if (start.length === 1 && end.length === 1 && /[a-zA-Z]/.test(start) && /[a-zA-Z]/.test(end)) {
    const from = start.charCodeAt(0);
    const to = end.charCodeAt(0);
    if (from <= to && to - from < 60) {
      const out: string[] = [];
      for (let c = from; c <= to; c += 1) out.push(String.fromCharCode(c));
      return out;
    }
  }
  return null;
}

function countDecimals(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

function defaultStyle(overrides: StyleOptions, command: string): DrawStyle {
  const fillish = command === "fill" || command === "shade" || command === "shadedraw";
  const drawish = command === "draw" || command === "filldraw" || command === "shadedraw" || command === "path";
  return {
    stroke: overrides.stroke ?? (overrides.currentColor && drawish ? overrides.currentColor : null) ?? (!fillish && command !== "fill" && command !== "shade" ? "#000000" : null),
    fill: overrides.fill ?? (overrides.currentColor && fillish ? overrides.currentColor : null) ?? (fillish ? "#000000" : null),
    lineWidth: overrides.lineWidth ?? 0.8,
    dash: overrides.dash ?? null,
    arrowStart: overrides.arrowStart ?? false,
    arrowEnd: overrides.arrowEnd ?? false,
    rounded: overrides.rounded ?? 0,
    opacity: overrides.opacity ?? 1,
    fillOpacity: overrides.fillOpacity ?? overrides.opacity ?? 1,
  };
}

function estimateTextSize(text: string): { width: number; height: number } {
  const plain = text.replace(/\$[^$]*\$/g, "mm").replace(/\\[a-zA-Z]+\{?/, "x");
  return { width: Math.max(8, plain.length * NODE_FONT_PX * 0.58), height: NODE_FONT_PX * 1.35 };
}

function nodeOffset(angle: string): [number, number] {
  if (POSITION_OFFSETS[angle]) return POSITION_OFFSETS[angle];
  const numeric = Number(angle);
  if (Number.isFinite(numeric)) {
    const rad = (numeric * Math.PI) / 180;
    return [Math.cos(rad), Math.sin(rad)];
  }
  return [0, 1];
}

function nodeCenter(node: NodeSpec): Point {
  if (!node.offset) return node.at;
  const size = estimateTextSize(node.text);
  const halfWidth = Math.max(node.minimumSize / 2, size.width / 2 + node.innerSep);
  const halfHeight = Math.max(node.minimumSize / 2, size.height / 2 + node.innerSep);
  return { x: node.at.x + node.offset[0] * (halfWidth + 5), y: node.at.y + node.offset[1] * (halfHeight + 5) };
}

interface StatementContext {
  state: ParseState;
  primitives: Primitive[];
  unsupported: string[];
}

function pushNodePrimitives(spec: NodeSpec, name: string | null, ctx: StatementContext): void {
  ctx.primitives.push({ kind: "node", node: spec });
  if (!name) return;
  const size = estimateTextSize(spec.text);
  const center = nodeCenter(spec);
  const halfWidth = spec.shape === "coordinate" ? 0 : Math.max(spec.minimumSize / 2, size.width / 2 + spec.innerSep);
  const halfHeight = spec.shape === "coordinate" ? 0 : Math.max(spec.minimumSize / 2, size.height / 2 + spec.innerSep);
  ctx.state.nodes.set(name, { center, halfWidth, halfHeight });
}

function parseNodeTail(
  text: string,
  cursor: number,
  options: StyleOptions,
  at: Point | null,
  pathSegment: { from: Point; to: Point } | null,
  ctx: StatementContext,
): number {
  let scan = cursor;
  let name: string | null = null;
  const nameMatch = /^\(\s*([A-Za-z][A-Za-z0-9_.-]*)\s*\)\s*/.exec(text.slice(scan));
  if (nameMatch) {
    name = nameMatch[1];
    scan += nameMatch[0].length;
  }
  let nodeAt = at;
  const atMatch = /^at\s+/.exec(text.slice(scan));
  if (atMatch) {
    scan += atMatch[0].length;
    const { point, end } = readCoordinate(text, scan, ctx.state);
    if (point) {
      nodeAt = applyTransforms(point, ctx.state);
      scan = end;
    }
  }
  const brace = readBraced(text, text.indexOf("{", scan));
  const label = brace ? brace.content.trim() : "";
  if (brace) scan = Math.max(scan, brace.end);

  let placement = nodeAt ?? { x: 0, y: 0 };
  if (!atMatch && !at && pathSegment) {
    const pos = Math.min(1, Math.max(0, options.pos ?? 0.5));
    placement = {
      x: pathSegment.from.x + (pathSegment.to.x - pathSegment.from.x) * pos,
      y: pathSegment.from.y + (pathSegment.to.y - pathSegment.from.y) * pos,
    };
  }

  pushNodePrimitives(
    {
      at: placement,
      text: label,
      shape: options.shape ?? "rectangle",
      draw: options.stroke ?? null,
      fill: options.fill ?? null,
      textColor: options.textColor ?? null,
      minimumSize: options.minimumSize ?? 0,
      innerSep: options.innerSep ?? 3.7,
      offset: options.offset ?? null,
      labels: options.labels ?? [],
    },
    name,
    ctx,
  );
  return scan;
}

function boxOfPoints(points: Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function parseDrawStatement(command: string, body: string, options: StyleOptions, ctx: StatementContext): void {
  const state = ctx.state;
  const text = body;
  let cursor = 0;
  let style = defaultStyle(options, command);
  let current: Point | null = null;
  let data = "";
  let lastTarget: Point | null = null;

  const flushPath = (fallbackBox: Box | null = null) => {
    if (!data || !/[LQA Z]/.test(data.slice(1))) {
      data = "";
      return;
    }
    const box = fallbackBox ?? pathBox(current ?? { x: 0, y: 0 }, lastTarget);
    ctx.primitives.push({ kind: "path", data, style, bbox: box });
    data = "";
  };

  while (cursor < text.length) {
    if (/\s/.test(text[cursor])) { cursor += 1; continue; }

    if (text[cursor] === "[") {
      const bracket = readBracketed(text, cursor);
      if (bracket) {
        const segmentOptions = parseOptions(bracket.content, state);
        const merged: StyleOptions = { ...options, ...segmentOptions };
        style = defaultStyle(merged, command);
        cursor = bracket.end;
        continue;
      }
    }

    if (text[cursor] === "(" || text.startsWith("++", cursor) || text[cursor] === "+") {
      const { point, relative, end } = readCoordinate(text, cursor, state);
      if (point) {
        const transformed = applyTransforms(point, state);
        if (!current || !data) {
          current = transformed;
          data = `M ${r(current.x)} ${r(-current.y)}`;
          lastTarget = current;
        } else {
          const delta: Point = relative === "none" ? transformed : { x: current.x + transformed.x, y: current.y + transformed.y };
          data += ` L ${r(delta.x)} ${r(-delta.y)}`;
          lastTarget = delta;
          current = delta;
        }
        cursor = end;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (text.startsWith("--", cursor)) {
      cursor += 2;
      if (text.startsWith("cycle", cursor)) {
        data += " Z";
        cursor += 5;
      }
      continue;
    }

    if (text.startsWith("-|", cursor)) {
      const { point, end } = readCoordinate(text, cursor + 2, state);
      if (point && current) {
        const target = applyTransforms(point, state);
        data += ` L ${r(target.x)} ${r(-current.y)} L ${r(target.x)} ${r(-target.y)}`;
        current = target;
        lastTarget = target;
        cursor = end;
        continue;
      }
      cursor += 2;
      continue;
    }

    if (text.startsWith("|-", cursor)) {
      const { point, end } = readCoordinate(text, cursor + 2, state);
      if (point && current) {
        const target = applyTransforms(point, state);
        data += ` L ${r(current.x)} ${r(-target.y)} L ${r(target.x)} ${r(-target.y)}`;
        current = target;
        lastTarget = target;
        cursor = end;
        continue;
      }
      cursor += 2;
      continue;
    }

    const wordMatch = /^[a-zA-Z]+/.exec(text.slice(cursor));
    if (wordMatch) {
      const word = wordMatch[0];
      const afterWord = cursor + word.length;

      if (word === "rectangle") {
        const { point, end } = readCoordinate(text, afterWord, state);
        if (point && current) {
          const target = applyTransforms(point, state);
          flushPath();
          ctx.primitives.push({ kind: "rect", from: current, to: target, style });
          current = target;
          lastTarget = null;
        }
        cursor = point ? end : afterWord;
        continue;
      }

      if (word === "grid") {
        const gridOptions = readBracketed(text, afterWord);
        const stepOption = gridOptions ? parseOptions(gridOptions.content, state) : null;
        const { point, end } = readCoordinate(text, gridOptions ? gridOptions.end : afterWord, state);
        if (point && current) {
          const target = applyTransforms(point, state);
          flushPath();
          const gridStyle: DrawStyle = { ...style, stroke: style.stroke ?? "#9ca3af", lineWidth: 0.5, dash: "1.2 3.6", arrowStart: false, arrowEnd: false, fill: null };
          ctx.primitives.push({
            kind: "grid",
            from: current,
            to: target,
            step: stepOption?.minimumSize ? Math.max(6, stepOption.minimumSize) : PX_PER_CM,
            style: gridStyle,
          });
          current = target;
        }
        cursor = point ? end : afterWord;
        continue;
      }

      if (word === "circle" || word === "ellipse") {
        const spec = readCircleSpec(text, afterWord);
        if (current) {
          flushPath();
          ctx.primitives.push({ kind: "ellipse", center: current, rx: spec.rx, ry: spec.ry, style });
        }
        cursor = spec.end;
        continue;
      }

      if (word === "arc") {
        const spec = readArcSpec(text, afterWord, current);
        if (spec && current) {
          flushPath();
          ctx.primitives.push({ kind: "arc", center: spec.center, rx: spec.rx, ry: spec.ry, startAngle: spec.startAngle, endAngle: spec.endAngle, style });
          current = spec.endPoint;
          lastTarget = spec.endPoint;
        }
        cursor = spec ? spec.end : afterWord;
        continue;
      }

      if (word === "cycle") {
        data += " Z";
        cursor = afterWord;
        continue;
      }

      if (word === "node" || word === "coordinate") {
        const optionsBlock = readBracketed(text, afterWord);
        const nodeOptions = parseOptions(optionsBlock ? optionsBlock.content : "", state);
        const afterOptions = optionsBlock ? optionsBlock.end : afterWord;
        const segment = lastTarget && current ? { from: current, to: lastTarget } : null;
        const end = parseNodeTail(text, afterOptions, word === "coordinate" ? { ...nodeOptions, shape: "coordinate" } : nodeOptions, null, segment, ctx);
        cursor = end > afterOptions ? end : afterOptions;
        continue;
      }

      if (word === "to" || word === "edge") {
        const optionsBlock = readBracketed(text, afterWord);
        const toOptions = parseOptions(optionsBlock ? optionsBlock.content : "", state);
        const { point, end } = readCoordinate(text, optionsBlock ? optionsBlock.end : afterWord, state);
        if (point && current) {
          const target = applyTransforms(point, state);
          const bend = toOptions.bend ?? 0;
          if (bend && current.x !== target.x || bend && current.y !== target.y) {
            const mid = { x: (current.x + target.x) / 2, y: (current.y + target.y) / 2 };
            const dx = target.x - current.x;
            const dy = target.y - current.y;
            const length = Math.hypot(dx, dy) || 1;
            const offset = (bend / 100) * length * 0.45;
            const control = { x: mid.x - (dy / length) * offset, y: mid.y + (dx / length) * offset };
            data += ` Q ${r(control.x)} ${r(-control.y)} ${r(target.x)} ${r(-target.y)}`;
          } else {
            data += ` L ${r(target.x)} ${r(-target.y)}`;
          }
          if (toOptions.arrowEnd) style = { ...style, arrowEnd: true };
          if (toOptions.arrowStart) style = { ...style, arrowStart: true };
          lastTarget = target;
          current = target;
          cursor = end;
          continue;
        }
        cursor = optionsBlock ? optionsBlock.end : afterWord;
        continue;
      }

      if (word === "plot") {
        const plotOptions = readBracketed(text, afterWord);
        const afterPlot = plotOptions ? plotOptions.end : afterWord;
        const coordsMatch = /^coordinates\s*/.exec(text.slice(afterPlot));
        if (coordsMatch) {
          let scan = afterPlot + coordsMatch[0].length;
          const brace = readBraced(text, scan);
          if (brace) {
            scan = brace.end;
            const coordRe = /\(\s*([^()]+)\s*\)/g;
            let coordMatch = coordRe.exec(brace.content);
            let plotted = false;
            while (coordMatch) {
              const point = parseCoordinateBody(coordMatch[1], state);
              if (point) {
                const transformed = applyTransforms(point, state);
                if (!data) {
                  data = `M ${r(transformed.x)} ${r(-transformed.y)}`;
                } else {
                  data += ` L ${r(transformed.x)} ${r(-transformed.y)}`;
                }
                current = transformed;
                lastTarget = transformed;
                plotted = true;
              }
              coordMatch = coordRe.exec(brace.content);
            }
            if (plotted) {
              cursor = scan;
              continue;
            }
          }
        }
        cursor = afterPlot;
        continue;
      }

      if (word === "at") {
        const { point, end } = readCoordinate(text, afterWord, state);
        if (point) current = applyTransforms(point, state);
        cursor = point ? end : afterWord;
        continue;
      }

      cursor = afterWord;
      continue;
    }

    cursor += 1;
  }

  flushPath();
}

function pathBox(from: Point, to: Point | null): Box {
  const points = [from];
  if (to) points.push(to);
  return boxOfPoints(points);
}

function readCircleSpec(text: string, start: number): { rx: number; ry: number; end: number } {
  const paren = /\(\s*([\d.]+)\s*(?:and\s*([\d.]+))?\s*(cm|mm|in|pt|bp)?\s*\)/.exec(text.slice(start));
  if (paren) {
    const rx = toUnitPx(Number(paren[1]), paren[3], PX_PER_CM);
    const ry = paren[2] ? toUnitPx(Number(paren[2]), paren[3], PX_PER_CM) : rx;
    return { rx, ry, end: start + paren[0].length };
  }
  const bracket = readBracketed(text, start);
  if (bracket) {
    const options = parseOptions(bracket.content, {
      nodes: new Map(),
      styles: new Map(),
      unitX: PX_PER_CM,
      unitY: PX_PER_CM,
      scale: 1,
      rotate: 0,
    });
    const radius = options.minimumSize ?? 20;
    return { rx: radius, ry: radius, end: bracket.end };
  }
  return { rx: 20, ry: 20, end: start };
}

function readArcSpec(text: string, start: number, current: Point | null): {
  center: Point;
  rx: number;
  ry: number;
  startAngle: number;
  endAngle: number;
  endPoint: Point;
  end: number;
} | null {
  const match = /\(\s*([\d.+-]+)\s*:\s*([\d.+-]+)\s*:\s*([\d.]+)(?:\s+and\s+([\d.]+))?\s*(cm|mm|in|pt|bp)?\s*\)/.exec(text.slice(start));
  if (!match || !current) return null;
  const startAngle = Number(match[1]);
  const endAngle = Number(match[2]);
  const rx = toUnitPx(Number(match[3]), match[5], PX_PER_CM);
  const ry = match[4] ? toUnitPx(Number(match[4]), match[5], PX_PER_CM) : rx;
  const rad = (startAngle * Math.PI) / 180;
  const center = { x: current.x - rx * Math.cos(rad), y: current.y - rx * Math.sin(rad) };
  const endRad = (endAngle * Math.PI) / 180;
  const endPoint = { x: center.x + rx * Math.cos(endRad), y: center.y + ry * Math.sin(endRad) };
  return { center, rx, ry, startAngle, endAngle, endPoint, end: start + match[0].length };
}

function parseNodeStatement(body: string, options: StyleOptions, ctx: StatementContext): void {
  let scan = 0;
  let name: string | null = null;
  const nameMatch = /^\(\s*([A-Za-z][A-Za-z0-9_.-]*)\s*\)\s*/.exec(body.slice(scan));
  if (nameMatch) {
    name = nameMatch[1];
    scan += nameMatch[0].length;
  }
  let at: Point | null = null;
  const atMatch = /^at\s+/.exec(body.slice(scan));
  if (atMatch) {
    scan += atMatch[0].length;
    const { point, end } = readCoordinate(body, scan, ctx.state);
    if (point) {
      at = applyTransforms(point, ctx.state);
      scan = end;
    }
  }
  const brace = readBraced(body, body.indexOf("{", scan));
  const label = brace ? brace.content.trim() : body.replace(/;$/, "").trim();
  pushNodePrimitives(
    {
      at: at ?? { x: 0, y: 0 },
      text: label,
      shape: options.shape ?? "rectangle",
      draw: options.stroke ?? null,
      fill: options.fill ?? null,
      textColor: options.textColor ?? null,
      minimumSize: options.minimumSize ?? 0,
      innerSep: options.innerSep ?? 3.7,
      offset: options.offset ?? null,
      labels: options.labels ?? [],
    },
    name,
    ctx,
  );
}

function r(value: number): string {
  return String(Math.round(value * 100) / 100);
}

const svgX = (x: number) => x;
const svgY = (y: number) => -y;

function pathStyleAttributes(style: DrawStyle): string {
  const attrs: string[] = [];
  if (style.fill && style.stroke) {
    attrs.push(`fill="${style.fill}" fill-opacity="${style.fillOpacity}" stroke="${style.stroke}" stroke-width="${style.lineWidth}"`);
  } else if (style.fill) {
    attrs.push(`fill="${style.fill}" fill-opacity="${style.fillOpacity}"`);
  } else {
    attrs.push('fill="none"');
    if (style.stroke) attrs.push(`stroke="${style.stroke}" stroke-width="${style.lineWidth}"`);
  }
  if (style.dash) attrs.push(`stroke-dasharray="${style.dash}"`);
  if (style.rounded) attrs.push('stroke-linejoin="round"');
  return attrs.join(" ");
}

function renderPrimitive(primitive: Primitive, renderText: (text: string) => string, markerIds: Map<DrawStyle, { start: string; end: string }>): string {
  switch (primitive.kind) {
    case "path": {
      const markers = markerIds.get(primitive.style);
      const markerAttrs = [
        primitive.style.arrowEnd && markers ? `marker-end="url(#${markers.end})"` : "",
        primitive.style.arrowStart && markers ? `marker-start="url(#${markers.start})"` : "",
      ].filter(Boolean).join(" ");
      return `<path d="${primitive.data}" ${pathStyleAttributes(primitive.style)} ${markerAttrs}/>`;
    }
    case "rect": {
      const x = Math.min(primitive.from.x, primitive.to.x);
      const y = Math.min(primitive.from.y, primitive.to.y);
      const width = Math.abs(primitive.to.x - primitive.from.x);
      const height = Math.abs(primitive.to.y - primitive.from.y);
      const fill = primitive.style.fill ? `fill="${primitive.style.fill}" fill-opacity="${primitive.style.fillOpacity}"` : 'fill="none"';
      const stroke = primitive.style.stroke ? ` stroke="${primitive.style.stroke}" stroke-width="${primitive.style.lineWidth}"` : "";
      return `<rect x="${r(svgX(x))}" y="${r(svgY(y + height))}" width="${r(width)}" height="${r(height)}" rx="${r(primitive.style.rounded / 2)}" ${fill}${stroke}/>`;
    }
    case "ellipse": {
      const fill = primitive.style.fill ? `fill="${primitive.style.fill}" fill-opacity="${primitive.style.fillOpacity}"` : 'fill="none"';
      const stroke = primitive.style.stroke ? ` stroke="${primitive.style.stroke}" stroke-width="${primitive.style.lineWidth}"` : "";
      const dash = primitive.style.dash ? ` stroke-dasharray="${primitive.style.dash}"` : "";
      return `<ellipse cx="${r(svgX(primitive.center.x))}" cy="${r(svgY(primitive.center.y))}" rx="${r(primitive.rx)}" ry="${r(primitive.ry)}" ${fill}${stroke}${dash}/>`;
    }
    case "grid": {
      const segments: string[] = [];
      const minX = Math.min(primitive.from.x, primitive.to.x);
      const maxX = Math.max(primitive.from.x, primitive.to.x);
      const minY = Math.min(primitive.from.y, primitive.to.y);
      const maxY = Math.max(primitive.from.y, primitive.to.y);
      for (let x = minX; x <= maxX + 0.01; x += primitive.step) {
        segments.push(`M ${r(svgX(x))} ${r(svgY(minY))} L ${r(svgX(x))} ${r(svgY(maxY))}`);
      }
      for (let y = minY; y <= maxY + 0.01; y += primitive.step) {
        segments.push(`M ${r(svgX(minX))} ${r(svgY(y))} L ${r(svgX(maxX))} ${r(svgY(y))}`);
      }
      return `<path d="${segments.join(" ")}" fill="none" stroke="${primitive.style.stroke ?? "#9ca3af"}" stroke-width="${primitive.style.lineWidth}" stroke-dasharray="${primitive.style.dash ?? "1.2 3.6"}"/>`;
    }
    case "arc": {
      const { center, rx, ry, startAngle, endAngle } = primitive;
      const rad0 = (startAngle * Math.PI) / 180;
      const rad1 = (endAngle * Math.PI) / 180;
      const from = { x: center.x + rx * Math.cos(rad0), y: center.y + ry * Math.sin(rad0) };
      const to = { x: center.x + rx * Math.cos(rad1), y: center.y + ry * Math.sin(rad1) };
      const sweep = ((endAngle - startAngle + 360) % 360) || 360;
      const largeArc = sweep > 180 ? 1 : 0;
      const sweepFlag = endAngle > startAngle ? 0 : 1;
      const markers = markerIds.get(primitive.style);
      const markerAttrs = [
        primitive.style.arrowEnd && markers ? `marker-end="url(#${markers.end})"` : "",
        primitive.style.arrowStart && markers ? `marker-start="url(#${markers.start})"` : "",
      ].filter(Boolean).join(" ");
      return `<path d="M ${r(svgX(from.x))} ${r(svgY(from.y))} A ${r(rx)} ${r(ry)} 0 ${largeArc} ${sweepFlag} ${r(svgX(to.x))} ${r(svgY(to.y))}" ${pathStyleAttributes(primitive.style)} ${markerAttrs}/>`;
    }
    case "node": {
      const node = primitive.node;
      if (node.shape === "coordinate") return "";
      const center = nodeCenter(node);
      const size = estimateTextSize(node.text);
      const halfWidth = Math.max(node.minimumSize / 2, size.width / 2 + node.innerSep + 2);
      const halfHeight = Math.max(node.minimumSize / 2, size.height / 2 + node.innerSep + 1);
      const cx = svgX(center.x);
      const cy = svgY(center.y);
      const fragments: string[] = [];
      if (node.shape === "circle" || node.shape === "ellipse") {
        if (node.fill) fragments.push(`<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(halfWidth)}" ry="${r(halfHeight)}" fill="${node.fill}" fill-opacity="0.92"/>`);
        if (node.draw) fragments.push(`<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(halfWidth)}" ry="${r(halfHeight)}" fill="none" stroke="${node.draw}" stroke-width="0.8"/>`);
      } else if (node.fill || node.draw) {
        const fill = node.fill ? `fill="${node.fill}" fill-opacity="0.92"` : 'fill="none"';
        const stroke = node.draw ? ` stroke="${node.draw}" stroke-width="0.8"` : "";
        fragments.push(`<rect x="${r(cx - halfWidth)}" y="${r(cy - halfHeight)}" width="${r(halfWidth * 2)}" height="${r(halfHeight * 2)}" rx="3" ${fill}${stroke}/>`);
      }
      if (node.text) {
        fragments.push(`<text x="${r(cx)}" y="${r(cy + NODE_FONT_PX * 0.36)}" text-anchor="middle" font-size="${NODE_FONT_PX}"${node.textColor ? ` fill="${node.textColor}"` : ""}>${renderText(node.text)}</text>`);
      }
      for (const label of node.labels) {
        const [dx, dy] = nodeOffset(label.angle);
        fragments.push(`<text x="${r(cx + dx * (halfWidth + 14))}" y="${r(cy - dy * (halfHeight + 12) + NODE_FONT_PX * 0.34)}" text-anchor="middle" font-size="${r(NODE_FONT_PX * 0.92)}">${renderText(label.text)}</text>`);
      }
      return fragments.join("");
    }
  }
}

function primitiveBox(primitive: Primitive): Box {
  switch (primitive.kind) {
    case "path": {
      const numbers = primitive.data.match(/-?[\d.]+/g);
      if (!numbers || numbers.length < 2) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let isY = false;
      for (const raw of numbers) {
        const value = Number(raw);
        if (!Number.isFinite(value)) continue;
        if (isY) {
          minY = Math.min(minY, value);
          maxY = Math.max(maxY, value);
        } else {
          minX = Math.min(minX, value);
          maxX = Math.max(maxX, value);
        }
        isY = !isY;
      }
      return { minX, minY, maxX, maxY };
    }
    case "rect": {
      return {
        minX: svgX(Math.min(primitive.from.x, primitive.to.x)),
        minY: svgY(Math.max(primitive.from.y, primitive.to.y)),
        maxX: svgX(Math.max(primitive.from.x, primitive.to.x)),
        maxY: svgY(Math.min(primitive.from.y, primitive.to.y)),
      };
    }
    case "ellipse": {
      return {
        minX: svgX(primitive.center.x - primitive.rx),
        minY: svgY(primitive.center.y + primitive.ry),
        maxX: svgX(primitive.center.x + primitive.rx),
        maxY: svgY(primitive.center.y - primitive.ry),
      };
    }
    case "grid": {
      return {
        minX: svgX(Math.min(primitive.from.x, primitive.to.x)),
        minY: svgY(Math.max(primitive.from.y, primitive.to.y)),
        maxX: svgX(Math.max(primitive.from.x, primitive.to.x)),
        maxY: svgY(Math.min(primitive.from.y, primitive.to.y)),
      };
    }
    case "arc": {
      const angles = [primitive.startAngle, primitive.endAngle];
      const sweep = ((primitive.endAngle - primitive.startAngle + 360) % 360) || 360;
      for (let a = 0; a <= sweep; a += 15) angles.push(primitive.startAngle + a);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const angle of angles) {
        const rad = (angle * Math.PI) / 180;
        const x = svgX(primitive.center.x + primitive.rx * Math.cos(rad));
        const y = svgY(primitive.center.y + primitive.ry * Math.sin(rad));
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return { minX, minY, maxX, maxY };
    }
    case "node": {
      const center = nodeCenter(primitive.node);
      const size = estimateTextSize(primitive.node.text);
      const halfWidth = primitive.node.shape === "coordinate" ? 0 : Math.max(primitive.node.minimumSize / 2, size.width / 2 + primitive.node.innerSep + 6);
      const halfHeight = primitive.node.shape === "coordinate" ? 0 : Math.max(primitive.node.minimumSize / 2, size.height / 2 + primitive.node.innerSep + 5);
      const cx = svgX(center.x);
      const cy = svgY(center.y);
      let minX = cx - halfWidth;
      let minY = cy - halfHeight;
      let maxX = cx + halfWidth;
      let maxY = cy + halfHeight;
      for (const label of primitive.node.labels) {
        const [dx, dy] = nodeOffset(label.angle);
        minX = Math.min(minX, cx + dx * (halfWidth + 14) - 8);
        maxX = Math.max(maxX, cx + dx * (halfWidth + 14) + 8);
        minY = Math.min(minY, cy - dy * (halfHeight + 12) - 8);
        maxY = Math.max(maxY, cy - dy * (halfHeight + 12) + 8);
      }
      return { minX, minY, maxX, maxY };
    }
  }
}

function collectTikzset(source: string, state: ParseState): void {
  const re = /\\tikzset\s*\{/g;
  let match = re.exec(source);
  while (match) {
    const block = readBraced(source, match.index + match[0].length - 1);
    if (block) {
      for (const entry of splitTopLevel(block.content, ",")) {
        const styleMatch = /^([a-zA-Z0-9 ./-]+?)(?:\/\.style[^=]*)?=\s*([\s\S]*)$/.exec(entry.trim());
        if (styleMatch) {
          state.styles.set(styleMatch[1].trim(), styleMatch[2].replace(/^\{|[\}]$/g, ""));
        }
      }
    }
    match = re.exec(source);
  }
  const legacy = /\\tikzstyle\{([^{}]*)\}\s*=\s*(\{[^{}]*\}|\[[^\]]*\])/g;
  let legacyMatch = legacy.exec(source);
  while (legacyMatch) {
    state.styles.set(legacyMatch[1].trim(), legacyMatch[2].replace(/^[{\[]|[}\]]$/g, ""));
    legacyMatch = legacy.exec(source);
  }
}

function extractTikzBody(latex: string): { body: string; options: string } {
  const begin = /\\begin\{tikzpicture\}/.exec(latex);
  const end = /\\end\{tikzpicture\}\s*$/.exec(latex);
  const bodyStart = begin ? begin.index + begin[0].length : 0;
  const bodyEnd = end ? end.index : latex.length;
  let body = latex.slice(bodyStart, bodyEnd);
  const optionsMatch = /^\s*\[([^\]]*)\]/.exec(body);
  if (optionsMatch) body = body.slice(optionsMatch[0].length);
  body = body.replace(/^\s*\\usetikzlibrary\{[^}]*\}/, "").trim();
  return { body, options: optionsMatch ? optionsMatch[1] : "" };
}

function stripTikzDirectives(source: string): string {
  let output = source;
  for (const pattern of [/\\tikzset\s*\{/g, /\\usetikzlibrary\s*\{/g]) {
    let match = pattern.exec(output);
    while (match) {
      const block = readBraced(output, match.index + match[0].length - 1);
      if (!block) break;
      output = `${output.slice(0, match.index)} ${output.slice(block.end)}`;
      pattern.lastIndex = 0;
      match = pattern.exec(output);
    }
  }
  return output.replace(/\\tikzstyle\s*\{[^{}]*\}\s*=\s*(\{[^{}]*\}|\[[^\]]*\])/g, " ");
}

const DRAW_COMMANDS = new Set(["draw", "fill", "filldraw", "path", "shade", "shadedraw", "node", "coordinate"]);

function renderTikzBody(latex: string, renderText: (text: string) => string): TikzRenderResult {
  const { body: rawBody, options: rawOptions } = extractTikzBody(latex);
  const state: ParseState = {
    nodes: new Map(),
    styles: new Map(),
    unitX: PX_PER_CM,
    unitY: PX_PER_CM,
    scale: 1,
    rotate: 0,
  };
  collectTikzset(rawBody, state);

  const pictureOptions = parseOptions(rawOptions, state);
  const yMatch = /(?:^|,)\s*y\s*=\s*([\d.]+)\s*(cm|mm|in|pt|bp)?/.exec(rawOptions);
  if (yMatch) state.unitY = toUnitPx(Number(yMatch[1]), yMatch[2], PX_PER_CM);
  const xMatch = /(?:^|,)\s*x\s*=\s*([\d.]+)\s*(cm|mm|in|pt|bp)?/.exec(rawOptions);
  if (xMatch) state.unitX = toUnitPx(Number(xMatch[1]), xMatch[2], PX_PER_CM);
  if (pictureOptions.scale && pictureOptions.scale > 0) state.scale = pictureOptions.scale;
  const rotateMatch = /(?:^|,)\s*rotate\s*=\s*([-\d.]+)/.exec(rawOptions);
  if (rotateMatch) state.rotate = Number(rotateMatch[1]);

  const unsupported: string[] = [];
  const expanded = expandForeach(stripTikzDirectives(rawBody), unsupported);

  const ctx: StatementContext = { state, primitives: [], unsupported };
  const baseStyle = pictureOptions;

  for (const statement of splitStatements(expanded)) {
    const match = /^\\([a-zA-Z]+)\*?/.exec(statement);
    if (!match) continue;
    const command = match[1];
    if (command === "clip") {
      unsupported.push("\\clip");
      continue;
    }
    if (!DRAW_COMMANDS.has(command)) {
      unsupported.push(`\\${command}`);
      continue;
    }
    let cursor = match.index + match[0].length;
    const optionsBlock = readBracketed(statement, cursor);
    let options = parseOptions("", state);
    if (optionsBlock) {
      options = parseOptions(optionsBlock.content, state);
      cursor = optionsBlock.end;
    }
    const merged: StyleOptions = { ...baseStyle, ...options };
    const body = statement.slice(cursor).trim();
    if (command === "node" || command === "coordinate") {
      parseNodeStatement(body, command === "coordinate" ? { ...merged, shape: "coordinate" } : merged, ctx);
      continue;
    }
    if (!body) continue;
    parseDrawStatement(command, body, merged, ctx);
  }

  if (ctx.primitives.length === 0) {
    return {
      svg: "",
      width: 0,
      height: 0,
      unsupported,
      error: unsupported.length > 0
        ? `Nothing drawable in this tikzpicture (${unsupported.slice(0, 3).join(", ")} unsupported).`
        : "Nothing drawable in this tikzpicture.",
    };
  }

  const markerIds = new Map<DrawStyle, { start: string; end: string }>();
  const defs: string[] = [];
  let markerIndex = 0;
  for (const primitive of ctx.primitives) {
    if (primitive.kind !== "path" && primitive.kind !== "arc") continue;
    const style = primitive.style;
    if (!style.arrowStart && !style.arrowEnd) continue;
    if (markerIds.has(style)) continue;
    markerIndex += 1;
    const id = `tkz-${markerIndex}`;
    const color = style.stroke ?? "#000000";
    const size = style.lineWidth * 3.6 + 3.5;
    defs.push(
      `<marker id="${id}" viewBox="${r(-size * 1.4)} ${r(-size / 2)} ${r(size * 2.8)} ${r(size)}" refX="${r(size * 0.85)}" refY="0" markerWidth="${r(size)}" markerHeight="${r(size)}" orient="auto-start-reverse"><path d="M 0 ${r(-size / 2)} L ${r(size)} 0 L 0 ${r(size / 2)} Z" fill="${color}"/></marker>`,
      `<marker id="${id}-s" viewBox="${r(-size * 2.4)} ${r(-size / 2)} ${r(size * 2.8)} ${r(size)}" refX="${r(-size * 0.85)}" refY="0" markerWidth="${r(size)}" markerHeight="${r(size)}" orient="auto-start-reverse"><path d="M 0 ${r(-size / 2)} L ${r(-size)} 0 L 0 ${r(size / 2)} Z" fill="${color}"/></marker>`,
    );
    markerIds.set(style, { start: `${id}-s`, end: id });
  }

  const elements: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const primitive of ctx.primitives) {
    const fragment = renderPrimitive(primitive, renderText, markerIds);
    if (!fragment) continue;
    elements.push(fragment);
    const box = primitiveBox(primitive);
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }

  const pad = 6;
  const hasContent = Number.isFinite(minX);
  const boxMinX = (hasContent ? minX : 0) - pad;
  const boxMinY = (hasContent ? minY : 0) - pad;
  const boxMaxX = (hasContent ? maxX : 10) + pad;
  const boxMaxY = (hasContent ? maxY : 10) + pad;

  const viewBox = `${r(boxMinX)} ${r(boxMinY)} ${r(boxMaxX - boxMinX)} ${r(boxMaxY - boxMinY)}`;
  const svg = [
    `<svg class="tikz-svg" width="${r(boxMaxX - boxMinX)}" height="${r(boxMaxY - boxMinY)}" viewBox="${viewBox}" role="img" aria-label="TikZ figure">`,
    defs.length ? `<defs>${defs.join("")}</defs>` : "",
    ...elements,
    "</svg>",
  ].filter(Boolean).join("");

  return { svg, width: boxMaxX - boxMinX, height: boxMaxY - boxMinY, unsupported };
}

export function containsTikzPicture(latex: string): boolean {
  return /\\begin\{tikzpicture\}/.test(latex);
}

export function renderTikzPicture(latex: string, options: TikzRenderOptions = {}): TikzRenderResult {
  const renderText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return "";
    return options.renderText ? options.renderText(trimmed) : escapeHtml(trimmed);
  };
  try {
    return renderTikzBody(latex, renderText);
  } catch {
    return { svg: "", width: 0, height: 0, unsupported: [], error: "Could not parse this tikzpicture." };
  }
}
