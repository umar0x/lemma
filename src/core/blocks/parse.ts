import type { BlockType, ParsedSegment } from "./types";

const ENV_TYPE_ENTRIES: Array<[string, BlockType]> = [
  ["align", "align"], ["align*", "align"], ["aligned", "align"], ["alignat", "align"], ["alignat*", "align"],
  ["gather", "align"], ["gather*", "align"], ["multline", "align"], ["multline*", "align"],
  ["eqnarray", "align"], ["eqnarray*", "align"], ["flalign", "align"], ["flalign*", "align"],
  ["equation", "equation"], ["equation*", "equation"], ["displaymath", "equation"], ["math", "equation"],
  ["split", "equation"], ["gathered", "equation"], ["alignedat", "equation"],
  ["matrix", "equation"], ["pmatrix", "equation"], ["bmatrix", "equation"], ["Bmatrix", "equation"],
  ["vmatrix", "equation"], ["Vmatrix", "equation"], ["smallmatrix", "equation"], ["subarray", "equation"],
  ["array", "equation"], ["cases", "equation"], ["dcases", "equation"], ["rcases", "equation"],
  ["theorem", "theorem"], ["lemma", "theorem"], ["proposition", "theorem"], ["corollary", "theorem"],
  ["definition", "theorem"], ["remark", "theorem"], ["proof", "theorem"], ["example", "theorem"],
  ["axiom", "theorem"], ["note", "theorem"], ["fact", "theorem"], ["claim", "theorem"],
  ["conjecture", "theorem"], ["criterion", "theorem"], ["property", "theorem"], ["observation", "theorem"],
  ["figure", "figure"], ["figure*", "figure"], ["wrapfigure", "figure"], ["tikzpicture", "figure"],
  ["table", "table"], ["table*", "table"], ["tabular", "table"], ["tabular*", "table"], ["tabularx", "table"],
  ["verbatim", "code"], ["lstlisting", "code"], ["minted", "code"], ["alltt", "code"],
  ["itemize", "text"], ["enumerate", "text"], ["description", "text"],
  ["center", "text"], ["flushleft", "text"], ["flushright", "text"],
  ["quote", "text"], ["quotation", "text"], ["abstract", "text"], ["comment", "text"],
];

export const ENV_TYPE: Record<string, BlockType> = Object.fromEntries(ENV_TYPE_ENTRIES);

const MACRO_COMMANDS = [
  "\\newcommand", "\\renewcommand", "\\providecommand", "\\DeclareMathOperator", "\\def",
  "\\documentclass", "\\usepackage", "\\title", "\\author", "\\date",
];

const MACRO_START_RE = new RegExp(`^\\s*(?:${MACRO_COMMANDS.map(escapeRe).join("|")})\\b`);

function escapeRe(value: string): string {
  return value.replace(/[\\{}*]/g, "\\$&");
}

export function isCommented(source: string, position: number): boolean {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  let i = lineStart;
  while (i < position) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "%") return true;
    i += 1;
  }
  return false;
}

interface BeginMatch {
  env: string;
  start: number;
  end: number;
}

function nextBegin(source: string, from: number, knownOnly: boolean): BeginMatch | null {
  const re = /\\begin\{([a-zA-Z@]+\*?)\}/g;
  re.lastIndex = from;
  for (let match = re.exec(source); match; match = re.exec(source)) {
    if (isCommented(source, match.index)) continue;
    if (knownOnly && !(match[1] in ENV_TYPE)) continue;
    return { env: match[1], start: match.index, end: match.index + match[0].length };
  }
  return null;
}

function findEnd(source: string, env: string, searchFrom: number): number | null {
  const beginToken = `\\begin{${env}}`;
  const endToken = `\\end{${env}}`;
  let depth = 1;
  let cursor = searchFrom;

  while (depth > 0) {
    let nextBegin = source.indexOf(beginToken, cursor);
    while (nextBegin !== -1 && isCommented(source, nextBegin)) {
      nextBegin = source.indexOf(beginToken, nextBegin + 1);
    }
    const nextEnd = source.indexOf(endToken, cursor);
    if (nextEnd === -1) return null;

    if (nextBegin !== -1 && nextBegin < nextEnd) {
      depth += 1;
      cursor = nextBegin + beginToken.length;
      continue;
    }
    if (isCommented(source, nextEnd)) {
      cursor = nextEnd + endToken.length;
      continue;
    }
    depth -= 1;
    cursor = nextEnd + endToken.length;
    if (depth === 0) return cursor;
  }
  return null;
}

function nextUncommented(source: string, needle: string, from: number): number {
  let index = source.indexOf(needle, from);
  while (index !== -1 && isCommented(source, index)) {
    index = source.indexOf(needle, index + 1);
  }
  return index;
}

function classifyParagraph(latex: string): BlockType {
  if (MACRO_START_RE.test(latex)) return "preamble";
  return "text";
}

export function parseSource(source: string): ParsedSegment[] {
  const src = source.replace(/\r\n?/g, "\n");
  const segments: ParsedSegment[] = [];
  let paragraph = "";
  let cursor = 0;

  const flushParagraph = () => {
    const latex = paragraph.replace(/^\n+|\s+$/g, "");
    if (latex) segments.push({ type: classifyParagraph(latex), latex });
    paragraph = "";
  };

  while (cursor < src.length) {
    const blankMatch = /\n[ \t]*\n/.exec(src.slice(cursor));
    const blankPos = blankMatch ? cursor + blankMatch.index : Infinity;
    const blankLen = blankMatch ? blankMatch[0].length : 0;

    const bracketPos = nextUncommented(src, "\\[", cursor);
    const dollarPos = nextUncommented(src, "$$", cursor);
    const displayPos = Math.min(
      bracketPos === -1 ? Infinity : bracketPos,
      dollarPos === -1 ? Infinity : dollarPos,
    );

    const begin = nextBegin(src, cursor, true);
    const beginPos = begin ? begin.start : Infinity;

    const boundary = Math.min(blankPos, displayPos, beginPos);

    if (boundary === Infinity) {
      paragraph += src.slice(cursor);
      cursor = src.length;
      break;
    }

    if (boundary === blankPos) {
      paragraph += src.slice(cursor, blankPos + 1);
      flushParagraph();
      cursor = blankPos + blankLen;
      continue;
    }

    if (boundary === displayPos) {
      const isBracket = bracketPos !== -1 && (dollarPos === -1 || bracketPos < dollarPos);
      const opener = isBracket ? "\\[" : "$$";
      const closer = isBracket ? "\\]" : "$$";
      const closePos = nextUncommented(src, closer, displayPos + opener.length);
      if (closePos === -1) {
        paragraph += src.slice(cursor, displayPos + opener.length);
        cursor = displayPos + opener.length;
        continue;
      }
      paragraph += src.slice(cursor, displayPos);
      flushParagraph();
      segments.push({
        type: "equation",
        latex: src.slice(displayPos, closePos + closer.length).trim(),
      });
      cursor = closePos + closer.length;
      continue;
    }

    if (!begin || begin.start !== boundary) continue;

    const endPos = findEnd(src, begin.env, begin.end);
    if (endPos === null) {
      paragraph += src.slice(cursor, begin.end);
      cursor = begin.end;
      continue;
    }

    paragraph += src.slice(cursor, begin.start);
    flushParagraph();
    segments.push({ type: ENV_TYPE[begin.env], latex: src.slice(begin.start, endPos).trim() });
    cursor = endPos;
  }

  flushParagraph();
  return segments;
}

export function deriveBlockType(latex: string, fallback: BlockType): BlockType {
  return parseSource(latex)[0]?.type ?? fallback;
}
