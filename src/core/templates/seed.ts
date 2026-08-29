import { createId } from "@/lib/ids";
import type { DocumentRecord, ParsedSegment } from "@/core/blocks/types";
import { segmentsToBlocks } from "./index";

const SEED_SEGMENTS: ParsedSegment[] = [
  {
    type: "preamble",
    latex: "\\usepackage[a4paper, margin=25mm]{geometry}\n\\usepackage{microtype}\n\\newcommand{\\dv}{\\mathbf{v}}\n\\DeclareMathOperator{\\Var}{Var}",
  },
  {
    type: "text",
    latex: "This pad is live: every block renders as you or your agent edits it. Ask your agent to \\textbf{list the render errors in this document}: one block below contains a deliberate typo it can find and fix.",
  },
  { type: "text", latex: "\\section{Integration by parts}" },
  {
    type: "text",
    latex: "We evaluate $I = \\int_0^1 x e^x\\,dx$ using integration by parts with $u = x$ and $\\dv = e^x\\,dx$. The picture below shows the region whose area the integral computes.",
  },
  {
    type: "figure",
    latex: [
      "\\begin{tikzpicture}[scale=0.85]",
      "\\draw[->] (0,0) -- (3.4,0) node[right] {$x$};",
      "\\draw[->] (0,0) -- (0,2.9) node[above] {$x e^x$};",
      "\\fill[blue!15] plot coordinates {(0,0) (0.4,0.6) (0.8,1.78) (1,2.72)} -- (1,0) -- cycle;",
      "\\draw[thick, blue] plot coordinates {(0,0) (0.4,0.6) (0.8,1.78) (1,2.72)};",
      "\\draw[dashed] (1,0) -- (1,2.72);",
      "\\node[below] at (1,0) {$1$};",
      "\\end{tikzpicture}",
    ].join("\n"),
  },
  {
    type: "align",
    latex: "\\begin{align}\\label{eq:value}\nI &= \\big[ x e^x \\big]_0^1 - \\int_0^1 e^x\\,dx \\\\\n&= e - \\big[ e^x \\big]_0^1 \\\\\n&= e - (e - 1) \\\\\n&= \\alpa \\cdot 0 + 1\n\\end{align}",
  },
  {
    type: "theorem",
    latex: "\\begin{theorem}[Integration by parts]\\label{thm:ibp}\nIf $u$ and $v$ are differentiable, then $\\int u\\,\\dv = uv - \\int v\\,du$.\n\\end{theorem}",
  },
  {
    type: "text",
    latex: "Every step of \\eqref{eq:value} is an application of Theorem \\ref{thm:ibp}. Edit any line in the source pane to see the numbering and references update live, or open the \\textbf{Tool Inspector} to call the same WebMCP tools your agent uses.",
  },
];

export function createSeedDocument(now = Date.now()): DocumentRecord {
  const blocks = segmentsToBlocks(SEED_SEGMENTS, now);
  const errorBlock = blocks.find(
    (block) => block.type === "align" && block.latex.includes("\\alpa"),
  );
  const theoremBlock = blocks.find((block) => block.type === "theorem");

  const threads: DocumentRecord["threads"] = [
    {
      id: createId("cmt"),
      blockId: errorBlock?.id ?? blocks[0].id,
      quote: "\\alpa",
      resolved: false,
      comments: [
        {
          id: createId("cmt"),
          author: "agent",
          text: "Step 4 contains \\alpa, which KaTeX does not recognize. Ask me to fix the render errors in this document and I will correct it to \\alpha.",
          createdAt: now,
        },
      ],
    },
  ];

  if (theoremBlock) {
    threads.push({
      id: createId("cmt"),
      blockId: theoremBlock.id,
      resolved: true,
      resolvedAt: now,
      comments: [
        {
          id: createId("cmt"),
          author: "user",
          text: "Can you state this in words?",
          createdAt: now,
        },
        {
          id: createId("cmt"),
          author: "agent",
          text: "Integrating one factor while differentiating the other trades the original integral for a (hopefully) simpler one.",
          createdAt: now,
        },
      ],
    });
  }

  return {
    id: createId("doc"),
    title: "Live demo · integration by parts",
    blocks,
    threads,
    createdAt: now,
    updatedAt: now,
  };
}
