import type { Block } from "@/core/blocks/types";
import { collectMacros, extractLabels } from "./macros";
import { theoremLabel } from "./theorems";
import { pageSetupLabel, readDocumentPolicies } from "./geometry";

const NUMBERED_EQ_ENVS = new Set([
  "equation",
  "align",
  "gather",
  "multline",
  "eqnarray",
  "alignat",
  "flalign",
]);

export interface RenderContext {
  macros: Record<string, string>;
  refs: Map<string, string>;
  version: string;
  pageLabel: string;
  microtype: boolean;
}

export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function mathEnvName(latex: string): string | null {
  const match = /^\\begin\{([a-zA-Z*]+)\}/.exec(latex.trim());
  return match ? match[1] : null;
}

export function isNumberedMathBlock(latex: string): boolean {
  const env = mathEnvName(latex);
  if (!env || env.endsWith("*")) return false;
  if (!NUMBERED_EQ_ENVS.has(env)) return false;
  if (/\\(?:notag|nonumber)\b/.test(latex)) return false;
  if (/\\tag\{/.test(latex)) return false;
  return true;
}

export function buildRenderContext(blocks: Block[]): RenderContext {
  const macros = collectMacros(blocks.map((block) => block.latex));
  const refs = new Map<string, string>();
  let equationNumber = 0;
  const theoremCounts = new Map<string, number>();

  for (const block of blocks) {
    if (block.type === "theorem") {
      const env = (mathEnvName(block.latex) ?? "theorem").replace(/\*$/, "");
      if (env === "proof") continue;
      const next = (theoremCounts.get(env) ?? 0) + 1;
      theoremCounts.set(env, next);
      for (const label of extractLabels(block.latex)) {
        refs.set(label, `${theoremLabel(env)} ${next}`);
      }
    } else if (block.type === "equation" || block.type === "align") {
      if (!isNumberedMathBlock(block.latex)) continue;
      equationNumber += 1;
      for (const label of extractLabels(block.latex)) {
        refs.set(label, String(equationNumber));
      }
    }
  }

  const policies = readDocumentPolicies(blocks);
  const version = hashString(
    JSON.stringify([macros, [...refs.entries()].sort((a, b) => a[0].localeCompare(b[0])), policies]),
  );
  return { macros, refs, version, pageLabel: pageSetupLabel(policies.pageSetup), microtype: policies.microtype };
}
