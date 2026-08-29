import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace } from "@/state/workspace";
import { createWebMcpTools, WEBMCP_TOOL_NAMES, type WebMcpToolDefinition } from "./tools";
import { renderDocumentCached } from "@/core/latex/renderCache";
import { createSeedDocument } from "@/core/templates/seed";

import type { DocumentRecord } from "@/core/blocks/types";

vi.mock("@/core/storage/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/storage/db")>();
  return {
    ...actual,
    documentRepository: {
      list: async () => [],
      get: async () => undefined,
      put: async () => {},
      remove: async () => {},
    },
    metaRepository: {
      get: async () => undefined,
      set: async () => {},
    },
  };
});

const noSignal = new AbortController().signal;
const downloadSpy = vi.fn();

function setup(): WebMcpToolDefinition[] {
  const store = useWorkspace;
  return createWebMcpTools(store, { triggerDownload: downloadSpy });
}

function byName(tools: WebMcpToolDefinition[], name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

async function run(tools: WebMcpToolDefinition[], name: string, input: Record<string, unknown>) {
  const tool = byName(tools, name);
  return tool.execute(input, noSignal) as Promise<Record<string, unknown>>;
}

function seedWorkspace(): DocumentRecord {
  const seed = createSeedDocument(Date.now());
  useWorkspace.setState({
    status: "ready",
    documents: [seed],
    activeDocumentId: seed.id,
    sourceText: seed.blocks.map((b) => b.latex).join("\n\n"),
  });
  return seed;
}

describe("webmcp tool definitions", () => {
  it("exposes 15 tools with unique names", () => {
    const tools = setup();
    expect(tools).toHaveLength(15);
    expect(new Set(tools.map((t) => t.name)).size).toBe(15);
    expect(tools.map((t) => t.name)).toEqual([...WEBMCP_TOOL_NAMES]);
  });

  it("keeps every description within the security budget", () => {
    for (const tool of setup()) {
      expect(tool.description.length).toBeLessThanOrEqual(500);
      expect(tool.title.length).toBeGreaterThan(0);
      const schema = tool.inputSchema as {
        properties?: Record<string, { description?: string }>;
      };
      for (const property of Object.values(schema.properties ?? {})) {
        if (property.description) {
          expect(property.description.length).toBeLessThanOrEqual(150);
        }
      }
    }
  });

  it("annotates read-only tools correctly", () => {
    const tools = setup();
    for (const name of ["list_documents", "get_document", "get_render_errors"]) {
      const tool = byName(tools, name);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.untrustedContentHint).toBe(true);
    }
    const write = byName(tools, "insert_blocks");
    expect(write.annotations?.readOnlyHint ?? false).toBe(false);
  });
});

describe("list_documents", () => {
  beforeEach(() => {
    useWorkspace.setState({ documents: [], activeDocumentId: null, activity: [] });
  });

  it("lists documents with error counts", async () => {
    const seed = seedWorkspace();
    const tools = setup();
    const result = await run(tools, "list_documents", {});
    const documents = result.documents as Array<Record<string, unknown>>;
    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe(seed.id);
    expect(documents[0].errorCount).toBe(1);
    expect(documents[0].title).toBe(seed.title);
  });

  it("filters by query", async () => {
    seedWorkspace();
    const tools = setup();
    const result = await run(tools, "list_documents", { query: "nonexistent-topic" });
    expect(result.total).toBe(0);
  });
});

describe("get_document", () => {
  beforeEach(() => seedWorkspace());

  it("returns block structure with ids and render status", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const result = await run(tools, "get_document", { documentId: doc.id });
    const blocks = result.blocks as Array<Record<string, unknown>>;
    expect(blocks.length).toBe(doc.blocks.length);
    const errorBlock = blocks.find((b) => b.renderStatus === "error");
    expect(errorBlock?.error).toContain("\\alpa");
    expect(errorBlock?.suggestion).toBe("\\alpha");
  });

  it("includes comment threads by default and can omit them", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const withThreads = await run(tools, "get_document", { documentId: doc.id });
    expect(withThreads.threads).toBeDefined();
    const without = await run(tools, "get_document", {
      documentId: doc.id,
      includeComments: false,
    });
    expect(without.threads).toBeUndefined();
  });

  it("returns an actionable error for unknown documents", async () => {
    const tools = setup();
    const result = await run(tools, "get_document", { documentId: "doc_missing" });
    expect(result.error).toContain("not found");
    expect(result.hint).toContain("list_documents");
  });
});

describe("get_render_errors", () => {
  beforeEach(() => seedWorkspace());

  it("reports errors with position, context, and fix guidance", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const result = await run(tools, "get_render_errors", { documentId: doc.id });
    expect(result.totalErrors).toBe(1);
    const [error] = result.errors as Array<Record<string, unknown>>;
    expect(error.blockType).toBe("align");
    expect(error.message).toContain("\\alpa");
    expect(error.suggestion).toBe("\\alpha");
    expect(error.position).toBeTypeOf("number");
    expect(error.context).toContain("align");
    expect(error.fix).toContain("update_block");
  });

  it("scopes to a single block when requested", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const goodBlock = doc.blocks.find((b) => b.type === "theorem")!;
    const result = await run(tools, "get_render_errors", {
      documentId: doc.id,
      blockId: goodBlock.id,
    });
    expect(result.totalErrors).toBe(0);
  });
});

describe("create_document", () => {
  beforeEach(() => {
    useWorkspace.setState({ documents: [], activeDocumentId: null, activity: [] });
  });

  it("creates a templated document and makes it active", async () => {
    const tools = setup();
    const result = await run(tools, "create_document", {
      title: "Homework 3",
      template: "problem_set",
    });
    const state = useWorkspace.getState();
    expect(state.activeDocumentId).toBe(result.documentId);
    expect(state.documents[0].title).toBe("Homework 3");
    expect(state.documents[0].blocks.length).toBeGreaterThan(1);
  });

  it("seeds initial blocks when provided", async () => {
    const tools = setup();
    const result = await run(tools, "create_document", {
      title: "Quick note",
      template: "blank",
      initialBlocks: [{ type: "equation", latex: "\\[ a^2 + b^2 = c^2 \\]" }],
    });
    expect(result.blockIds).toHaveLength(1);
    const doc = useWorkspace.getState().documents.find((d) => d.id === result.documentId)!;
    expect(doc.blocks.some((b) => b.latex.includes("c^2"))).toBe(true);
  });

  it("rejects unknown templates with a hint", async () => {
    const tools = setup();
    const result = await run(tools, "create_document", { title: "X", template: "resume" });
    expect(result.error).toContain("Unknown template");
    expect(result.hint).toContain("problem_set");
  });
});

describe("insert_blocks and the self-correction loop", () => {
  beforeEach(() => seedWorkspace());

  it("inserts valid blocks and reports render status", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const anchor = doc.blocks[0].id;
    const result = await run(tools, "insert_blocks", {
      documentId: doc.id,
      afterBlockId: anchor,
      blocks: [{ type: "equation", latex: "\\[ \\sum_{k=0}^{\\infty} \\frac{1}{2^k} = 2 \\]" }],
    });
    const statuses = result.renderStatuses as Array<Record<string, unknown>>;
    expect(statuses[0].status).toBe("ok");
    const inserted = useWorkspace.getState().documents[0].blocks.find(
      (b) => b.id === (result.blockIds as string[])[0],
    );
    expect(inserted?.lastEditedBy).toBe("agent");
  });

  it("flags its own mistakes in the response and enables self-correction", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const insert = await run(tools, "insert_blocks", {
      documentId: doc.id,
      afterBlockId: "start",
      blocks: [
        {
          type: "align",
          latex: "\\begin{align}\\int_0^1 \\alpa(x)\\,dx &= \\frac{1}{2}\\end{align}",
        },
      ],
    });
    const statuses = insert.renderStatuses as Array<Record<string, unknown>>;
    expect(statuses[0].status).toBe("error");
    expect(insert.hint).toContain("get_render_errors");

    const errors = await run(tools, "get_render_errors", { documentId: doc.id });
    expect(errors.totalErrors).toBe(2);

    const blockId = (insert.blockIds as string[])[0];
    const fix = await run(tools, "update_block", {
      documentId: doc.id,
      blockId,
      latex: "\\begin{align}\\int_0^1 \\alpha(x)\\,dx &= \\frac{1}{2}\\end{align}",
    });
    expect(fix.renderStatus).toBe("ok");

    const after = await run(tools, "get_render_errors", { documentId: doc.id });
    expect(after.totalErrors).toBe(1);
  });

  it("rejects malformed block payloads with guidance", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const result = await run(tools, "insert_blocks", {
      documentId: doc.id,
      afterBlockId: "start",
      blocks: [{ type: "equation" }],
    });
    expect(result.error).toContain("malformed");
  });

  it("rejects unknown anchors", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const result = await run(tools, "insert_blocks", {
      documentId: doc.id,
      afterBlockId: "blk_missing",
      blocks: [{ type: "text", latex: "hello" }],
    });
    expect(result.error).toContain("not found");
  });
});

describe("update_block", () => {
  beforeEach(() => seedWorkspace());

  it("appends content when mode is append", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const target = doc.blocks.find((b) => b.type === "text" && b.latex.includes("live"))!;
    const result = await run(tools, "update_block", {
      documentId: doc.id,
      blockId: target.id,
      latex: "Appended by agent.",
      mode: "append",
    });
    const updated = useWorkspace
      .getState()
      .documents[0].blocks.find((b) => b.id === target.id)!;
    expect(updated.latex).toContain("Appended by agent.");
    expect(updated.latex).toContain("live");
    expect(result.renderStatus).toBe("ok");
  });

  it("validates empty latex", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const result = await run(tools, "update_block", {
      documentId: doc.id,
      blockId: doc.blocks[0].id,
      latex: "   ",
    });
    expect(result.error).toContain("non-empty");
  });
});

describe("comment tools", () => {
  beforeEach(() => seedWorkspace());

  it("adds, replies, and resolves through the tool surface", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const target = doc.blocks.find((b) => b.type === "text")!;

    const added = await run(tools, "add_comment", {
      documentId: doc.id,
      blockId: target.id,
      text: "Consider $u$-substitution instead.",
      quote: "integration by parts",
    });
    expect(added.threadId).toBeDefined();

    const replied = await run(tools, "reply_to_comment", {
      documentId: doc.id,
      threadId: added.threadId as string,
      text: "Yes, $u = e^x$ works too.",
    });
    expect(replied.replyCount).toBe(2);

    const resolved = await run(tools, "resolve_comment", {
      documentId: doc.id,
      threadId: added.threadId as string,
    });
    expect(resolved.resolved).toBe(true);

    const thread = useWorkspace
      .getState()
      .documents[0].threads.find((t) => t.id === added.threadId)!;
    expect(thread.resolved).toBe(true);
    expect(thread.comments.map((c) => c.author)).toEqual(["agent", "agent"]);
  });

  it("rejects comments on unknown blocks", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const result = await run(tools, "add_comment", {
      documentId: doc.id,
      blockId: "blk_missing",
      text: "hello",
    });
    expect(result.error).toContain("not found");
  });
});

describe("set_view", () => {
  beforeEach(() => seedWorkspace());

  it("changes the view mode and focuses a block", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const target = doc.blocks[1];
    const result = await run(tools, "set_view", {
      documentId: doc.id,
      mode: "preview",
      scrollToBlockId: target.id,
    });
    expect(result.mode).toBe("preview");
    expect(useWorkspace.getState().viewMode).toBe("preview");
    expect(useWorkspace.getState().focusTarget?.blockId).toBe(target.id);
  });

  it("rejects invalid modes", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const result = await run(tools, "set_view", { documentId: doc.id, mode: "vr" });
    expect(result.error).toContain("Invalid mode");
  });
});

describe("export_document", () => {
  beforeEach(() => {
    downloadSpy.mockClear();
    seedWorkspace();
  });

  it("downloads a compilable .tex file", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const result = await run(tools, "export_document", { documentId: doc.id });
    expect(result.format).toBe("tex");
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadSpy.mock.calls[0];
    expect(filename).toMatch(/\.tex$/);
    expect(content).toContain("\\documentclass");
    expect(content).toContain("\\newtheorem");
  });
});

describe("abort signal handling", () => {
  beforeEach(() => seedWorkspace());

  it("returns an error when execution is aborted", async () => {
    const tools = setup();
    const [doc] = useWorkspace.getState().documents;
    const controller = new AbortController();
    controller.abort();
    const result = (await byName(tools, "get_document").execute(
      { documentId: doc.id },
      controller.signal,
    )) as Record<string, unknown>;
    expect(result.error).toContain("aborted");
  });
});

describe("activity reporting", () => {
  beforeEach(() => {
    useWorkspace.setState({ documents: [], activeDocumentId: null, activity: [] });
  });

  it("pushes undoable activity events for agent edits", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", { title: "Activity", template: "blank" });
    const documentId = created.documentId as string;
    await run(tools, "insert_blocks", {
      documentId,
      afterBlockId: "start",
      blocks: [{ type: "text", latex: "Hello" }],
    });
    const activity = useWorkspace.getState().activity;
    expect(activity.some((a) => a.kind === "create")).toBe(true);
    expect(activity.some((a) => a.kind === "insert" && a.undoable)).toBe(true);
  });
});

describe("get_document_outline", () => {
  beforeEach(() => {
    useWorkspace.setState({ documents: [], activeDocumentId: null, activity: [] });
  });

  it("returns headings, theorems, and labeled equations with block IDs", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", {
      title: "Outline demo",
      template: "blank",
      initialBlocks: [
        { type: "text", latex: "\\section{Methods}" },
        { type: "equation", latex: "\\begin{equation}\\label{eq:a}x\\end{equation}" },
        { type: "theorem", latex: "\\begin{lemma}[Key]Statement.\\end{lemma}" },
      ],
    });
    const documentId = created.documentId as string;
    const outline = await run(tools, "get_document_outline", { documentId });
    const entries = outline.entries as Array<Record<string, unknown>>;
    expect(entries.find((e) => e.kind === "heading")?.title).toBe("Methods");
    const equation = entries.find((e) => e.kind === "equation");
    expect(equation?.number).toBe(1);
    expect(equation?.labels).toEqual(["eq:a"]);
    const theorem = entries.find((e) => e.kind === "theorem");
    expect(theorem?.theoremKind).toBe("lemma");
    expect(theorem?.title).toBe("Key");
    expect(typeof theorem?.blockId).toBe("string");
  });

  it("rejects unknown documents with a hint", async () => {
    const tools = setup();
    const result = await run(tools, "get_document_outline", { documentId: "doc_missing" });
    expect(result.error).toContain("not found");
    expect(result.hint).toContain("list_documents");
  });
});

describe("search_documents", () => {
  beforeEach(() => {
    seedWorkspace();
  });

  it("finds matching blocks with context and IDs", async () => {
    const tools = setup();
    const result = await run(tools, "search_documents", { query: "integration by parts" });
    expect(result.totalMatches).toBeGreaterThan(0);
    const matches = result.matches as Array<Record<string, unknown>>;
    const blockMatch = matches.find((m) => m.blockId);
    expect(blockMatch).toBeTruthy();
    expect(String(blockMatch!.context).toLowerCase()).toContain("integration");
  });

  it("is case-insensitive on LaTeX commands", async () => {
    const tools = setup();
    const result = await run(tools, "search_documents", { query: "\\EQREF" });
    expect((result.matches as unknown[]).length).toBeGreaterThan(0);
  });

  it("matches document titles", async () => {
    const tools = setup();
    const result = await run(tools, "search_documents", { query: "live demo" });
    const matches = result.matches as Array<Record<string, unknown>>;
    expect(matches.some((m) => m.matched === "title")).toBe(true);
  });

  it("rejects empty queries", async () => {
    const tools = setup();
    const result = await run(tools, "search_documents", { query: "   " });
    expect(result.error).toContain("query");
  });

  it("rejects unknown scope documents with a hint", async () => {
    const tools = setup();
    const result = await run(tools, "search_documents", { query: "foo", documentId: "nope" });
    expect(result.error).toContain("not found");
    expect(result.hint).toContain("list_documents");
  });

  it("returns zero matches for absent text", async () => {
    const tools = setup();
    const result = await run(tools, "search_documents", { query: "zzz-not-present-zzz" });
    expect(result.totalMatches).toBe(0);
  });
});

describe("undo_last_change", () => {
  beforeEach(() => {
    useWorkspace.setState({ documents: [], activeDocumentId: null, activity: [] });
  });

  it("undoes the agent's own last edit", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", { title: "Undo", template: "blank" });
    const documentId = created.documentId as string;
    await run(tools, "insert_blocks", {
      documentId,
      afterBlockId: "start",
      blocks: [{ type: "text", latex: "Agent text" }],
    });
    const result = await run(tools, "undo_last_change", { documentId });
    expect(result.undone).toBe(true);
    expect(result.author).toBe("agent");
    const doc = useWorkspace.getState().documents.find((d) => d.id === documentId);
    expect(doc?.blocks.some((b) => b.latex === "Agent text")).toBe(false);
  });

  it("refuses to undo when the user edited most recently", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", { title: "Undo guard", template: "blank" });
    const documentId = created.documentId as string;
    await run(tools, "insert_blocks", {
      documentId,
      afterBlockId: "start",
      blocks: [{ type: "text", latex: "Agent text" }],
    });
    const store = useWorkspace.getState();
    store.setSource(documentId, "User typed this instead");
    const result = await run(tools, "undo_last_change", { documentId });
    expect(result.undone).toBe(false);
    expect(result.author).toBe("user");
    expect(String(result.reason)).toContain("user");
    const doc = useWorkspace.getState().documents.find((d) => d.id === documentId);
    expect(doc?.blocks.some((b) => b.latex.includes("User typed"))).toBe(true);
  });

  it("reports when there is nothing to undo", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", { title: "Empty undo", template: "blank" });
    const result = await run(tools, "undo_last_change", { documentId: created.documentId as string });
    expect(result.undone).toBe(false);
    expect(result.author).toBe("none");
  });
});

describe("input limits", () => {
  beforeEach(() => {
    useWorkspace.setState({ documents: [], activeDocumentId: null, activity: [] });
  });

  it("rejects insert_batches beyond the block cap", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", { title: "Cap", template: "blank" });
    const blocks = Array.from({ length: 51 }, (_, i) => ({ type: "text", latex: `Block ${i}` }));
    const result = await run(tools, "insert_blocks", {
      documentId: created.documentId as string,
      afterBlockId: "start",
      blocks,
    });
    expect(result.error).toContain("at most 50");
  });

  it("rejects oversized block latex", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", { title: "Big", template: "blank" });
    const result = await run(tools, "insert_blocks", {
      documentId: created.documentId as string,
      afterBlockId: "start",
      blocks: [{ type: "text", latex: "x".repeat(50_001) }],
    });
    expect(result.error).toContain("character limit");
  });

  it("rejects oversized comments", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", { title: "Comment", template: "blank" });
    const documentId = created.documentId as string;
    await run(tools, "insert_blocks", {
      documentId,
      afterBlockId: "start",
      blocks: [{ type: "text", latex: "Target" }],
    });
    const doc = useWorkspace.getState().documents.find((d) => d.id === documentId);
    const blockId = doc!.blocks[0].id;
    const result = await run(tools, "add_comment", {
      documentId,
      blockId,
      text: "c".repeat(4001),
    });
    expect(result.error).toContain("character limit");
  });

  it("normalizes agent-declared block types against the latex content", async () => {
    const tools = setup();
    const created = await run(tools, "create_document", { title: "TypeFix", template: "blank" });
    const documentId = created.documentId as string;
    await run(tools, "insert_blocks", {
      documentId,
      afterBlockId: "start",
      blocks: [
        { type: "text", latex: "\\begin{definition}[Widget]\\label{def:w}A widget.\\end{definition}" },
        { type: "theorem", latex: "\\begin{theorem}[True]So it is.\\end{theorem}" },
        { type: "text", latex: "\\begin{itemize}\\item one\\end{itemize}" },
        { type: "align", latex: "\\begin{align}a &= b\\end{align}" },
      ],
    });
    const doc = useWorkspace.getState().documents.find((d) => d.id === documentId);
    const inserted = doc!.blocks.filter((b) => b.latex.includes("begin{"));
    expect(inserted.map((b) => b.type)).toEqual(["theorem", "theorem", "text", "align"]);
    const renders = renderDocumentCached(inserted);
    expect(renders.get(inserted[0].id)?.status).toBe("ok");
    expect(renders.get(inserted[0].id)?.html).toContain("Definition");
  });
});
