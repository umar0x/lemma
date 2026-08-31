"use client";

import { getActiveEditorView } from "./editorView";
import { cn } from "@/lib/text";

interface MathToken {
  label: string;
  insert: string;
  cursorOffset: number;
}

const MATH_TOKENS: MathToken[] = [
  { label: "$", insert: "$$", cursorOffset: 1 },
  { label: "^", insert: "^{}", cursorOffset: 2 },
  { label: "_", insert: "_{}", cursorOffset: 2 },
  { label: "{}", insert: "{}", cursorOffset: 1 },
  { label: "\\", insert: "\\", cursorOffset: 1 },
  { label: "&", insert: " & ", cursorOffset: 3 },
  { label: "\\\\", insert: " \\\\\n", cursorOffset: 4 },
  { label: "\\frac", insert: "\\frac{}{}", cursorOffset: 6 },
  { label: "\\sqrt", insert: "\\sqrt{}", cursorOffset: 6 },
  { label: "\\int", insert: "\\int_{}^{}", cursorOffset: 7 },
  { label: "\\sum", insert: "\\sum_{}^{}", cursorOffset: 7 },
  { label: "\\lim", insert: "\\lim_{}", cursorOffset: 7 },
  { label: "\\text", insert: "\\text{}", cursorOffset: 6 },
  { label: "\\ce", insert: "\\ce{}", cursorOffset: 4 },
  { label: "\\alpha", insert: "\\alpha ", cursorOffset: 7 },
  { label: "\\beta", insert: "\\beta ", cursorOffset: 6 },
  { label: "\\pi", insert: "\\pi ", cursorOffset: 4 },
  { label: "\\infty", insert: "\\infty ", cursorOffset: 7 },
  { label: "\\leq", insert: "\\leq ", cursorOffset: 5 },
  { label: "\\geq", insert: "\\geq ", cursorOffset: 5 },
  { label: "\\begin{align}", insert: "\\begin{align}\n  \n\\end{align}", cursorOffset: 14 },
  { label: "\\begin{cases}", insert: "\\begin{cases}\n  \n\\end{cases}", cursorOffset: 14 },
];

export function MathKeyBar() {
  const insertToken = (token: MathToken) => {
    const view = getActiveEditorView();
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: token.insert },
      selection: { anchor: from + token.cursorOffset },
    });
    view.focus();
  };

  return (
    <div
      className="no-print flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-card px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="toolbar"
      aria-label="Math symbol keys"
    >
      {MATH_TOKENS.map((token) => (
        <button
          key={token.label}
          type="button"
          onClick={() => insertToken(token)}
          className={cn(
            "h-9 shrink-0 rounded-ctl border border-line bg-inset px-2.5 font-mono text-[12.5px] font-medium text-ink transition-colors active:border-bronze active:bg-bronze-soft active:text-bronze-ink",
          )}
        >
          {token.label}
        </button>
      ))}
    </div>
  );
}
