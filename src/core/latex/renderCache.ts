import type { Block } from "@/core/blocks/types";
import { hashString } from "./context";
import { prepareRenderPlans, renderBlock, type BlockRenderResult } from "./render";

const MAX_ENTRIES = 600;
const TRIM_BATCH = 120;

const blockCache = new Map<string, BlockRenderResult>();

function cacheKey(version: string, latex: string): string {
  return `${version}\u0000${hashString(latex)}\u0000${latex.length}`;
}

export function clearRenderCache(): void {
  blockCache.clear();
}

export function renderCacheSize(): number {
  return blockCache.size;
}

export function renderDocumentCached(blocks: Block[]): Map<string, BlockRenderResult> {
  const { context, plans } = prepareRenderPlans(blocks);
  const results = new Map<string, BlockRenderResult>();

  for (const plan of plans) {
    const key = cacheKey(context.version, plan.block.latex);
    let result = blockCache.get(key);
    if (!result) {
      result = renderBlock(plan.block, plan.options);
      blockCache.set(key, result);
    }
    results.set(plan.block.id, result);
  }

  if (blockCache.size > MAX_ENTRIES) {
    let removed = 0;
    for (const key of blockCache.keys()) {
      blockCache.delete(key);
      removed += 1;
      if (removed >= TRIM_BATCH) break;
    }
  }

  return results;
}
