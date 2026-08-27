const MACRO_DEF_RE =
  /\\(?:newcommand|renewcommand|providecommand)\*?\s*(?:\{\\([a-zA-Z]+)\}|\\([a-zA-Z]+))\s*(?:\[(\d+)\])?\s*/g;
const OPERATOR_DEF_RE = /\\DeclareMathOperator\*?\s*\{\\([a-zA-Z]+)\}\s*/g;
const DEF_RE = /\\def\s*\\([a-zA-Z]+)\s*/g;

export interface MacroDefinition {
  name: string;
  body: string;
}

function readBalancedGroup(source: string, openIndex: number): { content: string; end: number } | null {
  if (source[openIndex] !== "{") return null;
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { content: source.slice(openIndex + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

function collect(
  source: string,
  regex: RegExp,
  nameIndex: [number, number],
  results: MacroDefinition[],
  wrapBody: (body: string) => string = (body) => body,
): void {
  const re = new RegExp(regex.source, "g");
  let match = re.exec(source);
  while (match) {
    const name = match[nameIndex[0]] ?? match[nameIndex[1]];
    if (name) {
      const group = readBalancedGroup(source, match.index + match[0].length);
      if (group) {
        results.push({ name, body: wrapBody(group.content) });
      }
    }
    match = re.exec(source);
  }
}

export function extractMacros(latex: string): MacroDefinition[] {
  const results: MacroDefinition[] = [];
  collect(latex, MACRO_DEF_RE, [1, 2], results);
  collect(latex, OPERATOR_DEF_RE, [1, 1], results, (body) => `\\operatorname{${body}}`);
  collect(latex, DEF_RE, [1, 1], results);
  return results;
}

export function collectMacros(latexList: string[]): Record<string, string> {
  const macros: Record<string, string> = {};
  for (const latex of latexList) {
    for (const { name, body } of extractMacros(latex)) {
      macros[`\\${name}`] = body;
    }
  }
  return macros;
}

export function countMacros(latex: string): number {
  return extractMacros(latex).length;
}

export function spacePadCommand(latex: string, command: string): string {
  const re = new RegExp(`\\\\${command}\\{[^{}]*\\}`, "g");
  return latex.replace(re, (match) => " ".repeat(match.length));
}

export function spacePadLabels(latex: string): string {
  return spacePadCommand(latex, "label");
}

export function extractLabels(latex: string): string[] {
  const labels: string[] = [];
  const re = /\\label\{([^{}]*)\}/g;
  let match = re.exec(latex);
  while (match) {
    labels.push(match[1]);
    match = re.exec(latex);
  }
  return labels;
}
