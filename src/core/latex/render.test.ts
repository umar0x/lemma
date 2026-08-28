import { describe, expect, it } from "vitest";
import type { Block } from "@/core/blocks/types";
import { documentMacros, renderBlock, renderDocument, summarizeRenderErrors } from "./render";
import { suggestCommand } from "./suggest";

function block(latex: string, type: Block["type"], id = "blk_test"): Block {
  return { id, type, latex, lastEditedBy: "user", lastEditedAt: 0 };
}

describe("renderBlock equations", () => {
  it("renders a valid display equation", () => {
    const result = renderBlock(block("\\[ E = mc^2 \\]", "equation"));
    expect(result.status).toBe("ok");
    expect(result.html).toContain("katex");
  });

  it("captures undefined control sequences with a suggestion", () => {
    const result = renderBlock(block("\\[ \\alpa + \\beta \\]", "equation"));
    expect(result.status).toBe("error");
    expect(result.error?.message).toContain("Undefined control sequence: \\alpa");
    expect(result.error?.suggestion).toBe("\\alpha");
    expect(result.error?.position).toBeGreaterThan(0);
    expect(result.error?.context).toContain("\\alpa");
  });

  it("maps error positions to block coordinates", () => {
    const latex = "\\[ x + \\alpa \\]";
    const result = renderBlock(block(latex, "equation"));
    const expected = latex.indexOf("\\alpa");
    expect(result.error?.position).toBe(expected);
  });

  it("reports missing braces clearly", () => {
    const result = renderBlock(block("\\[ \\frac{1} \\]", "equation"));
    expect(result.status).toBe("error");
    expect(result.error?.message).toContain("}");
  });

  it("extracts labels without failing the render", () => {
    const result = renderBlock(block("\\[ a = b \\label{eq:main} \\]", "equation"));
    expect(result.status).toBe("ok");
    expect(result.meta?.labels).toEqual(["eq:main"]);
  });
});

describe("renderBlock align", () => {
  it("renders align environments", () => {
    const result = renderBlock(block("\\begin{align}a &= b \\\\ c &= d\\end{align}", "align"));
    expect(result.status).toBe("ok");
    expect(result.html).toContain("katex-display");
  });

  it("reports errors with block-relative positions", () => {
    const latex = "\\begin{align}\\int_0^1 \\alpa(x)\\,dx &= 1\\end{align}";
    const result = renderBlock(block(latex, "align"));
    expect(result.status).toBe("error");
    expect(result.error?.position).toBe(latex.indexOf("\\alpa"));
  });
});

describe("renderBlock text", () => {
  it("renders inline math within prose", () => {
    const result = renderBlock(block("The sum $a + b$ equals $c$.", "text"));
    expect(result.status).toBe("ok");
    expect(result.html).toContain("<p");
    expect(result.html).toContain("katex");
    expect(result.html.match(/<span class="katex"/g)?.length).toBe(2);
  });

  it("captures inline math errors with accurate positions", () => {
    const latex = "We compute $x + \\alpa$ now.";
    const result = renderBlock(block(latex, "text"));
    expect(result.status).toBe("error");
    expect(result.error?.position).toBe(latex.indexOf("\\alpa"));
  });

  it("renders itemize lists as html lists", () => {
    const result = renderBlock(
      block("\\begin{itemize}\n\\item First point\n\\item Second point\n\\end{itemize}", "text"),
    );
    expect(result.html).toContain("<ul");
    expect(result.html).toContain("<li>");
    expect(result.html).toContain("First point");
  });

  it("renders enumerated lists as ordered lists", () => {
    const result = renderBlock(
      block("\\begin{enumerate}\n\\item Solve for $x$\n\\item Verify\n\\end{enumerate}", "text"),
    );
    expect(result.html).toContain("<ol");
  });

  it("renders nested lists", () => {
    const result = renderBlock(
      block(
        "\\begin{itemize}\n\\item Outer\n\\begin{itemize}\n\\item Inner\n\\end{itemize}\n\\end{itemize}",
        "text",
      ),
    );
    expect(result.html.match(/<ul/g)?.length).toBe(2);
    expect(result.html).toContain("Inner");
  });

  it("renders section headings", () => {
    const result = renderBlock(block("\\section{Introduction}", "text"));
    expect(result.html).toContain('<h2 class="rt-heading rt-h2">');
    expect(result.html).toContain("Introduction");
  });

  it("strips comments from rendered output", () => {
    const result = renderBlock(block("Visible % hidden comment", "text"));
    expect(result.html).toContain("Visible");
    expect(result.html).not.toContain("hidden");
  });

  it("escapes html in text content", () => {
    const result = renderBlock(block("Use <script>alert(1)</script> carefully", "text"));
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("renders bold and italic formatting", () => {
    const result = renderBlock(block("This is \\textbf{bold} and \\emph{italic}.", "text"));
    expect(result.html).toContain("<strong>bold</strong>");
    expect(result.html).toContain("<em>italic</em>");
  });

  it("renders line breaks and ligatures", () => {
    const result = renderBlock(block("First line \\\\ next --- and --", "text"));
    expect(result.html).toContain("<br/>");
    expect(result.html).toContain("\u2014");
    expect(result.html).toContain("\u2013");
  });

  it("renders urls with safe protocols only", () => {
    const result = renderBlock(block("See \\url{https://example.com} and \\url{javascript:alert(1)}.", "text"));
    expect(result.html).toContain('href="https://example.com"');
    expect(result.html).not.toContain('href="javascript:');
  });
});

describe("renderBlock theorem", () => {
  it("renders a theorem with its kind label", () => {
    const result = renderBlock(block("\\begin{theorem}\nIf $a > b$ then $a - b > 0$.\n\\end{theorem}", "theorem"));
    expect(result.status).toBe("ok");
    expect(result.html).toContain("Theorem");
    expect(result.html).toContain("katex");
  });

  it("renders an optional theorem title", () => {
    const result = renderBlock(block("\\begin{lemma}[Zorn]\nStatement.\n\\end{lemma}", "theorem"));
    expect(result.html).toContain("Lemma");
    expect(result.html).toContain("Zorn");
  });

  it("marks proofs with a qed square", () => {
    const result = renderBlock(block("\\begin{proof}\nDone.\n\\end{proof}", "theorem"));
    expect(result.html).toContain("thm-qed");
  });
});

describe("renderBlock figure and table", () => {
  it("renders includegraphics as a named placeholder", () => {
    const result = renderBlock(
      block("\\begin{figure}\\includegraphics{plot.png}\\caption{Results}\\end{figure}", "figure"),
    );
    expect(result.status).toBe("ok");
    expect(result.html).toContain("plot.png");
    expect(result.html).toContain("Results");
    expect(result.meta?.image).toBe("plot.png");
  });

  it("renders tikz figures as inline svg", () => {
    const result = renderBlock(block("\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}", "figure"));
    expect(result.status).toBe("ok");
    expect(result.html).toContain("<svg");
    expect(result.html).toContain("tikz-figure");
  });

  it("keeps pgfplots figures unsupported", () => {
    const result = renderBlock(
      block("\\begin{tikzpicture}\\begin{axis}...\\end{axis}\\end{tikzpicture}", "figure"),
    );
    expect(result.status).toBe("unsupported");
    expect(result.meta?.unsupported?.join(",")).toContain("pgfplots");
  });

  it("reports broken tikz figures as render errors", () => {
    const result = renderBlock(block("\\begin{tikzpicture}\\end{tikzpicture}", "figure"));
    expect(result.status).toBe("error");
    expect(result.error?.message).toContain("Nothing drawable");
  });

  it("renders simple tabular tables", () => {
    const result = renderBlock(
      block("\\begin{tabular}{cc}\n\\hline\na & b \\\\\n1 & 2 \\\\\n\\hline\n\\end{tabular}", "table"),
    );
    expect(result.status).toBe("ok");
    expect(result.html).toContain("<table");
    expect(result.html.match(/<td[\s>]/g)?.length).toBe(4);
    expect(result.html).not.toContain("hline");
  });
});

describe("renderBlock preamble and code", () => {
  it("counts macro definitions in preamble blocks", () => {
    const result = renderBlock(
      block("\\newcommand{\\vecv}{\\mathbf{v}}\n\\DeclareMathOperator{\\lcm}{lcm}", "preamble"),
    );
    expect(result.meta?.macroCount).toBe(2);
  });

  it("renders verbatim code escaped", () => {
    const result = renderBlock(block("\\begin{verbatim}<b>raw</b>\\end{verbatim}", "code"));
    expect(result.html).toContain("&lt;b&gt;raw&lt;/b&gt;");
  });
});

describe("document-wide macros", () => {
  it("applies macros defined in preamble blocks to other blocks", () => {
    const blocks = [
      block("\\newcommand{\\vecv}{\\mathbf{v}}", "preamble", "blk_macro"),
      block("\\[ \\vecv + \\vecv \\]", "equation", "blk_eq"),
    ];
    const macros = documentMacros(blocks);
    expect(macros["\\vecv"]).toBe("\\mathbf{v}");
    const results = renderDocument(blocks);
    expect(results.get("blk_eq")?.status).toBe("ok");
    expect(results.get("blk_eq")?.html).toContain("mathbf");
  });

  it("counts error blocks across the document", () => {
    const blocks = [
      block("\\[ good \\]", "equation", "blk_1"),
      block("\\[ \\alpa \\]", "equation", "blk_2"),
      block("\\[ also good \\]", "equation", "blk_3"),
    ];
    const results = renderDocument(blocks);
    expect(summarizeRenderErrors(results)).toBe(1);
  });
});

describe("suggestCommand", () => {
  it("suggests alpha for alpa", () => {
    expect(suggestCommand("alpa")).toBe("alpha");
  });

  it("suggests frac for frak", () => {
    expect(suggestCommand("frak")).toBe("frac");
  });

  it("returns null for already-valid commands", () => {
    expect(suggestCommand("alpha")).toBe(null);
  });

  it("returns null for gibberish", () => {
    expect(suggestCommand("zzzzqqq")).toBe(null);
  });
});
