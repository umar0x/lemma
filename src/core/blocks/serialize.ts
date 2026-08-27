import type { Block } from "./types";

export function serializeBlocks(blocks: Block[]): string {
  return blocks.map((block) => block.latex).join("\n\n");
}
