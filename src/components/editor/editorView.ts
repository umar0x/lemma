import type { EditorView } from "@codemirror/view";

let currentView: EditorView | null = null;

export function setActiveEditorView(view: EditorView | null): void {
  currentView = view;
}

export function getActiveEditorView(): EditorView | null {
  return currentView;
}
