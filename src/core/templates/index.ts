import { createId } from "@/lib/ids";
import { deriveBlockType } from "@/core/blocks/parse";
import type { Block, DocumentRecord, ParsedSegment } from "@/core/blocks/types";

export type TemplateId = "blank" | "notes" | "problem_set" | "exam" | "paper_section" | "demo";

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  build: (title: string) => ParsedSegment[];
}

const STANDARD_PREAMBLE = [
  "\\usepackage[a4paper, margin=25mm]{geometry}",
  "\\usepackage{microtype}",
];

const templates: TemplateDefinition[] = [
  {
    id: "blank",
    name: "Blank pad",
    description: "An empty document with the standard page setup.",
    build: () => [
      { type: "preamble", latex: STANDARD_PREAMBLE.join("\n") },
      { type: "text", latex: "% Your document starts here." },
    ],
  },
  {
    id: "notes",
    name: "Lecture notes",
    description: "Definitions, a TikZ figure, a worked derivation, and a labeled theorem.",
    build: () => [
      { type: "preamble", latex: [...STANDARD_PREAMBLE, "\\newcommand{\\dv}{\\mathbf{v}}"].join("\n") },
      { type: "text", latex: "\\section{Overview}" },
      {
        type: "text",
        latex: "These notes introduce the accumulation function and the fundamental theorem of calculus, then work through the standard derivation step by step. The figure below sketches the setup: a smooth curve, the area accumulating beneath it, and the critical point marked where the rate of accumulation peaks.",
      },
      {
        type: "theorem",
        latex: "\\begin{definition}[Accumulation function]\\label{def:acc}\nGiven an integrable $g$ on $[a,b]$, the accumulation function of $g$ is $f(x) = \\int_a^x g(t)\\,dt$ for $x \\in [a,b]$.\n\\end{definition}",
      },
      {
        type: "figure",
        latex: [
          "\\begin{tikzpicture}[scale=0.9]",
          "\\draw[->] (0,0) -- (4.5,0) node[right] {$t$};",
          "\\draw[->] (0,0) -- (0,3) node[above] {$f(t)$};",
          "\\fill[blue!12] plot coordinates {(0,0) (0.8,1.9) (1.6,2.1) (2.5,1.8) (3.3,1.5) (4,1.2)} -- (4,0) -- cycle;",
          "\\draw[thick, blue] plot coordinates {(0,0) (0.8,1.9) (1.6,2.1) (2.5,1.8) (3.3,1.5) (4,1.2)};",
          "\\draw[dashed] (1.6,0) -- (1.6,2.1) node[above left] {$f(t^\\ast)$};",
          "\\fill[red] (1.6,2.1) circle (0.06);",
          "\\node[below] at (1.6,0) {$t^\\ast$};",
          "\\end{tikzpicture}",
        ].join("\n"),
      },
      { type: "equation", latex: "\\[ f(x) = \\int_0^x g(t)\\,dt \\]" },
      { type: "text", latex: "\\section{Derivation}" },
      {
        type: "text",
        latex: "By Definition \\ref{def:acc} with a continuous $g$, two applications of the linearity of the integral and one application of integration by parts give the identity below.",
      },
      {
        type: "align",
        latex: "\\begin{align}\\label{eq:ibp}\n\\frac{d}{dx} \\int_0^x g(t)\\,dt &= g(x) \\\\\n\\int u\\,\\dv &= uv - \\int v\\,du\n\\end{align}",
      },
      {
        type: "theorem",
        latex: "\\begin{theorem}[Fundamental theorem]\\label{thm:ftc}\nIf $g$ is continuous on $[a,b]$, then $f(x) = \\int_a^x g(t)\\,dt$ is differentiable on $(a,b)$ and $f'(x) = g(x)$.\n\\end{theorem}",
      },
      {
        type: "theorem",
        latex: "\\begin{proof}\nFix $x_0 \\in (a,b)$ and let $\\Delta x$ be small enough that $x_0 + \\Delta x \\in (a,b)$. Then\n\\[ f(x_0 + \\Delta x) - f(x_0) = \\int_{x_0}^{x_0 + \\Delta x} g(t)\\,dt = g(\\xi)\\,\\Delta x \\]\nfor some $\\xi$ between $x_0$ and $x_0 + \\Delta x$, by the mean value theorem for integrals. Letting $\\Delta x \\to 0$ forces $\\xi \\to x_0$, and continuity of $g$ gives $f'(x_0) = g(x_0)$.\n\\end{proof}",
      },
      {
        type: "text",
        latex: "Equation \\eqref{eq:ibp} is an application of Theorem \\ref{thm:ftc}. The key takeaway: differentiation and accumulation are inverse operations.",
      },
      {
        type: "text",
        latex: "\\begin{itemize}\n\\item \\textbf{Rates from totals:} recover a rate $g$ from a total $f$ by differentiating.\n\\item \\textbf{Totals from rates:} recover a total $f$ from a rate $g$ by integrating.\n\\item \\textbf{Boundary terms:} when either endpoint moves, track it explicitly, as in \\eqref{eq:ibp}.\n\\end{itemize}",
      },
    ],
  },
  {
    id: "problem_set",
    name: "Problem set",
    description: "Numbered problems with parts, hints, and a labeled geometry figure.",
    build: (title) => [
      { type: "preamble", latex: STANDARD_PREAMBLE.join("\n") },
      {
        type: "text",
        latex: `\\begin{center}\\textbf{${title}}\\\\[4pt] \\today\\end{center}`,
      },
      {
        type: "text",
        latex: "Complete all problems. Show your work and justify each step. Collaboration is allowed, but the write-up must be your own.",
      },
      { type: "text", latex: "\\section*{Problem 1 (20 points)}" },
      {
        type: "text",
        latex: "Evaluate the following integrals using the indicated technique.",
      },
      {
        type: "text",
        latex: "\\begin{enumerate}\n\\item[(a)] $\\int_0^1 x e^x\\,dx$ (integration by parts)\n\\item[(b)] $\\int_0^{\\pi/2} \\sin^3 x\\,dx$ (a trigonometric identity)\n\\item[(c)] $\\int_1^e \\ln x\\,dx$ (parts, choosing $u = \\ln x$)\n\\end{enumerate}",
      },
      {
        type: "align",
        latex: "\\begin{align}\\label{eq:setup}\nI &= \\int_0^1 x e^x\\,dx = \\big[ x e^x \\big]_0^1 - \\int_0^1 e^x\\,dx\n\\end{align}",
      },
      { type: "text", latex: "\\emph{Hint: each part reduces to an antiderivative you already know.}" },
      { type: "text", latex: "\\section*{Problem 2 (30 points)}" },
      {
        type: "figure",
        latex: [
          "\\begin{tikzpicture}",
          "\\draw[thick] (0,0) -- (5,0) -- (2,3) -- cycle;",
          "\\node[below left] at (0,0) {$A$};",
          "\\node[below right] at (5,0) {$B$};",
          "\\node[above] at (2,3) {$C$};",
          "\\draw[dashed] (2,0) -- (2,3);",
          "\\node[below] at (2,0) {$D$};",
          "\\node[right] at (2,1.5) {$h$};",
          "\\node[below] at (3.5,0) {$a$};",
          "\\end{tikzpicture}",
        ].join("\n"),
      },
      {
        type: "text",
        latex: "Triangle $ABC$ has base $a = \\lvert AB \\rvert$ and altitude $h = \\lvert CD \\rvert$ as drawn above.",
      },
      {
        type: "text",
        latex: "\\begin{enumerate}\n\\item[(a)] Prove that $\\sqrt{2}$ is irrational.\n\\item[(b)] Compute the area of triangle $ABD$ in terms of $a$ and $h$, and explain why it is exactly half the area of $ABC$.\n\\item[(c)] Prove that the altitude from the right angle of an isosceles right triangle bisects the hypotenuse.\n\\end{enumerate}",
      },
      { type: "text", latex: "\\section*{Problem 3 (50 points)}" },
      {
        type: "equation",
        latex: "\\[ \\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n \\]",
      },
      {
        type: "text",
        latex: "Evaluate the limit above and prove your answer. You may use the binomial theorem and the squeeze theorem, but not the claim itself.",
      },
      {
        type: "text",
        latex: "\\emph{Hint: expand $\\left(1 + \\frac{1}{n}\\right)^n$ with the binomial theorem and bound each summand between two expressions whose limits you can compute.}",
      },
    ],
  },
  {
    id: "exam",
    name: "Exam",
    description: "Instructions header, grading table, timed sections, and diagrams.",
    build: (title) => [
      { type: "preamble", latex: STANDARD_PREAMBLE.join("\n") },
      {
        type: "text",
        latex: `\\begin{center}\\textbf{${title}}\\\\[4pt] Time: 90 minutes. No calculators.\\end{center}`,
      },
      {
        type: "text",
        latex: "Read each problem carefully. Point values are shown in the table below. Partial credit is given for correct methods with minor arithmetic slips, so show every step.",
      },
      {
        type: "table",
        latex: "\\begin{tabular}{|c|c|c|}\n\\hline\nProblem & Points & Score \\\\\n\\hline\n1 & 25 & \\\\\n2 & 35 & \\\\\n3 & 40 & \\\\\n\\hline\n\\textbf{Total} & \\textbf{100} & \\\\\n\\hline\n\\end{tabular}",
      },
      { type: "text", latex: "\\section*{Problem 1 (25 points)}" },
      {
        type: "text",
        latex: "Let $f(x) = x^3 - 3x + 1$.",
      },
      {
        type: "text",
        latex: "\\begin{enumerate}\n\\item[(a)] Find all critical points and classify each as a local maximum, local minimum, or neither.\n\\item[(b)] Sketch the graph, marking intercepts and the critical values you found.\n\\end{enumerate}",
      },
      {
        type: "figure",
        latex: [
          "\\begin{tikzpicture}",
          "\\draw[->] (-3,0) -- (3,0) node[right] {$x$};",
          "\\draw[->] (0,-2) -- (0,3.5) node[above] {$y$};",
          "\\draw[gray!40, dashed] (-2,-1) grid[step=1] (2,3);",
          "\\draw[thick, blue] plot coordinates {(-2.2,-2.6) (-1.7,1.2) (-1,3) (0,1) (1,-1) (1.7,0.8) (2.2,2.6)};",
          "\\fill[red] (-1,3) circle (0.07);",
          "\\fill[red] (1,-1) circle (0.07);",
          "\\node[above left] at (-1,3) {$f(-1) = 3$};",
          "\\node[below right] at (1,-1) {$f(1) = -1$};",
          "\\end{tikzpicture}",
        ].join("\n"),
      },
      { type: "text", latex: "\\section*{Problem 2 (35 points)}" },
      {
        type: "align",
        latex: "\\begin{align}\n\\int \\frac{dx}{x^2 - a^2} &= \\frac{1}{2a} \\ln\\left| \\frac{x-a}{x+a} \\right| + C\n\\end{align}",
      },
      {
        type: "text",
        latex: "Derive the partial fraction decomposition above, then use it to evaluate $\\int_3^5 \\frac{dx}{x^2 - 1}$.",
      },
      { type: "text", latex: "\\section*{Problem 3 (40 points)}" },
      {
        type: "theorem",
        latex: "\\begin{theorem}[Mean value theorem]\nState the mean value theorem precisely, with all hypotheses, and use it to prove that $|\\sin b - \\sin a| \\leq |b - a|$ for all real $a, b$.\n\\end{theorem}",
      },
      {
        type: "text",
        latex: "\\emph{Check your work: every claim you use should be either a theorem from the course or derived on this page.}",
      },
    ],
  },
  {
    id: "paper_section",
    name: "Paper section",
    description: "Abstract, theorems with proofs, references, and a convergence plot.",
    build: () => [
      { type: "preamble", latex: [...STANDARD_PREAMBLE, "\\DeclareMathOperator{\\Var}{Var}"].join("\n") },
      {
        type: "text",
        latex: "\\begin{abstract}\nWe study the convergence properties of the least-squares estimator in a fixed-design linear model and establish sharp non-asymptotic rates under mild regularity conditions. The proof combines a concentration inequality for sub-Gaussian noise with a standard covering argument on the design space.\n\\end{abstract}",
      },
      { type: "text", latex: "\\section{Introduction}" },
      {
        type: "text",
        latex: "Consider the fixed-design linear model $y = X\\beta + \\varepsilon$, where $\\varepsilon$ is mean-zero noise with variance $\\sigma^2$, independent across observations. We are interested in how fast the ordinary least-squares estimator $\\hat{\\beta}_n$ approaches the true coefficient vector as the sample size $n$ grows, and in what sense the residual variance estimate $\\hat{\\sigma}^2$ becomes reliable.",
      },
      { type: "text", latex: "\\section{Model and assumptions}" },
      {
        type: "text",
        latex: "\\begin{itemize}\n\\item[(A1)] The noise $\\varepsilon_i$ is independent, mean-zero, and sub-Gaussian with proxy $\\sigma^2$.\n\\item[(A2)] The design matrix $X \\in \\mathbb{R}^{n \\times p}$ has full column rank, with smallest singular value $s_{\\min}(X) \\geq c\\sqrt{n}$.\n\\item[(A3)] The dimension $p$ is fixed as $n \\to \\infty$, or grows slowly enough that $p \\log n / n \\to 0$.\n\\end{itemize}",
      },
      { type: "text", latex: "\\section{Main result}" },
      {
        type: "theorem",
        latex: "\\begin{theorem}[Consistency]\\label{thm:consistency}\nUnder assumptions (A1) through (A3), the estimator $\\hat{\\beta}_n$ satisfies $\\hat{\\beta}_n \\to \\beta$ almost surely, and $\\hat{\\sigma}^2$ is an unbiased estimate of $\\sigma^2$.\n\\end{theorem}",
      },
      {
        type: "align",
        latex: "\\begin{align}\\label{eq:rate}\n\\|\\hat{\\beta}_n - \\beta\\|_2 &\\leq C \\sigma \\sqrt{\\frac{p}{n}} + O_p(n^{-1}) \\\\\n\\hat{\\sigma}^2 &= \\frac{1}{n-p} \\|y - X\\hat{\\beta}\\|_2^2, \\quad \\Var(\\hat{\\sigma}^2) \\leq \\frac{C' \\sigma^4}{n}\n\\end{align}",
      },
      {
        type: "figure",
        latex: [
          "\\begin{tikzpicture}",
          "\\draw[->] (0,0) -- (5,0) node[right] {$n$};",
          "\\draw[->] (0,0) -- (0,3) node[above] {error};",
          "\\draw[gray!40, dashed] (0,0) grid[step=1] (5,3);",
          "\\draw[thick, red] plot coordinates {(0.5,2.8) (1,2.1) (2,1.4) (3,0.9) (4,0.55) (4.8,0.4)};",
          "\\draw[dashed, gray] (0,1.8) -- (5,0.3);",
          "\\node[right, gray] at (5,0.3) {$C\\sqrt{p/n}$};",
          "\\node[left, red] at (0.5,2.8) {observed};",
          "\\end{tikzpicture}",
        ].join("\n"),
      },
      {
        type: "text",
        latex: "The figure above compares the observed error of $\\hat{\\beta}_n$ against the theoretical envelope $C\\sqrt{p/n}$ from \\eqref{eq:rate}: the two curves track each other closely, which is the visual form of Theorem \\ref{thm:consistency}.",
      },
      {
        type: "theorem",
        latex: "\\begin{proof}\nThe argument proceeds in two steps. First, a sub-Gaussian tail bound applied to the noise vector gives $\\|X^\\top \\varepsilon\\|_2 \\leq C\\sigma\\sqrt{pn}$ with probability at least $1 - e^{-cn}$; combined with (A2) this yields the first display of \\eqref{eq:rate}. Second, the residual decomposition $y - X\\hat{\\beta} = (I - P_X)\\varepsilon$ shows the residual sum of squares is a quadratic form with trace $n - p$, which gives unbiasedness of $\\hat{\\sigma}^2$ and the variance bound. See the rate in \\eqref{eq:rate} and the claim of Theorem \\ref{thm:consistency}.\n\\end{proof}",
      },
      { type: "text", latex: "\\section{Discussion}" },
      {
        type: "text",
        latex: "The rate in \\eqref{eq:rate} is minimax up to constants, so no estimator in this class does meaningfully better under (A1) through (A3). Dropping sub-Gaussianity in favor of only finite variance slows the rate, and we leave the heavy-tailed extension open.",
      },
    ],
  },
  {
    id: "demo",
    name: "Demo · integration by parts",
    description: "Worked example with a deliberate typo for an agent to find and fix.",
    build: () => [
      {
        type: "preamble",
        latex: [...STANDARD_PREAMBLE, "\\newcommand{\\dv}{\\mathbf{v}}", "\\DeclareMathOperator{\\Var}{Var}"].join("\n"),
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
        latex: "Every step of \\eqref{eq:value} is an application of Theorem \\ref{thm:ibp}. Edit any line in the source pane to see the numbering and references update live.",
      },
    ],
  },
];

export function getTemplate(id: TemplateId): TemplateDefinition {
  const template = templates.find((t) => t.id === id);
  if (!template) throw new Error(`Unknown template: ${id}`);
  return template;
}

export function listTemplates(): TemplateDefinition[] {
  return templates;
}

export function buildTemplateSegments(id: TemplateId, title: string): ParsedSegment[] {
  return getTemplate(id).build(title);
}

export function segmentsToBlocks(segments: ParsedSegment[], now = Date.now()): Block[] {
  return segments.map((segment) => ({
    id: createId("blk"),
    type: deriveBlockType(segment.latex, segment.type),
    latex: segment.latex,
    lastEditedBy: "user",
    lastEditedAt: now,
  }));
}

export function createDocumentFromTemplate(
  id: TemplateId,
  title: string,
  now = Date.now(),
): DocumentRecord {
  return {
    id: createId("doc"),
    title,
    blocks: segmentsToBlocks(buildTemplateSegments(id, title), now),
    threads: [],
    createdAt: now,
    updatedAt: now,
  };
}
