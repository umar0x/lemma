import { createId } from "@/lib/ids";
import type { Block, ParsedSegment } from "./types";

const SIMILARITY_THRESHOLD = 0.4;

function bigrams(text: string): Set<string> {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const gram of ga) {
    if (gb.has(gram)) shared += 1;
  }
  return (2 * shared) / (ga.size + gb.size);
}

export interface ReconcileOptions {
  now?: () => number;
  createBlockId?: () => string;
}

export function reconcileBlocks(
  previous: Block[],
  next: ParsedSegment[],
  options: ReconcileOptions = {},
): Block[] {
  const now = options.now ?? Date.now;
  const createBlockId = options.createBlockId ?? (() => createId("blk"));

  const exact = new Map<string, Block>();
  for (const block of previous) {
    if (!exact.has(block.latex)) exact.set(block.latex, block);
  }

  const claimed = new Set<string>();
  const result: Array<Block | undefined> = [];
  const unmatched: Array<{ index: number; segment: ParsedSegment }> = [];

  next.forEach((segment) => {
    const match = exact.get(segment.latex);
    if (match && !claimed.has(match.id)) {
      claimed.add(match.id);
      result.push({ ...match, type: segment.type });
    } else {
      unmatched.push({ index: result.length, segment });
      result.push(undefined);
    }
  });

  const previousPositions = new Map(previous.map((block, index) => [block.id, index]));

  for (const { index, segment } of unmatched) {
    let bestScore = 0;
    let bestBlock: Block | null = null;
    for (const block of previous) {
      if (claimed.has(block.id)) continue;
      const score = similarity(segment.latex, block.latex);
      if (score < SIMILARITY_THRESHOLD) continue;
      const oldPos = previousPositions.get(block.id) ?? 0;
      const positionDelta =
        Math.abs(index - oldPos) / Math.max(1, previous.length);
      const adjusted = score - positionDelta * 0.15;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestBlock = block;
      }
    }
    if (bestBlock) {
      claimed.add(bestBlock.id);
      result[index] = {
        id: bestBlock.id,
        type: segment.type,
        latex: segment.latex,
        lastEditedBy: bestBlock.lastEditedBy,
        lastEditedAt: now(),
      };
    } else {
      result[index] = {
        id: createBlockId(),
        type: segment.type,
        latex: segment.latex,
        lastEditedBy: "user",
        lastEditedAt: now(),
      };
    }
  }

  return result as Block[];
}
