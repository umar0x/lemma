import { escapeHtml } from "@/lib/text";
import { spacePadLabels } from "./macros";

export interface InlineMathError {
  message: string;
  position: number;
  length: number;
  context: string;
}

export interface RichTextResult {
  html: string;
  error?: InlineMathError;
}

export interface RichTextOptions {
  renderMath: (tex: string, displayMode: boolean) => { html: string; error?: { message: string; position?: number } };
  resolveRef?: (label: string) => string | undefined;
}

const LIST_ENVS = new Set(["itemize", "enumerate", "description"]);
const WRAP_CLASSES: Record<string, string> = {
  center: "rt-center",
  flushleft: "rt-left",
  flushright: "rt-right",
  quote: "rt-quote",
  quotation: "rt-quote",
  abstract: "rt-abstract",
};
const HEADING_RE = /^\s*(\\(?:sub){0,2}section\*?|\\paragraph\*?)\s*\{([\s\S]*)\}\s*$/;

const SAFE_COLORS: Record<string, string> = {
  red: "var(--oxblood)",
  green: "var(--forest)",
  blue: "var(--bronze-strong)",
  brown: "var(--bronze-strong)",
  bronze: "var(--bronze)",
  gold: "var(--gold)",
  gray: "var(--ink-faint)",
  grey: "var(--ink-faint)",
  olive: "var(--olive)",
  darkgray: "var(--ink-faint)",
};

function safeColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (SAFE_COLORS[trimmed]) return SAFE_COLORS[trimmed];
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(trimmed)) return trimmed;
  return null;
}

function padComments(latex: string): string {
  return latex
    .split("\n")
    .map((line) => {
      let index = -1;
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === "\\") {
          i += 1;
          continue;
        }
        if (line[i] === "%") {
          index = i;
          break;
        }
      }
      if (index === -1) return line;
      return line.slice(0, index) + " ".repeat(line.length - index);
    })
    .join("\n");
}

interface InlineRun {
  placeholder: string;
  content: string;
  display: boolean;
  offset: number;
  kind: "math" | "verb";
}

function extractRuns(text: string): { text: string; runs: InlineRun[] } {
  const runs: InlineRun[] = [];
  let out = "";
  let i = 0;

  const pushRun = (content: string, display: boolean, offset: number, kind: InlineRun["kind"]) => {
    const placeholder = `\u0000${runs.length}\u0000`;
    runs.push({ placeholder, content, display, offset, kind });
    out += placeholder;
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\" && (text[i + 1] === "(" || text[i + 1] === "[")) {
      const display = text[i + 1] === "[";
      const closer = display ? "\\]" : "\\)";
      const end = text.indexOf(closer, i + 2);
      if (end !== -1) {
        pushRun(text.slice(i + 2, end), display, i + 2, "math");
        i = end + 2;
        continue;
      }
    }

    if (ch === "$" && text[i + 1] === "$") {
      const end = text.indexOf("$$", i + 2);
      if (end !== -1) {
        pushRun(text.slice(i + 2, end), true, i + 2, "math");
        i = end + 2;
        continue;
      }
    }

    if (ch === "$" && text[i + 1] !== "$" && i + 1 < text.length) {
      let end = -1;
      for (let j = i + 1; j < text.length; j += 1) {
        if (text[j] === "\\") {
          j += 1;
          continue;
        }
        if (text[j] === "$") {
          end = j;
          break;
        }
      }
      if (end !== -1) {
        pushRun(text.slice(i + 1, end), false, i + 1, "math");
        i = end + 1;
        continue;
      }
    }

    if (ch === "\\" && /^\\verb\*?/.test(text.slice(i, i + 6))) {
      const match = /^\\verb\*?(.)/.exec(text.slice(i));
      if (match) {
        const delim = match[1];
        if (delim !== "\\") {
          const end = text.indexOf(delim, i + match[0].length);
          if (end !== -1) {
            pushRun(text.slice(i + match[0].length, end), false, i, "verb");
            i = end + 1;
            continue;
          }
        }
      }
    }

    out += ch;
    i += 1;
  }

  return { text: out, runs };
}

function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function readBalancedGroup(text: string, from: number): { content: string; end: number } | null {
  if (text[from] !== "{") return null;
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { content: text.slice(from + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

const SPACING_COMMANDS: Record<string, string> = {
  ",": "&thinsp;",
  ";": "&emsp;",
  ":": "&ensp;",
  "!": "",
  quad: "&emsp;&emsp;",
  qquad: "&emsp;&emsp;&emsp;&emsp;",
};

const LINEBREAK_COMMANDS = new Set(["newline", "linebreak", "par"]);

const STRIP_COMMANDS = new Set([
  "noindent",
  "indent",
  "centering",
  "raggedright",
  "raggedleft",
  "strut",
  "displaybreak",
  "allowdisplaybreaks",
  "limits",
  "nolimits",
  "small",
  "large",
  "Large",
  "normalsize",
  "footnotesize",
  "scriptsize",
  "tiny",
  "huge",
  "Huge",
]);

type CommandRenderer = (args: string[], resolve: (label: string) => string | undefined) => string;

const ARG_COMMANDS: Record<string, { arity: number; render: CommandRenderer }> = {
  textbf: {
    arity: 1,
    render: ([content], resolve) => `<strong>${applyInlineCommands(content, resolve)}</strong>`,
  },
  textit: { arity: 1, render: ([c], r) => `<em>${applyInlineCommands(c, r)}</em>` },
  emph: { arity: 1, render: ([c], r) => `<em>${applyInlineCommands(c, r)}</em>` },
  texttt: { arity: 1, render: ([c], r) => `<code>${applyInlineCommands(c, r)}</code>` },
  underline: { arity: 1, render: ([c], r) => `<u>${applyInlineCommands(c, r)}</u>` },
  textsc: {
    arity: 1,
    render: ([c], r) => `<span class="rt-smallcaps">${applyInlineCommands(c, r)}</span>`,
  },
  textsuperscript: { arity: 1, render: ([c], r) => `<sup>${applyInlineCommands(c, r)}</sup>` },
  textsubscript: { arity: 1, render: ([c], r) => `<sub>${applyInlineCommands(c, r)}</sub>` },
  textnormal: { arity: 1, render: ([c], r) => applyInlineCommands(c, r) },
  textrm: { arity: 1, render: ([c], r) => applyInlineCommands(c, r) },
  enquote: {
    arity: 1,
    render: ([c], r) => `\u201c${applyInlineCommands(c, r)}\u201d`,
  },
  textcolor: {
    arity: 2,
    render: ([color, content], r) => {
      const css = safeColor(color);
      return css
        ? `<span class="rt-color" style="color:${css}">${applyInlineCommands(content, r)}</span>`
        : applyInlineCommands(content, r);
    },
  },
  colorbox: {
    arity: 2,
    render: ([, content], r) => applyInlineCommands(content, r),
  },
  href: {
    arity: 2,
    render: ([url, label], r) => {
      const href = safeHref(unescapeHtml(url));
      return href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${applyInlineCommands(label, r)}</a>`
        : applyInlineCommands(label, r);
    },
  },
  url: {
    arity: 1,
    render: ([url]) => {
      const href = safeHref(unescapeHtml(url));
      return href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(href)}</a>`
        : escapeHtml(unescapeHtml(url));
    },
  },
  ref: {
    arity: 1,
    render: ([label], resolve) =>
      `<span class="rt-ref">${escapeHtml(resolve(label.trim()) ?? label.trim())}</span>`,
  },
  eqref: {
    arity: 1,
    render: ([label], resolve) => {
      const target = resolve(label.trim());
      return `<span class="rt-ref">${target ? `(${escapeHtml(target)})` : escapeHtml(label.trim())}</span>`;
    },
  },
  autoref: {
    arity: 1,
    render: ([label], resolve) =>
      `<span class="rt-ref">${escapeHtml(resolve(label.trim()) ?? label.trim())}</span>`,
  },
  cref: {
    arity: 1,
    render: ([label], resolve) =>
      `<span class="rt-ref">${escapeHtml(resolve(label.trim()) ?? label.trim())}</span>`,
  },
  footnote: {
    arity: 1,
    render: ([content], r) => `<sup class="rt-footnote">${applyInlineCommands(content, r)}</sup>`,
  },
  phantom: { arity: 1, render: () => "" },
  hphantom: { arity: 1, render: () => "" },
  vphantom: { arity: 1, render: () => "" },
  smash: { arity: 1, render: ([c], r) => applyInlineCommands(c, r) },
  mbox: { arity: 1, render: ([c], r) => applyInlineCommands(c, r) },
  label: { arity: 1, render: () => "" },
};

function applyInlineCommands(
  escaped: string,
  resolveRef: (label: string) => string | undefined,
): string {
  let result = "";
  let i = 0;

  while (i < escaped.length) {
    const ch = escaped[i];

    if (ch !== "\\") {
      result += ch;
      i += 1;
      continue;
    }

    if (escaped[i + 1] === "\\") {
      const spacingArg = /^\[[^\]]*\]/.exec(escaped.slice(i + 2));
      result += "<br/>";
      i += 2 + (spacingArg ? spacingArg[0].length : 0);
      continue;
    }

    if (escaped[i + 1] === " ") {
      result += "&nbsp;";
      i += 2;
      continue;
    }

    const spacingMatch = /^\\([,;:!])/.exec(escaped.slice(i));
    if (spacingMatch) {
      result += SPACING_COMMANDS[spacingMatch[1]];
      i += 2;
      continue;
    }

    const escapedChar = /^\\([%_#$&{}])/.exec(escaped.slice(i));
    if (escapedChar) {
      result += escapedChar[1];
      i += 2;
      continue;
    }

    const wordMatch = /^\\([a-zA-Z]+)/.exec(escaped.slice(i));
    if (wordMatch) {
      const command = wordMatch[1];
      const afterCommand = i + wordMatch[0].length;
      const followedBySpace = /^\s/.test(escaped.slice(afterCommand));

      if (SPACING_COMMANDS[command] !== undefined) {
        result += SPACING_COMMANDS[command];
        i = afterCommand + (followedBySpace ? 1 : 0);
        continue;
      }

      if (STRIP_COMMANDS.has(command)) {
        i = afterCommand + (followedBySpace ? 1 : 0);
        continue;
      }

      if (LINEBREAK_COMMANDS.has(command)) {
        result += "<br/>";
        i = afterCommand + (followedBySpace ? 1 : 0);
        continue;
      }

      const spec = ARG_COMMANDS[command];
      if (spec) {
        let cursor = afterCommand;
        const args: string[] = [];
        let valid = true;
        for (let a = 0; a < spec.arity; a += 1) {
          while (cursor < escaped.length && /\s/.test(escaped[cursor])) cursor += 1;
          const group = readBalancedGroup(escaped, cursor);
          if (!group) {
            valid = false;
            break;
          }
          args.push(group.content);
          cursor = group.end;
        }
        if (valid) {
          result += spec.render(args, resolveRef);
          i = cursor;
          continue;
        }
      }

      result += wordMatch[0];
      i = afterCommand;
      continue;
    }

    result += ch;
    i += 1;
  }

  return result;
}

function formatInline(escaped: string, options: RichTextOptions): string {
  let out = applyInlineCommands(escaped, options.resolveRef ?? (() => undefined));
  out = out.replace(/\\item\s*(?:\[[^\]]*\])?/g, "");
  out = out.replace(/``([^']*)''/g, "\u201c$1\u201d");
  out = out.replace(/`([^']*)'/g, "\u2018$1\u2019");
  out = out.replace(/---/g, "\u2014");
  out = out.replace(/--/g, "\u2013");
  out = out.replace(/\\dots\b|\.\.\./g, "\u2026");
  out = out.replace(/\\LaTeX\b/g, '<span class="rt-latex">L<sup>a</sup>T<sub>e</sub>X</span>');
  out = out.replace(/\\TeX\b/g, '<span class="rt-latex">T<sub>e</sub>X</span>');
  out = out.replace(/~/g, "&nbsp;");
  out = out.replace(/\\([%_#$&{}])/g, "$1");
  out = out.replace(/\\/g, "");
  return out;
}

function renderInline(text: string, options: RichTextOptions): RichTextResult {
  const { text: withPlaceholders, runs } = extractRuns(text);
  let html = formatInline(escapeHtml(withPlaceholders), options);
  let error: InlineMathError | undefined;

  for (const run of runs) {
    if (run.kind === "verb") {
      html = html.replace(
        run.placeholder,
        `<code class="rt-verb">${escapeHtml(run.content)}</code>`,
      );
      continue;
    }
    const result = options.renderMath(run.content, run.display);
    if (result.error && !error) {
      error = {
        message: result.error.message,
        position: run.offset + (result.error.position ?? 0),
        length: run.content.length,
        context: text.slice(Math.max(0, run.offset - 30), run.offset + run.content.length + 30),
      };
    }
    const rendered = result.error
      ? `<span class="rt-math-error" title="${escapeHtml(result.error.message)}">${escapeHtml(run.content)}</span>`
      : result.html;
    html = html.replace(run.placeholder, rendered);
  }

  return { html, error };
}

interface TopLevelSegment {
  kind: "text" | "list" | "wrap" | "skip";
  content: string;
  env?: string;
}

const TOP_ENV_RE =
  /\\begin\{(itemize|enumerate|description|center|flushleft|flushright|quote|quotation|abstract|comment)\}/g;

function findEnvEnd(padded: string, env: string, searchFrom: number): number {
  const beginToken = `\\begin{${env}}`;
  const endToken = `\\end{${env}}`;
  let depth = 1;
  while (depth > 0) {
    const nextBegin = padded.indexOf(beginToken, searchFrom);
    const nextEnd = padded.indexOf(endToken, searchFrom);
    if (nextEnd === -1) return -1;
    if (nextBegin !== -1 && nextBegin < nextEnd) {
      depth += 1;
      searchFrom = nextBegin + beginToken.length;
    } else {
      depth -= 1;
      searchFrom = nextEnd + endToken.length;
      if (depth === 0) return nextEnd;
    }
  }
  return -1;
}

function splitTopLevel(padded: string): TopLevelSegment[] {
  const segments: TopLevelSegment[] = [];
  const re = new RegExp(TOP_ENV_RE.source, "g");
  let cursor = 0;
  let match = re.exec(padded);

  while (match) {
    const env = match[1];
    const endPos = findEnvEnd(padded, env, match.index + match[0].length);
    if (endPos === -1) {
      match = re.exec(padded);
      continue;
    }
    if (match.index > cursor) {
      segments.push({ kind: "text", content: padded.slice(cursor, match.index) });
    }
    const inner = padded.slice(match.index + match[0].length, endPos);
    segments.push(
      env === "comment"
        ? { kind: "skip", env, content: inner }
        : LIST_ENVS.has(env)
          ? { kind: "list", env, content: inner }
          : { kind: "wrap", env, content: inner },
    );
    cursor = endPos + `\\end{${env}}`.length;
    re.lastIndex = cursor;
    match = re.exec(padded);
  }

  if (cursor < padded.length) {
    segments.push({ kind: "text", content: padded.slice(cursor) });
  }
  return segments.filter((segment) => segment.kind !== "text" || segment.content.trim());
}

function topLevelItemPositions(content: string): number[] {
  const positions: number[] = [];
  const itemRe = /\\item(?![a-zA-Z])/g;
  const envStack: string[] = [];
  const envRe = /\\(begin|end)\{(itemize|enumerate|description)\}/g;
  let envMatch = envRe.exec(content);
  let itemMatch = itemRe.exec(content);

  while (itemMatch) {
    while (envMatch && envMatch.index < itemMatch.index) {
      if (envMatch[1] === "begin") envStack.push(envMatch[2]);
      else envStack.pop();
      envMatch = envRe.exec(content);
    }
    if (envStack.length === 0) positions.push(itemMatch.index);
    itemMatch = itemRe.exec(content);
  }
  return positions;
}

function renderListItems(content: string, options: RichTextOptions): RichTextResult {
  const positions = topLevelItemPositions(content);
  if (positions.length === 0) {
    return renderRichText(content, options);
  }

  let error: InlineMathError | undefined;
  const items: string[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : content.length;
    let itemContent = content.slice(start, end);
    const labelMatch = /^\\item\s*\[([^\]]*)\]/.exec(itemContent);
    itemContent = itemContent.replace(/^\\item\s*(\[[^\]]*\])?/, "");
    const result = renderRichText(itemContent, options);
    error = error ?? result.error;
    const label = labelMatch ? `<span class="rt-item-label">${escapeHtml(labelMatch[1])}</span> ` : "";
    items.push(`<li>${label}${result.html}</li>`);
  }
  return { html: items.join(""), error };
}

export function renderRichText(latex: string, options: RichTextOptions): RichTextResult {
  const padded = padComments(spacePadLabels(latex));
  const segments = splitTopLevel(padded);
  let error: InlineMathError | undefined;
  const htmls: string[] = [];

  for (const segment of segments) {
    if (segment.kind === "skip") continue;

    if (segment.kind === "list") {
      const tag = segment.env === "enumerate" ? "ol" : "ul";
      const result = renderListItems(segment.content, options);
      error = error ?? result.error;
      htmls.push(`<${tag} class="rt-list">${result.html}</${tag}>`);
      continue;
    }

    if (segment.kind === "wrap") {
      const result = renderRichText(segment.content, options);
      error = error ?? result.error;
      if (segment.env === "abstract") {
        htmls.push(
          `<div class="rt-abstract"><span class="rt-abstract-label">Abstract</span>${result.html}</div>`,
        );
      } else {
        htmls.push(`<div class="${WRAP_CLASSES[segment.env ?? "center"] ?? "rt-center"}">${result.html}</div>`);
      }
      continue;
    }

    const headingMatch = HEADING_RE.exec(segment.content.trim());
    if (headingMatch) {
      const command = headingMatch[1];
      const level = command.includes("subsubsection")
        ? 3
        : command.includes("subsection")
          ? 2
          : command.includes("paragraph")
            ? 4
            : 1;
      const title = renderInline(headingMatch[2], options);
      error = error ?? title.error;
      const tag = `h${Math.min(5, level + 1)}`;
      htmls.push(`<${tag} class="rt-heading rt-h${Math.min(5, level + 1)}">${title.html}</${tag}>`);
      continue;
    }

    const paragraphs = segment.content.split(/\n\s*\n/).filter((p) => p.trim());
    for (const paragraph of paragraphs) {
      const result = renderInline(paragraph, options);
      error = error ?? result.error;
      htmls.push(`<p class="rt-p">${result.html}</p>`);
    }
  }

  return { html: htmls.join(""), error };
}
