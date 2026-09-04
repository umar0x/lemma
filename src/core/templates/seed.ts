import { createId } from "@/lib/ids";
import type { DocumentRecord, ParsedSegment } from "@/core/blocks/types";
import { segmentsToBlocks } from "./index";

const SEED_SEGMENTS: ParsedSegment[] = [
  {
    type: "preamble",
    latex: "\\usepackage[a4paper, margin=25mm]{geometry}\n\\usepackage{microtype}",
  },
  {
    type: "text",
    latex: "\\section*{Welcome to Lemma}",
  },
  {
    type: "text",
    latex: "Lemma is a collaborative, live \\LaTeX workspace where users and agents create and edit documents together.",
  },
  {
    type: "text",
    latex: "\\subsection*{Get started}",
  },
  {
    type: "text",
    latex: "\\begin{itemize}\n  \\item \\textbf{New document}: press \\emph{New document} in the sidebar and pick a template (notes, problem set, exam, or blank).\n  \\item \\textbf{With an agent}: ask it to create a document, add equations, fix render errors, or restructure sections. The agent edits by stable block ID and sees live KaTeX output as structured feedback.\n  \\item \\textbf{Tool Inspector}: click the terminal icon in the toolbar to call any WebMCP tool yourself.\n\\end{itemize}",
  },
];

export function createSeedDocument(now = Date.now()): DocumentRecord {
  const blocks = segmentsToBlocks(SEED_SEGMENTS, now);

  return {
    id: createId("doc"),
    title: "Welcome",
    blocks,
    threads: [],
    createdAt: now,
    updatedAt: now,
  };
}
