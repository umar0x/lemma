import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import type { DocumentRecord } from "@/core/blocks/types";
import { documentRepository, metaRepository, openDatabase } from "./db";

function doc(id: string, updatedAt = 1000): DocumentRecord {
  return {
    id,
    title: `Document ${id}`,
    blocks: [],
    threads: [],
    createdAt: updatedAt - 10,
    updatedAt,
  };
}

describe("documentRepository", () => {
  beforeEach(async () => {
    const db = await openDatabase();
    const tx = db.transaction("documents", "readwrite");
    tx.objectStore("documents").clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  });

  it("round-trips a document", async () => {
    await documentRepository.put(doc("doc_a", 5000));
    const loaded = await documentRepository.get("doc_a");
    expect(loaded?.title).toBe("Document doc_a");
  });

  it("lists documents sorted by recency", async () => {
    await documentRepository.put(doc("doc_old", 100));
    await documentRepository.put(doc("doc_new", 999));
    const all = await documentRepository.list();
    expect(all.map((d) => d.id)).toEqual(["doc_new", "doc_old"]);
  });

  it("removes documents", async () => {
    await documentRepository.put(doc("doc_x"));
    await documentRepository.remove("doc_x");
    expect(await documentRepository.get("doc_x")).toBeUndefined();
  });

  it("persists full block and thread structure", async () => {
    const full: DocumentRecord = {
      id: "doc_full",
      title: "Full",
      createdAt: 1,
      updatedAt: 2,
      blocks: [
        {
          id: "blk_1",
          type: "align",
          latex: "\\begin{align}a &= b\\end{align}",
          lastEditedBy: "agent",
          lastEditedAt: 3,
        },
      ],
      threads: [
        {
          id: "cmt_1",
          blockId: "blk_1",
          resolved: false,
          comments: [{ id: "cmt_2", author: "agent", text: "Note", createdAt: 4 }],
        },
      ],
    };
    await documentRepository.put(full);
    const loaded = await documentRepository.get("doc_full");
    expect(loaded).toEqual(full);
  });
});

describe("metaRepository", () => {
  it("stores and retrieves settings", async () => {
    await metaRepository.set("activeDocument", "doc_a");
    expect(await metaRepository.get<string>("activeDocument")).toBe("doc_a");
  });

  it("returns undefined for missing keys", async () => {
    expect(await metaRepository.get("missing")).toBeUndefined();
  });
});
