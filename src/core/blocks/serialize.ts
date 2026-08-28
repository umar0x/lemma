import type { Block, BlockType, DocumentRecord } from "./types";
import { THEOREM_LABELS } from "@/core/latex/theorems";
import { containsTikzPicture } from "@/core/latex/tikz";
import { geometryOptionsFromSetup, readDocumentPolicies } from "@/core/latex/geometry";

export function serializeBlocks(blocks: Block[]): string {
  return blocks.map((block) => block.latex).join("\n\n");
}

const REGENERATED_PACKAGES = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]*;)?\s*(?:geometry|microtype|tikz)\s*(?:;[^{}]*)?\}/;

export function serializeDocumentTex(document: DocumentRecord): string {
  const policies = readDocumentPolicies(document.blocks);
  const preambleContent = document.blocks
    .filter((block) => block.type === "preamble")
    .flatMap((block) => block.latex.split("\n"))
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("\\documentclass") && !REGENERATED_PACKAGES.test(line));

  const geometryOptions = geometryOptionsFromSetup(policies.pageSetup);
  const preambleLines = [
    "\\documentclass[11pt]{article}",
    "\\usepackage{amsmath,amssymb,amsthm}",
    "\\usepackage{graphicx}",
    `\\usepackage[${geometryOptions.join(", ") || "margin=1in"}]{geometry}`,
    ...(policies.microtype ? ["\\usepackage{microtype}"] : []),
    ...(document.blocks.some((block) => containsTikzPicture(block.latex)) ? ["\\usepackage{tikz}"] : []),
    ...preambleContent,
  ];

  const declarations = usedTheoremEnvs(document.blocks)
    .map((env) => `\\newtheorem{${env}}{${THEOREM_LABELS[env]}}`);

  const lines = [
    ...preambleLines,
    ...declarations,
    "",
    `\\title{${document.title}}`,
    "\\date{}",
    "\\begin{document}",
    "\\maketitle",
    "",
    serializeBlocks(document.blocks.filter((block) => block.type !== "preamble")),
    "",
    "\\end{document}",
  ];

  return lines.join("\n");
}

function usedTheoremEnvs(blocks: Array<{ type: BlockType; latex: string }>): string[] {
  const envs = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "theorem") continue;
    const match = /\\begin\{([a-zA-Z*]+)\}/.exec(block.latex);
    if (match && THEOREM_LABELS[match[1]]) envs.add(match[1]);
  }
  return [...envs];
}
