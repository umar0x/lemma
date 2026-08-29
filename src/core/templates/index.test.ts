import { describe, expect, it } from "vitest";
import { renderDocument } from "@/core/latex/render";
import { parseSource } from "@/core/blocks/parse";
import { createDocumentFromTemplate, listTemplates } from "./index";
import { createSeedDocument } from "./seed";

describe("templates", () => {
  it("exposes five templates", () => {
    expect(listTemplates().map((t) => t.id)).toEqual([
      "blank",
      "notes",
      "problem_set",
      "exam",
      "paper_section",
    ]);
  });

  it("creates documents with unique block ids", () => {
    const doc = createDocumentFromTemplate("notes", "My notes");
    const ids = doc.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc.title).toBe("My notes");
  });

  it("produces segments that re-parse identically for every template", () => {
    for (const template of listTemplates()) {
      const doc = createDocumentFromTemplate(template.id, `Doc ${template.id}`);
      const source = doc.blocks.map((b) => b.latex).join("\n\n");
      const reparsed = parseSource(source).map((s) => s.latex);
      expect(reparsed, `template ${template.id}`).toEqual(doc.blocks.map((b) => b.latex));
    }
  });

  it("renders without errors for every template except intentional cases", () => {
    for (const template of listTemplates()) {
      if (template.id === "blank") continue;
      const doc = createDocumentFromTemplate(template.id, `Doc ${template.id}`);
      const results = renderDocument(doc.blocks);
      const errors = [...results.values()].filter((r) => r.status === "error");
      expect(errors, `template ${template.id} should render cleanly`).toEqual([]);
    }
  });
});

describe("seed document", () => {
  it("contains exactly one intentional render error", () => {
    const doc = createSeedDocument();
    const results = renderDocument(doc.blocks);
    const errors = [...results.entries()].filter(([, r]) => r.status === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0][1].error?.message).toContain("\\alpa");
    expect(errors[0][1].error?.suggestion).toBe("\\alpha");
  });

  it("anchors an agent comment to the error block", () => {
    const doc = createSeedDocument();
    const results = renderDocument(doc.blocks);
    const errorBlockId = [...results.entries()].find(([, r]) => r.status === "error")?.[0];
    const thread = doc.threads.find((t) => t.blockId === errorBlockId);
    expect(thread).toBeDefined();
    expect(thread?.comments[0].author).toBe("agent");
  });

  it("includes a resolved thread demonstrating conversation", () => {
    const doc = createSeedDocument();
    const resolved = doc.threads.find((t) => t.resolved);
    expect(resolved).toBeDefined();
    expect(resolved?.comments.map((c) => c.author)).toEqual(["user", "agent"]);
  });

  it("defines macros that other blocks use successfully", () => {
    const doc = createSeedDocument();
    const results = renderDocument(doc.blocks);
    const alignBlock = doc.blocks.find((b) => b.type === "align");
    expect(alignBlock).toBeDefined();
    expect(results.get(alignBlock!.id)?.status).toBe("error");
  });
});
