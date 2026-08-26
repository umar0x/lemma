import { describe, expect, it } from "vitest";
import { reconcileBlocks, similarity } from "./reconcile";
import type { Block, ParsedSegment } from "./types";

let counter = 0;
const fixedNow = () => 1000000;

function block(latex: string, overrides: Partial<Block> = {}): Block {
  counter += 1;
  return {
    id: `blk_fixed${counter}`,
    type: "text",
    latex,
    lastEditedBy: "user",
    lastEditedAt: fixedNow(),
    ...overrides,
  };
}

function segment(latex: string, type: ParsedSegment["type"] = "text"): ParsedSegment {
  return { type, latex };
}

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("hello world", "hello world")).toBe(1);
  });

  it("detects close typos", () => {
    expect(similarity("\\alpha + \\beta", "\\alpa + \\beta")).toBeGreaterThan(0.7);
  });

  it("returns low score for unrelated strings", () => {
    expect(similarity("\\int_0^1 x dx", "The quick brown fox")).toBeLessThan(0.3);
  });
});

describe("reconcileBlocks", () => {
  it("preserves ids for unchanged content", () => {
    const before = [block("Alpha text"), block("Beta text")];
    const after = reconcileBlocks(before, [segment("Alpha text"), segment("Beta text")], { now: fixedNow });
    expect(after.map((b) => b.id)).toEqual(before.map((b) => b.id));
  });

  it("preserves ids through reordering", () => {
    const before = [block("Alpha text"), block("Beta text")];
    const after = reconcileBlocks(before, [segment("Beta text"), segment("Alpha text")], { now: fixedNow });
    expect(after.map((b) => b.latex)).toEqual(["Beta text", "Alpha text"]);
    expect(after[0].id).toBe(before[1].id);
    expect(after[1].id).toBe(before[0].id);
  });

  it("keeps the id of an edited block when content is similar", () => {
    const original = block("\\begin{align}\\int_0^1 \\alpha(x)\\,dx &= \\frac{1}{2}\\end{align}");
    const edited = segment("\\begin{align}\\int_0^1 \\beta(x)\\,dx &= \\frac{1}{3}\\end{align}");
    const after = reconcileBlocks([original], [edited], { now: fixedNow });
    expect(after[0].id).toBe(original.id);
    expect(after[0].latex).toBe(edited.latex);
  });

  it("assigns fresh ids to genuinely new blocks", () => {
    const before = [block("Existing text")];
    const after = reconcileBlocks(before, [segment("Existing text"), segment("Brand new content")], {
      now: fixedNow,
    });
    expect(after[0].id).toBe(before[0].id);
    expect(after[1].id).not.toBe(before[0].id);
  });

  it("drops removed blocks", () => {
    const before = [block("Alpha"), block("Beta")];
    const after = reconcileBlocks(before, [segment("Alpha")], { now: fixedNow });
    expect(after).toHaveLength(1);
    expect(after[0].latex).toBe("Alpha");
  });

  it("handles duplicate content without id collisions", () => {
    const before = [block("Same text"), block("Different text")];
    const after = reconcileBlocks(
      before,
      [segment("Same text"), segment("Different text"), segment("Same text")],
      { now: fixedNow },
    );
    const ids = after.map((b) => b.id);
    expect(new Set(ids).size).toBe(3);
    expect(after[0].id).toBe(before[0].id);
  });

  it("preserves edit provenance when a block is matched by content", () => {
    const agentBlock = block("Agent wrote this", { lastEditedBy: "agent" });
    const after = reconcileBlocks([agentBlock], [segment("Agent wrote this")], { now: fixedNow });
    expect(after[0].lastEditedBy).toBe("agent");
  });

  it("updates the type when classification changes", () => {
    const textBlock = block("x = y", { type: "text" });
    const after = reconcileBlocks([textBlock], [segment("x = y", "equation")], { now: fixedNow });
    expect(after[0].id).toBe(textBlock.id);
    expect(after[0].type).toBe("equation");
  });

  it("survives an empty document", () => {
    const after = reconcileBlocks([block("Alpha")], [], { now: fixedNow });
    expect(after).toEqual([]);
  });

  it("recovers ids after a full retype that is still similar", () => {
    const before = [
      block("Consider the function $f(x) = x^2$ on the interval."),
      block("We compute the derivative step by step below."),
    ];
    const next = [
      segment("Consider the function $f(x) = x^3$ on the interval."),
      segment("We compute the derivative step by step below."),
    ];
    const after = reconcileBlocks(before, next, { now: fixedNow });
    expect(after[0].id).toBe(before[0].id);
    expect(after[1].id).toBe(before[1].id);
  });
});
