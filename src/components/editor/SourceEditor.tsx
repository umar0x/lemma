"use client";

import { useEffect, useRef } from "react";
import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  keymap,
  lineNumbers,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { tags as t } from "@lezer/highlight";
import { parseSource } from "@/core/blocks/parse";
import { useWorkspace } from "@/state/workspace";
import { latexCompletionSource } from "./latexCompletions";
import { setActiveEditorView } from "./editorView";

type DecorationSet = ReturnType<typeof Decoration.set>;

interface DocBlockRange {
  from: number;
  to: number;
}

export function computeDocBlockRanges(text: string): DocBlockRange[] {
  const segments = parseSource(text);
  const ranges: DocBlockRange[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const start = text.indexOf(segment.latex, cursor);
    if (start === -1) continue;
    ranges.push({ from: start, to: start + segment.latex.length });
    cursor = start + segment.latex.length;
  }
  return ranges;
}

const setErrorMarks = StateEffect.define<Array<{ from: number; to: number }>>();

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setErrorMarks)) {
        return Decoration.set(
          effect.value.map(({ from, to }) =>
            Decoration.mark({ class: "cm-latexError" }).range(from, Math.max(from + 1, to)),
          ),
        );
      }
    }
    return transaction.docChanged ? value.map(transaction.changes) : value;
  },
});

function boundaryDecorations(docText: string): DecorationSet {
  const ranges = computeDocBlockRanges(docText);
  const lines: Array<{ line: number }> = [];
  for (const range of ranges.slice(1)) {
    const line = docText.slice(0, range.from).split("\n").length;
    lines.push({ line });
  }
  return Decoration.set(
    lines.map(({ line }) => Decoration.line({ class: "cm-blockBoundary" }).range(line - 1)),
  );
}

const boundaryField = StateField.define<DecorationSet>({
  create: (state) => boundaryDecorations(state.doc.toString()),
  update(value, transaction) {
    if (transaction.docChanged) {
      return boundaryDecorations(transaction.state.doc.toString());
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const highlightStyle = HighlightStyle.define([
  { tag: t.comment, class: "tok-comment" },
  { tag: t.keyword, class: "tok-command" },
  { tag: t.tagName, class: "tok-command" },
  { tag: t.atom, class: "tok-atom" },
  { tag: t.bracket, class: "tok-bracket" },
  { tag: t.brace, class: "tok-bracket" },
  { tag: t.paren, class: "tok-bracket" },
  { tag: t.operator, class: "tok-operator" },
  { tag: t.string, class: "tok-string" },
  { tag: t.number, class: "tok-number" },
  { tag: t.variableName, class: "tok-variable" },
  { tag: t.meta, class: "tok-meta" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent" },
  ".cm-scroller": {
    scrollbarWidth: "thin",
    scrollbarColor: "color-mix(in srgb, var(--line-strong) 88%, var(--ink-faint)) transparent",
  },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    background: "color-mix(in srgb, var(--line-strong) 88%, var(--ink-faint))",
    borderRadius: "8px",
  },
  ".cm-content": { padding: "16px 4px 40vh 4px", caretColor: "var(--bronze)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--ink-faint)",
    paddingLeft: "8px",
    paddingRight: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "44px", fontSize: "11.5px", paddingRight: "8px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink-soft)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--bronze) 5%, transparent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selection) !important",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--bronze)", borderLeftWidth: "2px" },
  ".cm-blockBoundary": { borderTop: "1px dashed color-mix(in srgb, var(--line-strong) 60%, transparent)" },
  ".cm-latexError": {
    backgroundImage:
      "linear-gradient(45deg, transparent 65%, color-mix(in srgb, var(--oxblood) 55%, transparent) 65%, color-mix(in srgb, var(--oxblood) 55%, transparent) 80%, transparent 80%)",
    backgroundSize: "6px 3px",
    backgroundRepeat: "repeat-x",
    backgroundPosition: "bottom",
    paddingBottom: "2px",
  },
  ".tok-comment": { color: "var(--ink-faint)", fontStyle: "italic" },
  ".tok-command": { color: "var(--bronze-strong)" },
  ".tok-atom": { color: "var(--olive)" },
  ".tok-bracket": { color: "var(--gold)" },
  ".tok-operator": { color: "var(--ink-soft)" },
  ".tok-string": { color: "var(--forest)" },
  ".tok-number": { color: "var(--olive)" },
  ".tok-variable": { color: "var(--ink)" },
  ".tok-meta": { color: "var(--ink-faint)" },
  ".cm-tooltip": {
    backgroundColor: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "var(--shadow-raised)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    maxHeight: "240px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "4px 8px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--bronze-soft)",
    color: "var(--bronze-ink)",
  },
  ".cm-completionDetail": { color: "var(--ink-faint)", fontStyle: "normal", marginLeft: "8px" },
  ".cm-panels": { backgroundColor: "var(--card)", color: "var(--ink)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--line)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--gold) 28%, transparent)" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--bronze) 45%, transparent)" },
  ".cm-textfield": {
    backgroundColor: "var(--inset)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "6px",
  },
  ".cm-button": {
    backgroundColor: "var(--inset)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    backgroundImage: "none",
  },
});

function insertSnippet(view: EditorView, insert: string, cursorOffset: number): boolean {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + cursorOffset },
  });
  return true;
}

function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + before.length + selected.length },
  });
  return true;
}

function moveOver(view: EditorView, character: string): boolean {
  const { to } = view.state.selection.main;
  if (view.state.sliceDoc(to, to + 1) === character) {
    view.dispatch({ selection: { anchor: to + 1 } });
    return true;
  }
  return false;
}

const smartPairsKeymap = Prec.high(
  keymap.of([
    {
      key: "$",
      run: (view) => {
        const { from, to } = view.state.selection.main;
        if (from !== to) return wrapSelection(view, "$", "$");
        if (moveOver(view, "$")) return true;
        return insertSnippet(view, "$$", 1);
      },
    },
    {
      key: "{",
      run: (view) => {
        const { from, to } = view.state.selection.main;
        if (from !== to) return wrapSelection(view, "{", "}");
        return insertSnippet(view, "{}", 1);
      },
    },
    {
      key: "}",
      run: (view) => moveOver(view, "}"),
    },
    {
      key: "^",
      run: (view) => insertSnippet(view, "^{}", 2),
    },
    {
      key: "_",
      run: (view) => insertSnippet(view, "_{}", 2),
    },
  ]),
);

export interface SourceEditorProps {
  documentId: string;
  sourceText: string;
  errorPositions: Array<{ blockId: string; position: number; length: number }>;
  onVisibleBlockChange?: (blockIndex: number) => void;
}

export function SourceEditor({
  documentId,
  sourceText,
  errorPositions,
  onVisibleBlockChange,
}: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentIdRef = useRef(documentId);
  const visibleRef = useRef(onVisibleBlockChange);
  const sourceRef = useRef(sourceText);

  useEffect(() => {
    documentIdRef.current = documentId;
    visibleRef.current = onVisibleBlockChange;
    sourceRef.current = sourceText;
  });

  useEffect(() => {
    if (!hostRef.current) return;
    const reportVisibleBlock = () => {
      const view = viewRef.current;
      if (!view || !visibleRef.current) return;
      const blockAt = view.lineBlockAtHeight(view.scrollDOM.scrollTop - view.documentTop + 8);
      const ranges = computeDocBlockRanges(view.state.doc.toString());
      let index = 0;
      for (let i = 0; i < ranges.length; i += 1) {
        if (ranges[i].from <= blockAt.from) index = i;
        else break;
      }
      visibleRef.current(index);
    };

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: sourceRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          crosshairCursor(),
          bracketMatching(),
          search({ top: true }),
          autocompletion({ override: [latexCompletionSource], icons: false }),
          EditorState.allowMultipleSelections.of(true),
          StreamLanguage.define(stex),
          syntaxHighlighting(highlightStyle),
          EditorView.lineWrapping,
          smartPairsKeymap,
          boundaryField,
          errorField,
          editorTheme,
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const text = update.state.doc.toString();
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                useWorkspace.getState().setSource(documentIdRef.current, text);
              }, 140);
            }
            if (update.docChanged || update.geometryChanged) {
              requestAnimationFrame(reportVisibleBlock);
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    setActiveEditorView(view);
    const onScroll = () => requestAnimationFrame(reportVisibleBlock);
    view.scrollDOM.addEventListener("scroll", onScroll);
    reportVisibleBlock();

    return () => {
      view.scrollDOM.removeEventListener("scroll", onScroll);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setActiveEditorView(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== sourceText) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: sourceText } });
    }
  }, [sourceText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const ranges = computeDocBlockRanges(text);
    const blocks = useWorkspace
      .getState()
      .documents.find((d) => d.id === documentIdRef.current)?.blocks;
    const marks: Array<{ from: number; to: number }> = [];
    if (blocks) {
      for (const error of errorPositions) {
        const index = blocks.findIndex((b) => b.id === error.blockId);
        if (index === -1 || !ranges[index]) continue;
        const from = Math.min(ranges[index].from + error.position, text.length);
        const to = Math.min(from + Math.max(1, error.length), text.length);
        marks.push({ from, to });
      }
    }
    view.dispatch({ effects: setErrorMarks.of(marks) });
  }, [errorPositions, sourceText]);

  const focusTarget = useWorkspace((state) => state.focusTarget);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !focusTarget) return;
    const text = view.state.doc.toString();
    const ranges = computeDocBlockRanges(text);
    const blocks = useWorkspace
      .getState()
      .documents.find((d) => d.id === documentIdRef.current)?.blocks;
    if (!blocks) return;
    const index = blocks.findIndex((b) => b.id === focusTarget.blockId);
    if (index !== -1 && ranges[index]) {
      view.dispatch({
        effects: EditorView.scrollIntoView(ranges[index].from, { y: "center" }),
      });
    }
  }, [focusTarget]);

  return (
    <div
      ref={hostRef}
      className="h-full min-h-0 overflow-hidden bg-card"
      aria-label="LaTeX source editor"
    />
  );
}
