import { Completion, CompletionContext } from "@codemirror/autocomplete";

interface CommandSpec {
  name: string;
  detail?: string;
  apply?: string;
}

const COMMAND_SPECS: CommandSpec[] = [
  { name: "alpha", detail: "α" },
  { name: "beta", detail: "β" },
  { name: "gamma", detail: "γ" },
  { name: "delta", detail: "δ" },
  { name: "epsilon", detail: "ε" },
  { name: "varepsilon", detail: "ε" },
  { name: "zeta", detail: "ζ" },
  { name: "eta", detail: "η" },
  { name: "theta", detail: "θ" },
  { name: "iota", detail: "ι" },
  { name: "kappa", detail: "κ" },
  { name: "lambda", detail: "λ" },
  { name: "mu", detail: "μ" },
  { name: "nu", detail: "ν" },
  { name: "xi", detail: "ξ" },
  { name: "pi", detail: "π" },
  { name: "rho", detail: "ρ" },
  { name: "sigma", detail: "σ" },
  { name: "tau", detail: "τ" },
  { name: "phi", detail: "φ" },
  { name: "varphi", detail: "ϕ" },
  { name: "chi", detail: "χ" },
  { name: "psi", detail: "ψ" },
  { name: "omega", detail: "ω" },
  { name: "Gamma", detail: "Γ" },
  { name: "Delta", detail: "Δ" },
  { name: "Theta", detail: "Θ" },
  { name: "Lambda", detail: "Λ" },
  { name: "Xi", detail: "Ξ" },
  { name: "Pi", detail: "Π" },
  { name: "Sigma", detail: "Σ" },
  { name: "Phi", detail: "Φ" },
  { name: "Psi", detail: "Ψ" },
  { name: "Omega", detail: "Ω" },
  { name: "frac", detail: "a/b" },
  { name: "dfrac", detail: "a/b display" },
  { name: "tfrac", detail: "a/b text" },
  { name: "sqrt", detail: "√" },
  { name: "sum", detail: "∑" },
  { name: "prod", detail: "∏" },
  { name: "int", detail: "∫" },
  { name: "iint", detail: "∬" },
  { name: "oint", detail: "∮" },
  { name: "lim", detail: "limit" },
  { name: "infty", detail: "∞" },
  { name: "partial", detail: "∂" },
  { name: "nabla", detail: "∇" },
  { name: "times", detail: "×" },
  { name: "div", detail: "÷" },
  { name: "cdot", detail: "·" },
  { name: "pm", detail: "±" },
  { name: "mp", detail: "∓" },
  { name: "leq", detail: "≤" },
  { name: "geq", detail: "≥" },
  { name: "neq", detail: "≠" },
  { name: "approx", detail: "≈" },
  { name: "equiv", detail: "≡" },
  { name: "sim", detail: "∼" },
  { name: "propto", detail: "∝" },
  { name: "ll", detail: "≪" },
  { name: "gg", detail: "≫" },
  { name: "subset", detail: "⊂" },
  { name: "supset", detail: "⊃" },
  { name: "subseteq", detail: "⊆" },
  { name: "supseteq", detail: "⊇" },
  { name: "in", detail: "∈" },
  { name: "notin", detail: "∉" },
  { name: "ni", detail: "∋" },
  { name: "cup", detail: "∪" },
  { name: "cap", detail: "∩" },
  { name: "setminus", detail: "∖" },
  { name: "emptyset", detail: "∅" },
  { name: "varnothing", detail: "∅" },
  { name: "forall", detail: "∀" },
  { name: "exists", detail: "∃" },
  { name: "nexists", detail: "∄" },
  { name: "rightarrow", detail: "→" },
  { name: "to", detail: "→" },
  { name: "leftarrow", detail: "←" },
  { name: "gets", detail: "←" },
  { name: "leftrightarrow", detail: "↔" },
  { name: "Rightarrow", detail: "⇒" },
  { name: "Leftarrow", detail: "⇐" },
  { name: "Leftrightarrow", detail: "⇔" },
  { name: "mapsto", detail: "↦" },
  { name: "longmapsto", detail: "⟼" },
  { name: "hookrightarrow", detail: "↪" },
  { name: "uparrow", detail: "↑" },
  { name: "downarrow", detail: "↓" },
  { name: "mathbb", detail: "blackboard" },
  { name: "mathbf", detail: "bold" },
  { name: "mathcal", detail: "calligraphic" },
  { name: "mathfrak", detail: "fraktur" },
  { name: "mathscr", detail: "script" },
  { name: "mathrm", detail: "roman" },
  { name: "boldsymbol", detail: "bold symbol" },
  { name: "hat", detail: "x̂" },
  { name: "bar", detail: "x̄" },
  { name: "vec", detail: "x⃗" },
  { name: "dot", detail: "ẋ" },
  { name: "ddot", detail: "ẍ" },
  { name: "tilde", detail: "x̃" },
  { name: "widehat", detail: "wide x̂" },
  { name: "widetilde", detail: "wide x̃" },
  { name: "overline", detail: "overline" },
  { name: "underline", detail: "underline" },
  { name: "overbrace", detail: "overbrace" },
  { name: "underbrace", detail: "underbrace" },
  { name: "stackrel", detail: "stack" },
  { name: "overset", detail: "overset" },
  { name: "underset", detail: "underset" },
  { name: "text", detail: "text in math" },
  { name: "textbf", detail: "bold text" },
  { name: "textit", detail: "italic text" },
  { name: "operatorname", detail: "operator" },
  { name: "left", detail: "left delimiter" },
  { name: "right", detail: "right delimiter" },
  { name: "langle", detail: "⟨" },
  { name: "rangle", detail: "⟩" },
  { name: "ldots", detail: "…" },
  { name: "cdots", detail: "⋯" },
  { name: "vdots", detail: "⋮" },
  { name: "ddots", detail: "⋱" },
  { name: "dots", detail: "…" },
  { name: "binom", detail: "binomial" },
  { name: "substack", detail: "substack" },
  { name: "atop", detail: "atop" },
  { name: "angle", detail: "∠" },
  { name: "perp", detail: "⊥" },
  { name: "parallel", detail: "∥" },
  { name: "mid", detail: "∣" },
  { name: "vdash", detail: "⊢" },
  { name: "models", detail: "⊨" },
  { name: "therefore", detail: "∴" },
  { name: "because", detail: "∵" },
  { name: "aleph", detail: "ℵ" },
  { name: "ell", detail: "ℓ" },
  { name: "hbar", detail: "ℏ" },
  { name: "imath", detail: "ı" },
  { name: "jmath", detail: "ȷ" },
  { name: "Re", detail: "ℜ" },
  { name: "Im", detail: "ℑ" },
  { name: "deg", detail: "°" },
  { name: "sin", detail: "sin" },
  { name: "cos", detail: "cos" },
  { name: "tan", detail: "tan" },
  { name: "cot", detail: "cot" },
  { name: "sec", detail: "sec" },
  { name: "csc", detail: "csc" },
  { name: "sinh", detail: "sinh" },
  { name: "cosh", detail: "cosh" },
  { name: "tanh", detail: "tanh" },
  { name: "arcsin", detail: "arcsin" },
  { name: "arccos", detail: "arccos" },
  { name: "arctan", detail: "arctan" },
  { name: "ln", detail: "ln" },
  { name: "log", detail: "log" },
  { name: "exp", detail: "exp" },
  { name: "det", detail: "det" },
  { name: "dim", detail: "dim" },
  { name: "ker", detail: "ker" },
  { name: "gcd", detail: "gcd" },
  { name: "sup", detail: "sup" },
  { name: "inf", detail: "inf" },
  { name: "arg", detail: "arg" },
  { name: "min", detail: "min" },
  { name: "max", detail: "max" },
  { name: "label", detail: "label for \\ref" },
  { name: "ref", detail: "reference" },
  { name: "eqref", detail: "(reference)" },
  { name: "textbf", detail: "bold" },
  { name: "emph", detail: "emphasis" },
  { name: "texttt", detail: "typewriter" },
  { name: "underline", detail: "underline" },
  { name: "href", detail: "hyperlink" },
  { name: "url", detail: "url" },
  { name: "footnote", detail: "footnote" },
  { name: "item", detail: "list item" },
  { name: "ce", detail: "mhchem formula" },
  { name: "tag", detail: "equation tag" },
];

interface EnvironmentSpec {
  name: string;
  detail: string;
  body: string;
}

const ENVIRONMENT_SPECS: EnvironmentSpec[] = [
  { name: "align", detail: "aligned equations", body: "align" },
  { name: "align*", detail: "aligned, unnumbered", body: "align*" },
  { name: "equation", detail: "numbered equation", body: "equation" },
  { name: "equation*", detail: "unnumbered equation", body: "equation*" },
  { name: "gather", detail: "centered lines", body: "gather" },
  { name: "gather*", detail: "centered, unnumbered", body: "gather*" },
  { name: "cases", detail: "case distinctions", body: "cases" },
  { name: "pmatrix", detail: "(matrix)", body: "pmatrix" },
  { name: "bmatrix", detail: "[matrix]", body: "bmatrix" },
  { name: "vmatrix", detail: "|matrix|", body: "vmatrix" },
  { name: "matrix", detail: "matrix", body: "matrix" },
  { name: "array", detail: "column spec", body: "array" },
  { name: "split", detail: "split equation", body: "split" },
  { name: "aligned", detail: "aligned (inline)", body: "aligned" },
  { name: "itemize", detail: "bullet list", body: "itemize" },
  { name: "enumerate", detail: "numbered list", body: "enumerate" },
  { name: "theorem", detail: "theorem", body: "theorem" },
  { name: "lemma", detail: "lemma", body: "lemma" },
  { name: "definition", detail: "definition", body: "definition" },
  { name: "proof", detail: "proof", body: "proof" },
  { name: "example", detail: "example", body: "example" },
  { name: "remark", detail: "remark", body: "remark" },
  { name: "tabular", detail: "table", body: "tabular" },
  { name: "figure", detail: "figure", body: "figure" },
  { name: "center", detail: "centered", body: "center" },
  { name: "quote", detail: "quotation", body: "quote" },
  { name: "abstract", detail: "abstract", body: "abstract" },
  { name: "verbatim", detail: "code", body: "verbatim" },
];

const TIKZ_ENVIRONMENT_SPECS: EnvironmentSpec[] = [
  {
    name: "tikzpicture",
    detail: "TikZ diagram",
    body: "tikzpicture",
  },
];

const TIKZ_SNIPPET_COMPLETIONS: Completion[] = [
  {
    label: "\\draw",
    type: "keyword",
    detail: "TikZ draw path",
    apply: "\\draw[->] (0,0) -- (2,1);",
    boost: 1,
  },
  {
    label: "\\node",
    type: "keyword",
    detail: "TikZ node with label",
    apply: "\\node[draw, circle] (a) at (0,0) {$A$};",
    boost: 1,
  },
  {
    label: "\\fill",
    type: "keyword",
    detail: "TikZ fill shape",
    apply: "\\fill[blue!20] (0,0) circle (1);",
    boost: 0,
  },
  {
    label: "\\coordinate",
    type: "keyword",
    detail: "TikZ named coordinate",
    apply: "\\coordinate (P) at (2,1);",
    boost: 0,
  },
  {
    label: "\\foreach",
    type: "keyword",
    detail: "TikZ loop",
    apply: "\\foreach \\x in {0,1,2} {\\draw (\\x,0) -- (\\x,1);}",
    boost: 0,
  },
];

function tikzEnvironmentCompletion(spec: EnvironmentSpec): Completion {
  return {
    label: `\\begin{${spec.name}}`,
    type: "keyword",
    detail: spec.detail,
    apply: [
      "\\begin{tikzpicture}",
      "\\draw[->] (0,0) -- (4,0) node[right] {$x$};",
      "\\draw[->] (0,0) -- (0,3) node[above] {$y$};",
      "\\end{tikzpicture}",
    ].join("\n"),
    boost: 2,
  };
}

const TIKZ_COMPLETIONS = [
  ...TIKZ_ENVIRONMENT_SPECS.map(tikzEnvironmentCompletion),
  ...TIKZ_SNIPPET_COMPLETIONS,
];

function commandCompletion(spec: CommandSpec): Completion {
  return {
    label: `\\${spec.name}`,
    type: "function",
    detail: spec.detail,
    boost: spec.name.length <= 5 ? 1 : 0,
  };
}

function environmentCompletion(spec: EnvironmentSpec): Completion {
  return {
    label: `\\begin{${spec.name}}`,
    type: "keyword",
    detail: spec.detail,
    apply: `\\begin{${spec.body}}\n\t\\end{${spec.body}}`,
    boost: 2,
  };
}

const COMMAND_COMPLETIONS = COMMAND_SPECS.map(commandCompletion);
const ENVIRONMENT_COMPLETIONS = ENVIRONMENT_SPECS.map(environmentCompletion);

export function latexCompletionSource(context: CompletionContext) {
  const word = context.matchBefore(/\\[a-zA-Z]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const typed = word.text;
  const options =
    typed === "\\"
      ? [...ENVIRONMENT_COMPLETIONS, ...TIKZ_COMPLETIONS, ...COMMAND_COMPLETIONS]
      : [...COMMAND_COMPLETIONS, ...ENVIRONMENT_COMPLETIONS, ...TIKZ_COMPLETIONS].filter((option) =>
          option.label.startsWith(typed),
        );

  return {
    from: word.from,
    options,
    validFor: /^\\[a-zA-Z]*$/,
  };
}
