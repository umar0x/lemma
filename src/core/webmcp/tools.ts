import type { UseBoundStore, StoreApi } from "zustand";
import type { WorkspaceState } from "@/state/workspace";
import type { Author, BlockType, ParsedSegment } from "@/core/blocks/types";
import { renderDocumentCached } from "@/core/latex/renderCache";
import type { BlockRenderResult } from "@/core/latex/render";
import { serializeDocumentTex } from "@/core/blocks/serialize";
import { readDocumentPolicies, pageSetupLabel } from "@/core/latex/geometry";
import { deriveBlockType } from "@/core/blocks/parse";
import { texFilename } from "@/lib/export";
import { truncate } from "@/lib/text";
import type { TemplateId } from "@/core/templates";

export type WorkspaceStore = UseBoundStore<StoreApi<WorkspaceState>>;

export interface ToolServices {
  triggerDownload: (filename: string, content: string) => void;
}

interface ToolResult {
  [key: string]: unknown;
}

export interface WebMcpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>, signal: AbortSignal) => Promise<ToolResult> | ToolResult;
}

const BLOCK_TYPES: BlockType[] = [
  "text",
  "equation",
  "align",
  "theorem",
  "figure",
  "table",
  "code",
  "preamble",
];
const TEMPLATES: TemplateId[] = ["blank", "notes", "problem_set", "exam", "paper_section"];
const VIEW_MODES = ["source", "split", "preview"] as const;
const LATEX_BLOCK_CAP = 400;
const MAX_BLOCKS_PER_CALL = 50;
const MAX_LATEX_LENGTH = 50_000;
const MAX_TOTAL_LATEX_LENGTH = 200_000;
const MAX_TITLE_LENGTH = 200;
const MAX_COMMENT_LENGTH = 4000;
const MAX_QUERY_LENGTH = 200;

function toolError(error: string, hint?: string): ToolResult {
  return hint ? { error, hint } : { error };
}

function isValidBlockInput(value: unknown): value is { type: string; latex: string } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; latex?: unknown };
  return (
    typeof candidate.type === "string" &&
    BLOCK_TYPES.includes(candidate.type as BlockType) &&
    typeof candidate.latex === "string" &&
    candidate.latex.trim().length > 0
  );
}

export function createWebMcpTools(
  store: WorkspaceStore,
  services: ToolServices,
): WebMcpToolDefinition[] {
  const state = () => store.getState();

  const findDocument = (documentId: string) =>
    state().documents.find((d) => d.id === documentId);

  const requireDocument = (documentId: unknown): ToolResult | null => {
    if (typeof documentId !== "string" || !documentId) {
      return toolError("Missing required parameter: documentId (string).");
    }
    if (!findDocument(documentId)) {
      return toolError(
        `Document not found: ${truncate(documentId, 40)}.`,
        "Call list_documents first to see available document IDs.",
      );
    }
    return null;
  };

  const requireBlock = (documentId: string, blockId: unknown): ToolResult | null => {
    if (typeof blockId !== "string" || !findDocument(documentId)!.blocks.some((b) => b.id === blockId)) {
      return toolError(
        `Block ${truncate(String(blockId), 40)} not found.`,
        "Call get_document to list current block IDs.",
      );
    }
    return null;
  };

  const requireThread = (documentId: string, threadId: unknown): ToolResult | null => {
    if (
      typeof threadId !== "string" ||
      !findDocument(documentId)!.threads.some((t) => t.id === threadId)
    ) {
      return toolError(
        `Comment thread ${truncate(String(threadId), 40)} not found.`,
        "Call get_document with includeComments to see thread IDs.",
      );
    }
    return null;
  };

  const snippet = (text: string, max = 90) => truncate(text.replace(/\s+/g, " ").trim(), max);

  const blockPayload = (
    block: { id: string; type: BlockType; latex: string; lastEditedBy: Author },
    renderInfo: { status: string; error?: { message: string; suggestion?: string }; meta?: { labels?: string[]; number?: number } },
    neighbors?: { prev?: { id: string; snippet: string }; next?: { id: string; snippet: string }; index: number },
  ) => ({
    id: block.id,
    type: block.type,
    index: neighbors?.index,
    prevBlockId: neighbors?.prev?.id,
    nextBlockId: neighbors?.next?.id,
    latex:
      block.latex.length > LATEX_BLOCK_CAP
        ? `${block.latex.slice(0, LATEX_BLOCK_CAP)}… (+${block.latex.length - LATEX_BLOCK_CAP} chars)`
        : block.latex,
    renderStatus: renderInfo.status,
    error: renderInfo.error?.message,
    suggestion: renderInfo.error?.suggestion,
    labels: renderInfo.meta?.labels,
    number: renderInfo.meta?.number,
    lastEditedBy: block.lastEditedBy,
    prevSnippet: neighbors?.prev?.snippet,
    nextSnippet: neighbors?.next?.snippet,
  });

  const withNeighbors = (doc: { blocks: Array<{ id: string; type: BlockType; latex: string; lastEditedBy: Author }> }, renders: Map<string, BlockRenderResult>) =>
    doc.blocks.map((block, index) =>
      blockPayload(block, renders.get(block.id) ?? { status: "empty" }, {
        index,
        prev: index > 0 ? { id: doc.blocks[index - 1].id, snippet: snippet(doc.blocks[index - 1].latex, 48) } : undefined,
        next: index < doc.blocks.length - 1 ? { id: doc.blocks[index + 1].id, snippet: snippet(doc.blocks[index + 1].latex, 48) } : undefined,
      }),
    );

  return [
    {
      name: "list_documents",
      title: "List workspace documents",
      description:
        "List every LaTeX document in this workspace with title, block count, open render errors, and a short snippet. Use this first to discover document IDs before reading or editing.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional text filter matched against document titles and content.",
          },
        },
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => {
        const query = typeof input.query === "string" ? input.query.toLowerCase().slice(0, MAX_QUERY_LENGTH) : "";
        const documents = state()
          .documents.filter(
            (doc) =>
              !query ||
              doc.title.toLowerCase().includes(query) ||
              doc.blocks.some((b) => b.latex.toLowerCase().includes(query)),
          )
          .map((doc) => {
            const renders = renderDocumentCached(doc.blocks);
            let errors = 0;
            for (const r of renders.values()) if (r.status === "error") errors += 1;
            const firstText = doc.blocks.find((b) => b.type === "text" && b.latex.trim());
            return {
              id: doc.id,
              title: doc.title,
              blockCount: doc.blocks.length,
              errorCount: errors,
              openComments: doc.threads.filter((t) => !t.resolved).length,
              lastEdited: new Date(doc.updatedAt).toISOString(),
              snippet: firstText ? snippet(firstText.latex) : "",
            };
          });
        return { total: documents.length, documents };
      },
    },

    {
      name: "get_document",
      title: "Read document structure",
      description:
        "Read one document's full structure: every block with its stable ID, LaTeX source, render status, and comment threads. This is the primary way to understand the document before editing. Always call this before insert_blocks or update_block.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Document ID from list_documents." },
          includeComments: {
            type: "boolean",
            description: "Include comment threads in the response. Default true.",
          },
        },
        required: ["documentId"],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const doc = findDocument(input.documentId as string)!;
        const includeComments = input.includeComments !== false;
        const renders = renderDocumentCached(doc.blocks);
        const policies = readDocumentPolicies(doc.blocks);
        return {
          documentId: doc.id,
          title: doc.title,
          blockCount: doc.blocks.length,
          pageSetup: pageSetupLabel(policies.pageSetup),
          microtype: policies.microtype,
          blocks: withNeighbors(doc, renders),
          threads: includeComments
            ? doc.threads.map((thread) => ({
                id: thread.id,
                blockId: thread.blockId,
                resolved: thread.resolved,
                quote: thread.quote ? snippet(thread.quote, 60) : undefined,
                comments: thread.comments.map((c) => ({
                  author: c.author,
                  text: truncate(c.text, 200),
                })),
              }))
            : undefined,
        };
      },
    },

    {
      name: "get_render_errors",
      title: "Read live render errors",
      description:
        "Get every live KaTeX render error in a document: block ID, error message, character position, source context, and a suggested fix when one is known. Use this after any edit to verify the document compiles, and to find and repair your own mistakes.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Document ID from list_documents." },
          blockId: { type: "string", description: "Optional: restrict the check to a single block." },
        },
        required: ["documentId"],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const doc = findDocument(documentId)!;
        if (input.blockId !== undefined) {
          const blockInvalid = requireBlock(documentId, input.blockId);
          if (blockInvalid) return blockInvalid;
        }
        const scope = typeof input.blockId === "string" ? input.blockId : null;
        const renders = renderDocumentCached(doc.blocks);
        const errors = doc.blocks
          .filter((block) => !scope || block.id === scope)
          .map((block) => ({ block, render: renders.get(block.id) }))
          .filter((entry) => entry.render?.status === "error" && entry.render.error)
          .map(({ block, render }) => ({
            blockId: block.id,
            blockType: block.type,
            message: render!.error!.message,
            suggestion: render!.error!.suggestion,
            position: render!.error!.position,
            context: snippet(render!.error!.context, 110),
            fix: render!.error!.suggestion
              ? `Replace the offending command with ${render!.error!.suggestion} via update_block.`
              : `Edit block ${block.id} with update_block; set mode to "replace" and provide corrected LaTeX.`,
          }));
        return { documentId, totalErrors: errors.length, errors };
      },
    },

    {
      name: "get_document_outline",
      title: "Read document outline",
      description:
        "Get a compact outline of a document: section headings, numbered theorems, and labeled equations with their numbers and block IDs. Much lighter than get_document. Use it to orient yourself or to pick anchor block IDs before editing.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Document ID from list_documents." },
        },
        required: ["documentId"],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const doc = findDocument(input.documentId as string)!;
        const renders = renderDocumentCached(doc.blocks);
        const entries: Array<Record<string, unknown>> = [];
        for (const block of doc.blocks) {
          const render = renders.get(block.id);
          if (block.type === "text") {
            const heading = /^\\(?:sub){0,2}section\*?\s*\{([^{}]*)\}/.exec(block.latex.trim());
            if (heading) {
              const level = (heading[0].match(/sub/g) ?? []).length;
              entries.push({ blockId: block.id, kind: "heading", level, title: snippet(heading[1], 80) });
            }
          } else if (block.type === "theorem") {
            const envMatch = /\\begin\{([a-zA-Z*]+)\}/.exec(block.latex);
            const titleMatch = /^\\begin\{[a-zA-Z*]+\}\s*\[([^\]]*)\]/.exec(block.latex.trim());
            entries.push({
              blockId: block.id,
              kind: "theorem",
              theoremKind: envMatch ? envMatch[1].replace(/\*$/, "") : "theorem",
              number: render?.meta?.number,
              title: titleMatch ? snippet(titleMatch[1], 60) : undefined,
              labels: render?.meta?.labels,
            });
          } else if (block.type === "equation" || block.type === "align") {
            const labels = render?.meta?.labels ?? [];
            if (labels.length > 0 || render?.meta?.number !== undefined) {
              entries.push({
                blockId: block.id,
                kind: "equation",
                number: render?.meta?.number,
                labels,
              });
            }
          }
        }
        return { documentId: doc.id, title: doc.title, blockCount: doc.blocks.length, entries };
      },
    },

    {
      name: "search_documents",
      title: "Search workspace content",
      description:
        "Find text or LaTeX across the workspace (case-insensitive substring). Returns each match as a block with its ID and surrounding context, so the agent can quote, update, or comment on it. Use before editing to locate where a concept, label, or command appears.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to find, e.g. 'pythagorean', 'thm:', '\\\\int'." },
          documentId: {
            type: "string",
            description: "Optional: restrict the search to one document. Default: all documents.",
          },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => {
        if (typeof input.query !== "string" || !input.query.trim()) {
          return toolError("Missing required parameter: query (non-empty string).");
        }
        const query = input.query.toLowerCase().slice(0, MAX_QUERY_LENGTH);
        let scope = state().documents;
        if (input.documentId !== undefined) {
          const invalid = requireDocument(input.documentId);
          if (invalid) return invalid;
          scope = scope.filter((d) => d.id === input.documentId);
        }
        const matches: Array<Record<string, unknown>> = [];
        for (const doc of scope) {
          if (doc.title.toLowerCase().includes(query)) {
            matches.push({ documentId: doc.id, title: doc.title, matched: "title" });
          }
          for (const block of doc.blocks) {
            const lower = block.latex.toLowerCase();
            const at = lower.indexOf(query);
            if (at === -1) continue;
            const start = Math.max(0, at - 36);
            const context = block.latex
              .slice(start, Math.min(block.latex.length, at + query.length + 36))
              .replace(/\s+/g, " ")
              .trim();
            matches.push({
              documentId: doc.id,
              title: doc.title,
              blockId: block.id,
              blockType: block.type,
              context: `…${context}…`,
            });
            if (matches.length >= 25) break;
          }
          if (matches.length >= 25) break;
        }
        return {
          query: input.query.slice(0, MAX_QUERY_LENGTH),
          totalMatches: matches.length,
          truncated: matches.length >= 25,
          matches,
        };
      },
    },

    {
      name: "create_document",
      title: "Create document from template",
      description:
        "Create and open a new LaTeX document from a template (blank, notes, problem_set, exam, paper_section). Optionally seed it with initial blocks. Use when the user wants to start something new.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Human-readable document title." },
          template: {
            type: "string",
            enum: TEMPLATES,
            description:
              "Template that pre-loads typical structure: problem_set, exam, notes, paper_section, or blank.",
          },
          initialBlocks: {
            type: "array",
            description: "Optional initial blocks as {type, latex} objects.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: BLOCK_TYPES },
                latex: { type: "string" },
              },
              required: ["type", "latex"],
            },
          },
        },
        required: ["title", "template"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const title = typeof input.title === "string" ? input.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
        if (!title) return toolError("Parameter title is required and must be a non-empty string.");
        const template = input.template as TemplateId;
        if (!TEMPLATES.includes(template)) {
          return toolError(
            `Unknown template: ${String(input.template)}.`,
            `Valid templates: ${TEMPLATES.join(", ")}.`,
          );
        }
        const store2 = state();
        const doc = store2.createDocument(template, title);
        let inserted: string[] = [];
        if (Array.isArray(input.initialBlocks) && input.initialBlocks.length > 0) {
          if (input.initialBlocks.length > MAX_BLOCKS_PER_CALL) {
            return toolError(`initialBlocks accepts at most ${MAX_BLOCKS_PER_CALL} blocks per call.`);
          }
          const segments = (input.initialBlocks as unknown[])
            .filter(isValidBlockInput)
            .map((b) => ({ type: b.type as BlockType, latex: b.latex }));
          const blocks = store2.insertBlocks(doc.id, "start", segments, "agent");
          inserted = blocks.map((b) => b.id);
        }
        store2.pushActivity({
          kind: "create",
          message: `Agent created "${title}"`,
          documentId: doc.id,
        });
        return {
          documentId: doc.id,
          title,
          blockIds: inserted,
          totalBlocks: findDocument(doc.id)!.blocks.length,
        };
      },
    },

    {
      name: "insert_blocks",
      title: "Insert LaTeX blocks",
      description:
        'Insert new LaTeX blocks after an anchor block (or at the start). Blocks render immediately; the response reports each block\'s render status and the surrounding context so you can verify placement. figure blocks support TikZ diagrams (\\begin{tikzpicture}...\\end{tikzpicture}). Check get_render_errors afterward to self-correct.',
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Target document ID." },
          afterBlockId: {
            type: "string",
            description: 'Insert after this block ID, or use "start" for the beginning.',
          },
          blocks: {
            type: "array",
            description: "Blocks to insert, each {type, latex}.",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: BLOCK_TYPES,
                  description:
                    "text (prose with inline $math$), equation (display math), align (multi-line), theorem, figure, table, code, preamble (macro definitions).",
                },
                latex: { type: "string", description: "LaTeX source for the block." },
              },
              required: ["type", "latex"],
            },
          },
        },
        required: ["documentId", "afterBlockId", "blocks"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const doc = findDocument(documentId)!;
        const afterBlockId = input.afterBlockId;
        if (
          typeof afterBlockId !== "string" ||
          (afterBlockId !== "start" && !doc.blocks.some((b) => b.id === afterBlockId))
        ) {
          return toolError(
            `afterBlockId ${truncate(String(afterBlockId), 40)} not found.`,
            'Use a block ID from get_document, or the literal "start".',
          );
        }
        if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
          return toolError("blocks must be a non-empty array of {type, latex} objects.");
        }
        if (input.blocks.length > MAX_BLOCKS_PER_CALL) {
          return toolError(
            `blocks accepts at most ${MAX_BLOCKS_PER_CALL} entries per call.`,
            "Split large inserts into several insert_blocks calls, anchoring each batch after the previous one's last block ID.",
          );
        }
        const invalidBlocks = (input.blocks as unknown[]).filter((b) => !isValidBlockInput(b));
        if (invalidBlocks.length > 0) {
          return toolError(
            "Some blocks are malformed.",
            `Each block needs type (${BLOCK_TYPES.join("|")}) and non-empty latex (string).`,
          );
        }
        const oversized = (input.blocks as Array<{ latex: string }>).find((b) => b.latex.length > MAX_LATEX_LENGTH);
        if (oversized) {
          return toolError(
            `A block exceeds the ${MAX_LATEX_LENGTH.toLocaleString()}-character limit.`,
            "Split very long content into multiple smaller blocks so the preview and undo stay responsive.",
          );
        }
        const totalLength = (input.blocks as Array<{ latex: string }>).reduce((sum, b) => sum + b.latex.length, 0);
        if (totalLength > MAX_TOTAL_LATEX_LENGTH) {
          return toolError(
            `This call inserts ${totalLength.toLocaleString()} characters in total, above the ${MAX_TOTAL_LATEX_LENGTH.toLocaleString()} limit.`,
            "Split the insert into several calls.",
          );
        }
        const segments: ParsedSegment[] = (input.blocks as unknown[]).map((b) => {
          const block = b as { type: string; latex: string };
          return { type: deriveBlockType(block.latex, block.type as BlockType), latex: block.latex };
        });
        const store2 = state();
        const inserted = store2.insertBlocks(documentId, afterBlockId, segments, "agent");
        const updatedDoc = findDocument(documentId)!;
        const renders = renderDocumentCached(updatedDoc.blocks);
        const statuses = inserted.map((block) => {
          const render = renders.get(block.id);
          return {
            blockId: block.id,
            status: render?.status ?? "empty",
            error: render?.error?.message,
            suggestion: render?.error?.suggestion,
          };
        });
        const firstInserted = inserted[0]?.id;
        const anchorIndex = updatedDoc.blocks.findIndex((b) => b.id === firstInserted);
        const before = anchorIndex !== -1 && anchorIndex > 0 ? updatedDoc.blocks[anchorIndex - 1] : undefined;
        const after = anchorIndex !== -1 ? updatedDoc.blocks[anchorIndex + inserted.length] : undefined;
        store2.pushActivity({
          kind: "insert",
          message: `Agent inserted ${inserted.length} block${inserted.length === 1 ? "" : "s"}`,
          documentId,
          blockIds: inserted.map((b) => b.id),
          undoable: true,
        });
        const failed = statuses.filter((s) => s.status === "error");
        return {
          blockIds: inserted.map((b) => b.id),
          totalBlocks: updatedDoc.blocks.length,
          insertedAfter: {
            blockId: before?.id,
            snippet: before ? snippet(before.latex, 64) : undefined,
          },
          followedBy: {
            blockId: after?.id,
            snippet: after ? snippet(after.latex, 64) : undefined,
          },
          renderStatuses: statuses,
          ...(failed.length > 0
            ? {
                hint:
                  "Some blocks have render errors. Call get_render_errors for exact positions and suggested fixes, then correct with update_block.",
              }
            : {}),
        };
      },
    },

    {
      name: "update_block",
      title: "Replace or append to a block",
      description:
        "Replace (or append to) the LaTeX source of a single block by ID. The block re-renders immediately and the response reports the new render status. Use this to fix errors reported by get_render_errors. Prefer this over rewriting whole documents.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Target document ID." },
          blockId: { type: "string", description: "Block ID to update." },
          latex: { type: "string", description: "New LaTeX source for the block." },
          mode: {
            type: "string",
            enum: ["replace", "append"],
            description: "Replace the whole block (default) or append to it.",
          },
        },
        required: ["documentId", "blockId", "latex"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const blockInvalid = requireBlock(documentId, input.blockId);
        if (blockInvalid) return blockInvalid;
        if (typeof input.latex !== "string" || !input.latex.trim()) {
          return toolError("latex must be a non-empty string.");
        }
        const blockId = input.blockId as string;
        if (input.latex.length > MAX_LATEX_LENGTH) {
          return toolError(
            `latex exceeds the ${MAX_LATEX_LENGTH.toLocaleString()}-character limit.`,
            "Split very long content into multiple smaller blocks.",
          );
        }
        const mode = input.mode === "append" ? "append" : "replace";
        const store2 = state();
        const updated = store2.updateBlock(documentId, blockId, input.latex, mode, "agent");
        if (!updated) return toolError("Update failed unexpectedly.");
        const renders = renderDocumentCached(findDocument(documentId)!.blocks);
        const render = renders.get(blockId);
        store2.pushActivity({
          kind: "update",
          message: `Agent edited block · ${snippet(input.latex, 60)}`,
          documentId,
          blockIds: [blockId],
          undoable: true,
        });
        return {
          blockId,
          renderStatus: render?.status ?? "empty",
          error: render?.error?.message,
          suggestion: render?.error?.suggestion,
          ...(render?.error
            ? {
                hint: "The edit still has a render error. Call get_render_errors for position details.",
              }
            : {}),
        };
      },
    },

    {
      name: "delete_block",
      title: "Delete a block",
      description:
        "Delete a single block (and its comment threads) by ID. The document re-renders without it. Only delete when the user asks for removal.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Target document ID." },
          blockId: { type: "string", description: "Block ID to delete." },
        },
        required: ["documentId", "blockId"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const blockInvalid = requireBlock(documentId, input.blockId);
        if (blockInvalid) return blockInvalid;
        const blockId = input.blockId as string;
        const store2 = state();
        const removed = store2.deleteBlock(documentId, blockId, "agent");
        if (!removed) return toolError("Delete failed unexpectedly.");
        const remaining = findDocument(documentId)!.blocks.length;
        store2.pushActivity({
          kind: "delete",
          message: "Agent deleted a block",
          documentId,
          blockIds: [blockId],
          undoable: true,
        });
        return { success: true, deletedBlockId: blockId, remainingBlocks: remaining };
      },
    },

    {
      name: "undo_last_change",
      title: "Undo the last change",
      description:
        "Undo the most recent edit in a document, but only when it was made by the agent. If the user typed something more recently, the call refuses and explains why, so you never silently revert the user's work. Use this when the user asks you to take an edit back.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Document ID from list_documents." },
        },
        required: ["documentId"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const store2 = state();
        const result = store2.undoLastChange(documentId);
        if (result.undone) {
          store2.pushActivity({
            kind: "update",
            message: "Agent undid its last change",
            documentId,
          });
          return {
            undone: true,
            author: result.author,
            blockCountBefore: result.blockCountBefore,
            blockCountAfter: result.blockCountAfter,
            remainingUndoDepth: result.remainingUndoDepth,
            hint: "The document re-rendered with the change reverted. The user can also redo it with Cmd/Ctrl+Shift+Z.",
          };
        }
        return {
          undone: false,
          author: result.author,
          reason: result.reason,
          remainingUndoDepth: result.remainingUndoDepth,
        };
      },
    },

    {
      name: "add_comment",
      title: "Comment on a block",
      description:
        "Add an agent-authored comment anchored to a block. The comment appears in the margin next to the rendered block, clearly marked as agent-authored. Use comments to explain, question, or tutor without changing the user's math.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Target document ID." },
          blockId: { type: "string", description: "Block to anchor the comment to." },
          text: { type: "string", description: "Comment text. Inline $math$ is rendered." },
          quote: { type: "string", description: "Optional exact quote from the block to highlight." },
        },
        required: ["documentId", "blockId", "text"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const blockInvalid = requireBlock(documentId, input.blockId);
        if (blockInvalid) return blockInvalid;
        if (typeof input.text !== "string" || !input.text.trim()) {
          return toolError("text must be a non-empty string.");
        }
        if (input.text.length > MAX_COMMENT_LENGTH) {
          return toolError(`text exceeds the ${MAX_COMMENT_LENGTH}-character limit.`, "Keep comments concise; post multiple comments for longer feedback.");
        }
        const store2 = state();
        const thread = store2.addComment(
          documentId,
          input.blockId as string,
          input.text,
          "agent",
          typeof input.quote === "string" ? input.quote : undefined,
        );
        if (!thread) return toolError("Could not create comment.");
        store2.pushActivity({
          kind: "comment",
          message: `Agent commented · ${snippet(input.text, 60)}`,
          documentId,
          blockIds: [input.blockId as string],
        });
        return {
          threadId: thread.id,
          commentId: thread.comments[0].id,
          blockId: input.blockId,
          resolved: thread.resolved,
          hint: "The comment is anchored in the margin next to the rendered block. Use reply_to_comment to continue the discussion and resolve_comment when it concludes.",
        };
      },
    },

    {
      name: "reply_to_comment",
      title: "Reply to a comment thread",
      description:
        "Append an agent reply to an existing comment thread. Use this to answer questions the user asked in the margin, in context.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Target document ID." },
          threadId: { type: "string", description: "Thread ID to reply to." },
          text: { type: "string", description: "Reply text. Inline $math$ is rendered." },
        },
        required: ["documentId", "threadId", "text"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const threadInvalid = requireThread(documentId, input.threadId);
        if (threadInvalid) return threadInvalid;
        if (typeof input.text !== "string" || !input.text.trim()) {
          return toolError("text must be a non-empty string.");
        }
        if (input.text.length > MAX_COMMENT_LENGTH) {
          return toolError(`text exceeds the ${MAX_COMMENT_LENGTH}-character limit.`);
        }
        const threadId = input.threadId as string;
        const store2 = state();
        const ok = store2.replyToComment(documentId, threadId, input.text, "agent");
        if (!ok) return toolError("Reply failed unexpectedly.");
        const thread = findDocument(documentId)!.threads.find((t) => t.id === threadId)!;
        store2.pushActivity({
          kind: "comment",
          message: `Agent replied in a thread · ${snippet(input.text, 60)}`,
          documentId,
        });
        return {
          threadId,
          commentId: thread.comments[thread.comments.length - 1].id,
          replyCount: thread.comments.length,
          resolved: thread.resolved,
        };
      },
    },

    {
      name: "resolve_comment",
      title: "Resolve a comment thread",
      description:
        "Mark a comment thread resolved (or reopen it). Use when the discussion has concluded so the margin stays clean.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Target document ID." },
          threadId: { type: "string", description: "Thread ID to resolve." },
          resolved: { type: "boolean", description: "Resolve (default true) or reopen the thread." },
        },
        required: ["documentId", "threadId"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const threadInvalid = requireThread(documentId, input.threadId);
        if (threadInvalid) return threadInvalid;
        const threadId = input.threadId as string;
        const resolved = input.resolved !== false;
        const store2 = state();
        const ok = store2.resolveThread(documentId, threadId, resolved, "agent");
        if (!ok) return toolError("Resolve failed unexpectedly.");
        store2.pushActivity({
          kind: "resolve",
          message: resolved ? "Agent resolved a comment" : "Agent reopened a comment",
          documentId,
        });
        return {
          threadId,
          resolved,
          hint: resolved
            ? "The thread stays visible in the margin, styled as resolved. Set resolved to false to reopen it."
            : undefined,
        };
      },
    },

    {
      name: "set_view",
      title: "Control the user's view",
      description:
        "Control what the user sees: switch between source, preview, and split modes, and optionally scroll to a specific block. Use this to draw attention to an edit. For example, after fixing a render error, switch to preview and scroll to the corrected block.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Target document ID." },
          mode: {
            type: "string",
            enum: VIEW_MODES,
            description: "source shows LaTeX code, preview shows rendered math, split shows both.",
          },
          scrollToBlockId: { type: "string", description: "Optional block ID to scroll into view." },
        },
        required: ["documentId", "mode"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const mode = input.mode;
        if (typeof mode !== "string" || !VIEW_MODES.includes(mode as (typeof VIEW_MODES)[number])) {
          return toolError(`Invalid mode: ${String(mode)}.`, `Valid modes: ${VIEW_MODES.join(", ")}.`);
        }
        let scrolledTo: string | undefined;
        if (input.scrollToBlockId !== undefined) {
          const blockInvalid = requireBlock(documentId, input.scrollToBlockId);
          if (blockInvalid) return blockInvalid;
          scrolledTo = input.scrollToBlockId as string;
        }
        const store2 = state();
        if (store2.activeDocumentId !== documentId) store2.openDocument(documentId);
        store2.setViewMode(mode as WorkspaceState["viewMode"]);
        if (scrolledTo) store2.focusBlock(scrolledTo);
        store2.pushActivity({
          kind: "view",
          message: `Agent switched the view to ${mode}`,
          documentId,
        });
        return { mode, scrolledTo };
      },
    },

    {
      name: "export_document",
      title: "Export document as .tex",
      description:
        "Compile the document into a complete, compilable .tex file (with preamble, geometry, theorem declarations, and TikZ when used) and download it for the user. Set returnContent to also receive the full .tex source in the response for verification. Use when they want to keep working in Overleaf or another LaTeX environment.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Document ID to export." },
          returnContent: {
            type: "boolean",
            description: "Include the full .tex source in the response (default false).",
          },
        },
        required: ["documentId"],
      },
      execute: (input, signal) => {
        if (signal.aborted) return toolError("Execution aborted.");
        const invalid = requireDocument(input.documentId);
        if (invalid) return invalid;
        const documentId = input.documentId as string;
        const doc = findDocument(documentId)!;
        const tex = serializeDocumentTex(doc);
        const filename = texFilename(doc.title);
        services.triggerDownload(filename, tex);
        const store2 = state();
        store2.pushActivity({
          kind: "export",
          message: `Agent exported "${doc.title}" as .tex`,
          documentId,
        });
        return {
          documentId,
          filename,
          bytes: tex.length,
          format: "tex",
          ...(input.returnContent === true ? { content: tex } : {}),
        };
      },
    },
  ];
}

export const WEBMCP_TOOL_NAMES = [
  "list_documents",
  "get_document",
  "get_render_errors",
  "get_document_outline",
  "search_documents",
  "create_document",
  "insert_blocks",
  "update_block",
  "delete_block",
  "undo_last_change",
  "add_comment",
  "reply_to_comment",
  "resolve_comment",
  "set_view",
  "export_document",
] as const;
