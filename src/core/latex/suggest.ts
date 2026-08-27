const COMMON_COMMANDS = [
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta",
  "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma", "tau", "upsilon", "phi",
  "varphi", "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma",
  "Upsilon", "Phi", "Psi", "Omega",
  "frac", "dfrac", "tfrac", "sqrt", "sum", "prod", "int", "iint", "oint", "lim", "infty",
  "times", "div", "cdot", "pm", "mp", "leq", "geq", "neq", "approx", "equiv", "sim", "simeq",
  "propto", "ll", "gg", "subset", "supset", "subseteq", "supseteq", "in", "notin", "ni",
  "cup", "cap", "setminus", "emptyset", "varnothing", "forall", "exists", "nexists",
  "rightarrow", "to", "leftarrow", "gets", "leftrightarrow", "Rightarrow", "Leftarrow",
  "Leftrightarrow", "mapsto", "longmapsto", "hookrightarrow", "rightleftharpoons",
  "uparrow", "downarrow", "nearrow", "searrow", "swarrow", "nwarrow",
  "mathbb", "mathbf", "mathcal", "mathfrak", "mathscr", "mathsf", "mathtt", "mathrm",
  "boldsymbol", "hat", "bar", "vec", "dot", "ddot", "tilde", "widehat", "widetilde", "overline",
  "underline", "overbrace", "underbrace", "stackrel", "overset", "underset",
  "text", "textbf", "textit", "textrm", "textsf", "texttt", "operatorname",
  "left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "langle", "rangle",
  "begin", "end", "aligned", "alignedat", "cases", "matrix", "pmatrix", "bmatrix", "vmatrix",
  "array", "gather", "gathered", "split", "substack", "atop", "binom", "choose",
  "partial", "nabla", "angle", "perp", "parallel", "mid", "vdash", "dashv", "models",
  "because", "therefore", "ldots", "cdots", "vdots", "ddots", "dots",
  "prime", "circ", "bullet", "star", "ast", "oplus", "ominus", "otimes", "oslash", "odot",
  "aleph", "beth", "ell", "hbar", "imath", "jmath", "wp", "Re", "Im", "aleph",
  "deg", "circ", "det", "dim", "exp", "gcd", "hom", "ker", "lg", "ln", "log", "max", "min",
  "Pr", "sec", "sin", "cos", "tan", "cot", "sinh", "cosh", "tanh", "arcsin", "arccos", "arctan",
  "sup", "inf", "arg", "limsup", "liminf",
];

const COMMAND_SET = new Set(COMMON_COMMANDS);

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export function suggestCommand(name: string): string | null {
  if (!name) return null;
  let best: string | null = null;
  let bestDistance = Math.max(2, Math.floor(name.length / 3));
  for (const candidate of COMMAND_SET) {
    if (candidate === name) continue;
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}
