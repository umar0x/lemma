import { create } from "zustand";
import { createId } from "@/lib/ids";
import { deriveBlockType, parseSource } from "@/core/blocks/parse";
import { reconcileBlocks } from "@/core/blocks/reconcile";
import { serializeBlocks } from "@/core/blocks/serialize";
import type {
  Author,
  Block,
  CommentThread,
  DocumentRecord,
  ParsedSegment,
} from "@/core/blocks/types";
import {
  createDocumentFromTemplate,
  segmentsToBlocks,
  type TemplateId,
} from "@/core/templates";
import { createSeedDocument } from "@/core/templates/seed";
import { documentRepository, metaRepository } from "@/core/storage/db";
import type { PrintConfig } from "@/components/print/printConfig";

export type ViewMode = "source" | "split" | "preview";
export type WebMcpStatus = "unavailable" | "registering" | "ready" | "error";

export type ActivityKind =
  | "create"
  | "insert"
  | "update"
  | "delete"
  | "comment"
  | "resolve"
  | "view"
  | "export";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  message: string;
  documentId?: string;
  blockIds?: string[];
  at: number;
  undoable?: boolean;
}

interface HistoryEntry {
  blocks: Block[];
  threads: CommentThread[];
  title: string;
  sourceText: string;
  author: Author;
}

export interface WorkspaceState {
  status: "loading" | "ready";
  documents: DocumentRecord[];
  activeDocumentId: string | null;
  sourceText: string;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  commentsShowResolved: boolean;
  printConfig: PrintConfig | null;
  theme: "light" | "dark";
  saveState: "saved" | "dirty" | "saving";
  webmcpStatus: WebMcpStatus;
  webmcpError: string | null;
  registeredTools: string[];
  focusTarget: { blockId: string; nonce: number } | null;
  activity: ActivityEvent[];
  undoDepth: number;
  redoDepth: number;

  hydrate: () => Promise<void>;
  createDocument: (template: TemplateId, title: string) => DocumentRecord;
  openDocument: (documentId: string) => void;
  renameDocument: (documentId: string, title: string) => void;
  deleteDocument: (documentId: string) => void;
  setSource: (documentId: string, source: string) => void;
  insertBlocks: (
    documentId: string,
    afterBlockId: string,
    segments: ParsedSegment[],
    author: Author,
  ) => Block[];
  updateBlock: (
    documentId: string,
    blockId: string,
    latex: string,
    mode: "replace" | "append",
    author: Author,
  ) => Block | null;
  deleteBlock: (documentId: string, blockId: string, author: Author) => boolean;
  addComment: (
    documentId: string,
    blockId: string,
    text: string,
    author: Author,
    quote?: string,
  ) => CommentThread | null;
  replyToComment: (
    documentId: string,
    threadId: string,
    text: string,
    author: Author,
  ) => boolean;
  resolveThread: (documentId: string, threadId: string, resolved: boolean, author?: Author) => boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: (open?: boolean) => void;
  toggleInspector: (open?: boolean) => void;
  setCommentsShowResolved: (show: boolean) => void;
  setPrintConfig: (config: PrintConfig | null) => void;
  setTheme: (theme: "light" | "dark") => void;
  focusBlock: (blockId: string) => void;
  undo: () => void;
  redo: () => void;
  undoLastChange: (documentId: string) => {
    undone: boolean;
    author: Author | "none";
    reason?: string;
    blockCountBefore?: number;
    blockCountAfter?: number;
    remainingUndoDepth?: number;
  };
  pushActivity: (event: Omit<ActivityEvent, "id" | "at">) => void;
  dismissActivity: (id: string) => void;
  setWebmcpStatus: (status: WebMcpStatus, error?: string | null) => void;
  setRegisteredTools: (tools: string[]) => void;
}

const HISTORY_LIMIT = 100;
const SOURCE_COALESCE_MS = 1200;
const SAVE_DEBOUNCE_MS = 300;
const SAVE_RETRY_MS = 1500;

const history = new Map<string, { undo: HistoryEntry[]; redo: HistoryEntry[]; lastSourcePush: number }>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function pushHistory(documentId: string, entry: HistoryEntry, coalesce: boolean) {
  const record = history.get(documentId) ?? { undo: [], redo: [], lastSourcePush: 0 };
  record.redo = [];
  const now = Date.now();
  if (coalesce && now - record.lastSourcePush < SOURCE_COALESCE_MS && record.undo.length > 0) {
    record.undo[record.undo.length - 1] = entry;
  } else {
    record.undo.push(entry);
    if (record.undo.length > HISTORY_LIMIT) record.undo.shift();
  }
  record.lastSourcePush = coalesce ? now : 0;
  history.set(documentId, record);
}

function persistDocument(document: DocumentRecord, retry = true): Promise<void> {
  useWorkspace.setState({ saveState: "saving" });
  return documentRepository.put(document).then(() => {
    if (!saveTimers.has(document.id)) useWorkspace.setState({ saveState: "saved" });
  }).catch(() => {
    if (retry) {
      saveTimers.set(
        document.id,
        setTimeout(() => {
          saveTimers.delete(document.id);
          void persistDocument(document, false);
        }, SAVE_RETRY_MS),
      );
      return;
    }
    useWorkspace.setState({ saveState: "dirty" });
  });
}

function scheduleSave(document: DocumentRecord) {
  const existing = saveTimers.get(document.id);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    document.id,
    setTimeout(() => {
      saveTimers.delete(document.id);
      void persistDocument(document);
    }, SAVE_DEBOUNCE_MS),
  );
}

export function flushPendingSaves(): Promise<void> {
  const pending: Array<Promise<void>> = [];
  for (const [id, timer] of saveTimers) {
    clearTimeout(timer);
    saveTimers.delete(id);
    const doc = useWorkspace.getState().documents.find((d) => d.id === id);
    if (doc) pending.push(documentRepository.put(doc));
  }
  return Promise.all(pending).then(() => undefined);
}

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("lemma.theme", theme);
  } catch {
    /* storage unavailable */
  }
}

export const useWorkspace = create<WorkspaceState>()((set, get) => {
  function activeDoc(): DocumentRecord | null {
    const { documents, activeDocumentId } = get();
    return documents.find((d) => d.id === activeDocumentId) ?? null;
  }

  function commit(
    documentId: string,
    mutator: (doc: DocumentRecord) => void,
    options: { history?: "push" | "coalesce" | "none"; author?: Author } = { history: "push" },
  ): DocumentRecord | null {
    const { documents, activeDocumentId } = get();
    const index = documents.findIndex((d) => d.id === documentId);
    if (index === -1) return null;
    const current = documents[index];

    if (options.history !== "none") {
      pushHistory(
        documentId,
        {
          blocks: current.blocks,
          threads: current.threads,
          title: current.title,
          sourceText: current.id === activeDocumentId ? get().sourceText : serializeBlocks(current.blocks),
          author: options.author ?? "user",
        },
        options.history === "coalesce",
      );
    }

    const draft: DocumentRecord = {
      ...current,
      blocks: [...current.blocks],
      threads: current.threads.map((t) => ({ ...t, comments: [...t.comments] })),
    };
    mutator(draft);
    draft.updatedAt = Date.now();

    const nextDocuments = [...documents];
    nextDocuments[index] = draft;
    set({ documents: nextDocuments, saveState: "dirty" });
    scheduleSave(draft);

    if (documentId === activeDocumentId) {
      set({ sourceText: serializeBlocks(draft.blocks) });
    }
    const record = history.get(documentId);
    set({ undoDepth: record?.undo.length ?? 0, redoDepth: record?.redo.length ?? 0 });
    return draft;
  }

  return {
    status: "loading",
    documents: [],
    activeDocumentId: null,
    sourceText: "",
    viewMode: "split",
    sidebarOpen: false,
    inspectorOpen: false,
    commentsShowResolved: true,
    printConfig: null,
    theme: "light",
    saveState: "saved",
    webmcpStatus: "unavailable",
    webmcpError: null,
    registeredTools: [],
    focusTarget: null,
    activity: [],
    undoDepth: 0,
    redoDepth: 0,

    hydrate: async () => {
      let documents = await documentRepository.list();
      if (documents.length === 0) {
        const seed = createSeedDocument();
        await documentRepository.put(seed);
        documents = [seed];
      }
      const storedActive = await metaRepository.get<string>("activeDocument");
      const activeId =
        storedActive && documents.some((d) => d.id === storedActive)
          ? storedActive
          : documents[0]?.id ?? null;
      const active = documents.find((d) => d.id === activeId) ?? null;
      const storedTheme = await metaRepository.get<"light" | "dark">("theme");
      const theme = storedTheme ?? "light";
      let commentsShowResolved = true;
      try {
        commentsShowResolved = localStorage.getItem("lemma.showResolved") !== "0";
      } catch {
        /* storage unavailable */
      }
      applyTheme(theme);
      set({
        status: "ready",
        documents,
        activeDocumentId: activeId,
        sourceText: active ? serializeBlocks(active.blocks) : "",
        theme,
        commentsShowResolved,
      });
    },

    createDocument: (template, title) => {
      const doc = createDocumentFromTemplate(template, title);
      set({ documents: [doc, ...get().documents] });
      scheduleSave(doc);
      set({ activeDocumentId: doc.id, sourceText: serializeBlocks(doc.blocks) });
      void metaRepository.set("activeDocument", doc.id);
      return doc;
    },

    openDocument: (documentId) => {
      const doc = get().documents.find((d) => d.id === documentId);
      if (!doc) return;
      set({
        activeDocumentId: documentId,
        sourceText: serializeBlocks(doc.blocks),
        undoDepth: history.get(documentId)?.undo.length ?? 0,
        redoDepth: history.get(documentId)?.redo.length ?? 0,
      });
      void metaRepository.set("activeDocument", documentId);
    },

    renameDocument: (documentId, title) => {
      commit(documentId, (doc) => {
        doc.title = title;
      }, { history: "none" });
    },

    deleteDocument: (documentId) => {
      const { documents, activeDocumentId } = get();
      const remaining = documents.filter((d) => d.id !== documentId);
      history.delete(documentId);
      void documentRepository.remove(documentId);
      const nextActive =
        activeDocumentId === documentId ? remaining[0]?.id ?? null : activeDocumentId;
      const active = remaining.find((d) => d.id === nextActive) ?? null;
      set({
        documents: remaining,
        activeDocumentId: nextActive,
        sourceText: active ? serializeBlocks(active.blocks) : "",
        activity: get().activity.filter((a) => a.documentId !== documentId),
      });
      if (nextActive) void metaRepository.set("activeDocument", nextActive);
    },

    setSource: (documentId, source) => {
      const { activeDocumentId, sourceText } = get();
      if (documentId !== activeDocumentId || source === sourceText) return;
      const current = activeDoc();
      if (!current) return;

      const segments = parseSource(source);
      const blocks = reconcileBlocks(current.blocks, segments);

      const record = history.get(documentId) ?? { undo: [], redo: [], lastSourcePush: 0 };
      const now = Date.now();
      record.redo = [];
      const entry: HistoryEntry = {
        blocks: current.blocks,
        threads: current.threads,
        title: current.title,
        sourceText: get().sourceText,
        author: "user",
      };
      if (now - record.lastSourcePush < SOURCE_COALESCE_MS && record.undo.length > 0) {
        record.undo[record.undo.length - 1] = entry;
      } else {
        record.undo.push(entry);
        if (record.undo.length > HISTORY_LIMIT) record.undo.shift();
      }
      record.lastSourcePush = now;
      history.set(documentId, record);

      const index = get().documents.findIndex((d) => d.id === documentId);
      if (index !== -1) {
        const draft: DocumentRecord = { ...get().documents[index], blocks, updatedAt: Date.now() };
        const nextDocuments = [...get().documents];
        nextDocuments[index] = draft;
        set({ documents: nextDocuments, sourceText: source, saveState: "dirty" });
        scheduleSave(draft);
      } else {
        set({ sourceText: source });
      }
      set({ undoDepth: record.undo.length, redoDepth: record.redo.length });
    },

    insertBlocks: (documentId, afterBlockId, segments, author) => {
      const now = Date.now();
      const newBlocks = segmentsToBlocks(
        segments.map((s) => ({ ...s, latex: s.latex.trim() })),
        now,
      ).map((block) => ({ ...block, lastEditedBy: author, lastEditedAt: now }));

      const result = commit(documentId, (doc) => {
        const anchorIndex = doc.blocks.findIndex((b) => b.id === afterBlockId);
        if (afterBlockId !== "start" && anchorIndex === -1) return;
        const insertAt = afterBlockId === "start" ? 0 : anchorIndex + 1;
        doc.blocks.splice(insertAt, 0, ...newBlocks);
      }, { author });
      return result ? newBlocks : [];
    },

    updateBlock: (documentId, blockId, latex, mode, author) => {
      const now = Date.now();
      let updated: Block | null = null;
      commit(documentId, (doc) => {
        const index = doc.blocks.findIndex((b) => b.id === blockId);
        if (index === -1) return;
        const block = doc.blocks[index];
        const nextLatex = mode === "append" ? block.latex + "\n" + latex.trim() : latex.trim();
        updated = {
          ...block,
          latex: nextLatex,
          type: deriveBlockType(nextLatex, block.type),
          lastEditedBy: author,
          lastEditedAt: now,
        };
        doc.blocks[index] = updated;
      }, { author });
      return updated;
    },

    deleteBlock: (documentId, blockId, author) => {
      let removed = false;
      commit(documentId, (doc) => {
        const index = doc.blocks.findIndex((b) => b.id === blockId);
        if (index === -1) return;
        removed = true;
        doc.blocks.splice(index, 1);
        doc.threads = doc.threads.filter((t) => t.blockId !== blockId);
      }, { author });
      return removed;
    },

    addComment: (documentId, blockId, text, author, quote) => {
      const now = Date.now();
      let thread: CommentThread | null = null;
      commit(documentId, (doc) => {
        if (!doc.blocks.some((b) => b.id === blockId)) return;
        thread = {
          id: createId("cmt"),
          blockId,
          quote,
          resolved: false,
          comments: [{ id: createId("cmt"), author, text, createdAt: now }],
        };
        doc.threads.push(thread);
      }, { author });
      return thread;
    },

    replyToComment: (documentId, threadId, text, author) => {
      const now = Date.now();
      let replied = false;
      commit(documentId, (doc) => {
        const thread = doc.threads.find((t) => t.id === threadId);
        if (!thread) return;
        thread.comments.push({ id: createId("cmt"), author, text, createdAt: now });
        replied = true;
      }, { author });
      return replied;
    },

    resolveThread: (documentId, threadId, resolved, author = "user") => {
      let resolvedOk = false;
      commit(documentId, (doc) => {
        const thread = doc.threads.find((t) => t.id === threadId);
        if (!thread) return;
        thread.resolved = resolved;
        thread.resolvedAt = resolved ? Date.now() : undefined;
        resolvedOk = true;
      }, { author });
      return resolvedOk;
    },

    setViewMode: (mode) => set({ viewMode: mode }),

    toggleSidebar: (open) =>
      set((state) => ({ sidebarOpen: open ?? !state.sidebarOpen })),

    toggleInspector: (open) =>
      set((state) => ({ inspectorOpen: open ?? !state.inspectorOpen })),

    setCommentsShowResolved: (show) => {
      set({ commentsShowResolved: show });
      try {
        localStorage.setItem("lemma.showResolved", show ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
    },

    setPrintConfig: (printConfig) => set({ printConfig }),

    setTheme: (theme) => {
      applyTheme(theme);
      set({ theme });
      void metaRepository.set("theme", theme);
    },

    focusBlock: (blockId) =>
      set((state) => ({
        focusTarget: { blockId, nonce: (state.focusTarget?.nonce ?? 0) + 1 },
      })),

    undo: () => {
      const doc = activeDoc();
      if (!doc) return;
      const record = history.get(doc.id);
      if (!record || record.undo.length === 0) return;
      const entry = record.undo.pop()!;
      record.redo.push({
        blocks: doc.blocks,
        threads: doc.threads,
        title: doc.title,
        sourceText: get().sourceText,
        author: entry.author,
      });
      record.lastSourcePush = 0;
      set({ undoDepth: record.undo.length, redoDepth: record.redo.length });
      const index = get().documents.findIndex((d) => d.id === doc.id);
      const draft: DocumentRecord = {
        ...doc,
        blocks: entry.blocks,
        threads: entry.threads,
        title: entry.title,
        updatedAt: Date.now(),
      };
      const nextDocuments = [...get().documents];
      nextDocuments[index] = draft;
      set({
        documents: nextDocuments,
        sourceText: entry.sourceText,
        saveState: "dirty",
      });
      scheduleSave(draft);
    },

    redo: () => {
      const doc = activeDoc();
      if (!doc) return;
      const record = history.get(doc.id);
      if (!record || record.redo.length === 0) return;
      const entry = record.redo.pop()!;
      record.undo.push({
        blocks: doc.blocks,
        threads: doc.threads,
        title: doc.title,
        sourceText: get().sourceText,
        author: entry.author,
      });
      set({ undoDepth: record.undo.length, redoDepth: record.redo.length });
      const index = get().documents.findIndex((d) => d.id === doc.id);
      const draft: DocumentRecord = {
        ...doc,
        blocks: entry.blocks,
        threads: entry.threads,
        title: entry.title,
        updatedAt: Date.now(),
      };
      const nextDocuments = [...get().documents];
      nextDocuments[index] = draft;
      set({
        documents: nextDocuments,
        sourceText: entry.sourceText,
        saveState: "dirty",
      });
      scheduleSave(draft);
    },

    undoLastChange: (documentId) => {
      const record = history.get(documentId);
      if (!record || record.undo.length === 0) {
        return { undone: false, author: "none" as const, reason: "There is nothing to undo in this document." };
      }
      const latest = record.undo[record.undo.length - 1];
      if (latest.author === "user") {
        return {
          undone: false,
          author: "user" as const,
          reason:
            "The most recent change was typed by the user, so undoing would revert their work. Ask them to press Cmd/Ctrl+Z instead.",
          remainingUndoDepth: record.undo.length,
        };
      }
      const before = get().documents.find((d) => d.id === documentId)?.blocks.length ?? 0;
      if (get().activeDocumentId !== documentId) get().openDocument(documentId);
      get().undo();
      const after = get().documents.find((d) => d.id === documentId)?.blocks.length ?? 0;
      return {
        undone: true,
        author: "agent" as const,
        blockCountBefore: before,
        blockCountAfter: after,
        remainingUndoDepth: history.get(documentId)?.undo.length ?? 0,
      };
    },

    pushActivity: (event) =>
      set((state) => ({
        activity: [...state.activity, { ...event, id: createId("act"), at: Date.now() }].slice(-6),
      })),

    dismissActivity: (id) =>
      set((state) => ({ activity: state.activity.filter((a) => a.id !== id) })),

    setWebmcpStatus: (status, error = null) =>
      set({ webmcpStatus: status, webmcpError: error }),

    setRegisteredTools: (tools) => set({ registeredTools: tools }),
  };
});

export function activeDocument(state: Pick<WorkspaceState, "documents" | "activeDocumentId">) {
  return state.documents.find((d) => d.id === state.activeDocumentId) ?? null;
}
