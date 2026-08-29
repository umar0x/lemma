import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace } from "./workspace";
import type { ParsedSegment } from "@/core/blocks/types";

vi.mock("@/core/storage/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/storage/db")>();
  const store = new Map<string, unknown>();
  return {
    ...actual,
    documentRepository: {
      list: async () => [...store.values()].sort((a, b) => (b as { updatedAt: number }).updatedAt - (a as { updatedAt: number }).updatedAt),
      get: async (id: string) => store.get(id),
      put: async (doc: unknown) => void store.set((doc as { id: string }).id, doc),
      remove: async (id: string) => void store.delete(id),
    },
    metaRepository: {
      get: async (key: string) => (key === "activeDocument" ? store.get("__active") : undefined),
      set: async (key: string, value: unknown) => void store.set(key === "activeDocument" ? "__active" : `__${key}`, value),
    },
  };
});

function reset() {
  useWorkspace.setState({
    status: "loading",
    documents: [],
    activeDocumentId: null,
    sourceText: "",
    viewMode: "split",
    activity: [],
    undoDepth: 0,
    redoDepth: 0,
    focusTarget: null,
  });
}

function text(latex: string): ParsedSegment {
  return { type: "text", latex };
}

describe("workspace store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    reset();
  });

  it("creates a document and makes it active", () => {
    const { createDocument } = useWorkspace.getState();
    const doc = createDocument("blank", "Scratch pad");
    const state = useWorkspace.getState();
    expect(state.activeDocumentId).toBe(doc.id);
    expect(state.documents).toHaveLength(1);
    expect(doc.blocks.length).toBeGreaterThan(0);
  });

  it("tracks block edits through setSource with stable ids", () => {
    const store = useWorkspace.getState();
    const doc = store.createDocument("blank", "Editing flow");
    useWorkspace.getState().setSource(doc.id, "First edit");
    const idAfterFirst = useWorkspace.getState().documents[0].blocks[0].id;

    useWorkspace.getState().setSource(doc.id, "First edit and more");
    const blocks = useWorkspace.getState().documents[0].blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe(idAfterFirst);
    expect(blocks[0].latex).toBe("First edit and more");
  });

  it("supports undo and redo of source edits", () => {
    const { createDocument, setSource, undo, redo } = useWorkspace.getState();
    const doc = createDocument("blank", "Undo flow");
    setSource(doc.id, "State one");
    setSource(doc.id, "State two");
    undo();
    expect(useWorkspace.getState().sourceText).toBe("State one");
    redo();
    expect(useWorkspace.getState().sourceText).toBe("State two");
  });

  it("inserts blocks after an anchor block", () => {
    const { createDocument, insertBlocks } = useWorkspace.getState();
    const doc = createDocument("blank", "Insert flow");
    const blocks = useWorkspace.getState().documents[0].blocks;
    const inserted = insertBlocks(doc.id, blocks[0].id, [text("Inserted paragraph")], "agent");
    const after = useWorkspace.getState().documents[0].blocks;
    expect(after).toHaveLength(blocks.length + 1);
    expect(after[1].id).toBe(inserted[0].id);
    expect(after[1].lastEditedBy).toBe("agent");
    expect(after[1].latex).toBe("Inserted paragraph");
  });

  it("inserts at the start with the start anchor", () => {
    const { createDocument, insertBlocks } = useWorkspace.getState();
    const doc = createDocument("blank", "Start anchor");
    insertBlocks(doc.id, "start", [text("At the top")], "agent");
    const after = useWorkspace.getState().documents[0].blocks;
    expect(after[0].latex).toBe("At the top");
  });

  it("updates a block by id preserving identity", () => {
    const { createDocument, insertBlocks, updateBlock } = useWorkspace.getState();
    const doc = createDocument("blank", "Update flow");
    const [inserted] = insertBlocks(doc.id, "start", [text("Original text")], "agent");
    const updated = updateBlock(doc.id, inserted.id, "Replaced text", "replace", "agent");
    expect(updated?.id).toBe(inserted.id);
    expect(updated?.latex).toBe("Replaced text");
  });

  it("appends to a block when mode is append", () => {
    const { createDocument, insertBlocks, updateBlock } = useWorkspace.getState();
    const doc = createDocument("blank", "Append flow");
    const [inserted] = insertBlocks(doc.id, "start", [text("Base")], "agent");
    const updated = updateBlock(doc.id, inserted.id, "Added", "append", "agent");
    expect(updated?.latex).toBe("Base\nAdded");
  });

  it("reclassifies block type when latex changes form", () => {
    const { createDocument, insertBlocks, updateBlock } = useWorkspace.getState();
    const doc = createDocument("blank", "Type flow");
    const [inserted] = insertBlocks(doc.id, "start", [text("plain")], "user");
    const updated = updateBlock(doc.id, inserted.id, "\\[ x^2 \\]", "replace", "user");
    expect(updated?.type).toBe("equation");
  });

  it("deletes blocks and their comment threads", () => {
    const { createDocument, insertBlocks, addComment, deleteBlock } = useWorkspace.getState();
    const doc = createDocument("blank", "Delete flow");
    const [inserted] = insertBlocks(doc.id, "start", [text("Doomed")], "user");
    addComment(doc.id, inserted.id, "Note", "agent");
    expect(useWorkspace.getState().documents[0].threads).toHaveLength(1);
    deleteBlock(doc.id, inserted.id, "user");
    const after = useWorkspace.getState().documents[0];
    expect(after.blocks.some((b) => b.id === inserted.id)).toBe(false);
    expect(after.threads).toHaveLength(0);
  });

  it("manages comment threads: add, reply, resolve", () => {
    const { createDocument, insertBlocks, addComment, replyToComment, resolveThread } =
      useWorkspace.getState();
    const doc = createDocument("blank", "Comment flow");
    const [inserted] = insertBlocks(doc.id, "start", [text("Anchored")], "user");

    const thread = addComment(doc.id, inserted.id, "Why this step?", "user", "Anchored");
    expect(thread?.quote).toBe("Anchored");

    replyToComment(doc.id, thread!.id, "Because of the chain rule.", "agent");
    resolveThread(doc.id, thread!.id, true);

    const after = useWorkspace.getState().documents[0];
    expect(after.threads[0].comments.map((c) => c.author)).toEqual(["user", "agent"]);
    expect(after.threads[0].resolved).toBe(true);
  });

  it("undo reverts an agent block insertion", () => {
    const { createDocument, insertBlocks, undo } = useWorkspace.getState();
    const doc = createDocument("blank", "Agent undo");
    const before = useWorkspace.getState().documents[0].blocks;
    insertBlocks(doc.id, "start", [text("Agent content")], "agent");
    expect(useWorkspace.getState().documents[0].blocks).toHaveLength(before.length + 1);
    undo();
    expect(useWorkspace.getState().documents[0].blocks.map((b) => b.latex)).toEqual(
      before.map((b) => b.latex),
    );
  });

  it("deletes documents and selects the next one", () => {
    const { createDocument, deleteDocument } = useWorkspace.getState();
    const first = createDocument("blank", "First");
    const second = createDocument("blank", "Second");
    deleteDocument(second.id);
    const state = useWorkspace.getState();
    expect(state.documents.map((d) => d.id)).toEqual([first.id]);
    expect(state.activeDocumentId).toBe(first.id);
  });

  it("focuses blocks with incrementing nonces", () => {
    const { focusBlock } = useWorkspace.getState();
    focusBlock("blk_a");
    focusBlock("blk_a");
    expect(useWorkspace.getState().focusTarget).toEqual({ blockId: "blk_a", nonce: 2 });
  });

  it("hydrates from storage", async () => {
    const { createDocument, hydrate } = useWorkspace.getState();
    const doc = createDocument("blank", "Persisted");
    vi.advanceTimersByTime(500);
    reset();
    await hydrate();
    const state = useWorkspace.getState();
    expect(state.status).toBe("ready");
    expect(state.documents.some((d) => d.id === doc.id)).toBe(true);
    expect(state.activeDocumentId).toBe(doc.id);
    expect(state.sourceText.length).toBeGreaterThan(0);
  });

  it("pushes dismissible activity events", () => {
    const { pushActivity, dismissActivity } = useWorkspace.getState();
    pushActivity({ kind: "insert", message: "Agent inserted 2 blocks", undoable: true });
    const [event] = useWorkspace.getState().activity;
    expect(event.message).toBe("Agent inserted 2 blocks");
    dismissActivity(event.id);
    expect(useWorkspace.getState().activity).toHaveLength(0);
  });
});
