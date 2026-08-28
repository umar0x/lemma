import { beforeEach, describe, expect, it } from "vitest";
import type { Block } from "@/core/blocks/types";
import { buildRenderContext, isNumberedMathBlock } from "./context";
import { renderBlock, renderDocument } from "./render";
import { clearRenderCache, renderDocumentCached, renderCacheSize } from "./renderCache";
import { extractMacros } from "./macros";

function block(latex: string, type: Block["type"], id: string): Block {
  return { id, type, latex, lastEditedBy: "user", lastEditedAt: 0 };
}

beforeEach(() => {
  clearRenderCache();
});

describe("math environment classification", () => {
  it("numbers plain equation and align environments", () => {
    expect(isNumberedMathBlock("\\begin{equation}x\\end{equation}")).toBe(true);
    expect(isNumberedMathBlock("\\begin{align}x\\end{align}")).toBe(true);
  });

  it("does not number starred, bracket, or tagged environments", () => {
    expect(isNumberedMathBlock("\\begin{equation*}x\\end{equation*}")).toBe(false);
    expect(isNumberedMathBlock("\\[ x \\]")).toBe(false);
    expect(isNumberedMathBlock("$$ x $$")).toBe(false);
    expect(isNumberedMathBlock("\\begin{equation}x\\tag{9}\\end{equation}")).toBe(false);
    expect(isNumberedMathBlock("\\begin{equation}x\\nonumber\\end{equation}")).toBe(false);
  });
});

describe("equation numbering", () => {
  it("injects a tag into numbered equations", () => {
    const result = renderBlock(
      block("\\begin{equation}\\label{eq:one} a = b\\end{equation}", "equation", "b1"),
      { equationNumber: 3 },
    );
    expect(result.status).toBe("ok");
    expect(result.html).toContain("katex");
    expect(result.meta?.number).toBe(3);
  });

  it("leaves unnumbered equations without tags", () => {
    const result = renderBlock(block("\\[ a = b \\]", "equation", "b1"), {});
    expect(result.status).toBe("ok");
    expect(result.meta?.number).toBeUndefined();
  });

  it("numbers equations sequentially across the document", () => {
    const blocks = [
      block("\\begin{equation}a\\end{equation}", "equation", "e1"),
      block("\\[ b \\]", "equation", "e2"),
      block("\\begin{equation}c\\end{equation}", "equation", "e3"),
    ];
    const results = renderDocument(blocks);
    expect(results.get("e1")?.meta?.number).toBe(1);
    expect(results.get("e2")?.meta?.number).toBeUndefined();
    expect(results.get("e3")?.meta?.number).toBe(2);
  });
});

describe("cross references", () => {
  it("resolves \\ref and \\eqref to equation numbers", () => {
    const blocks = [
      block("\\begin{equation}\\label{eq:main} E = mc^2\\end{equation}", "equation", "eq"),
      block("As shown in \\eqref{eq:main} and also \\ref{eq:main}.", "text", "txt"),
    ];
    const results = renderDocument(blocks);
    const html = results.get("txt")?.html ?? "";
    expect(html).toContain("(1)");
    expect(html.match(/>\s*1\s*</)?.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves theorem references with kind labels", () => {
    const blocks = [
      block("\\begin{theorem}\\label{thm:z}Statement.\\end{theorem}", "theorem", "t1"),
      block("By \\ref{thm:z} we are done.", "text", "txt"),
    ];
    const results = renderDocument(blocks);
    expect(results.get("txt")?.html).toContain("Theorem 1");
  });

  it("falls back to the raw label for unknown references", () => {
    const result = renderBlock(block("See \\ref{eq:missing} and \\ref{eq:known}.", "text", "t1"), {
      refs: new Map([["eq:known", "4"]]),
    });
    expect(result.html).toContain("eq:missing");
    expect(result.html).toContain(">4<");
  });

  it("builds refs with correct version sensitivity", () => {
    const blocks = [
      block("\\begin{equation}\\label{eq:a}x\\end{equation}", "equation", "e1"),
      block("\\begin{equation}\\label{eq:b}y\\end{equation}", "equation", "e2"),
    ];
    const ctx = buildRenderContext(blocks);
    expect(ctx.refs.get("eq:a")).toBe("1");
    expect(ctx.refs.get("eq:b")).toBe("2");
    const ctx2 = buildRenderContext([blocks[0]]);
    expect(ctx2.version).not.toBe(ctx.version);
  });
});

describe("theorem numbering", () => {
  it("numbers theorems per kind across the document", () => {
    const blocks = [
      block("\\begin{theorem}One.\\end{theorem}", "theorem", "t1"),
      block("\\begin{lemma}Two.\\end{lemma}", "theorem", "t2"),
      block("\\begin{theorem}Three.\\end{theorem}", "theorem", "t3"),
      block("\\begin{proof}Done.\\end{proof}", "theorem", "t4"),
    ];
    const results = renderDocument(blocks);
    expect(results.get("t1")?.html).toContain("Theorem 1");
    expect(results.get("t2")?.html).toContain("Lemma 1");
    expect(results.get("t3")?.html).toContain("Theorem 2");
    expect(results.get("t4")?.html).toContain("Proof");
    expect(results.get("t4")?.html).not.toContain("Proof 1");
  });
});

describe("chemistry and advanced math", () => {
  it("renders mhchem formulas", () => {
    const result = renderBlock(block("\\[ \\ce{H2O + CO2 -> H2CO3} \\]", "equation", "b1"));
    expect(result.status).toBe("ok");
    expect(result.html).toContain("katex");
  });

  it("renders top-level pmatrix environments as math", () => {
    const result = renderBlock(
      block("\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}", "equation", "b1"),
    );
    expect(result.status).toBe("ok");
    expect(result.html).toContain("katex");
  });

  it("renders cases environments", () => {
    const result = renderBlock(
      block("\\begin{cases} a & x > 0 \\\\ b & x \\leq 0 \\end{cases}", "equation", "b1"),
    );
    expect(result.status).toBe("ok");
    expect(result.html).toContain("katex");
  });

  it("renders array environments with column specs", () => {
    const result = renderBlock(
      block("\\begin{array}{cc} 1 & 2 \\\\ 3 & 4 \\end{array}", "equation", "b1"),
    );
    expect(result.status).toBe("ok");
    expect(result.html).toContain("katex");
  });
});

describe("rich text v2", () => {
  it("renders display math inside prose paragraphs", () => {
    const result = renderBlock(block("Behold $$x^2 + y^2 = z^2$$ inline display.", "text", "b1"));
    expect(result.status).toBe("ok");
    expect(result.html).toContain("katex-display");
  });

  it("renders inline verbatim spans", () => {
    const result = renderBlock(block("Use \\verb|\\alpha{}| carefully.", "text", "b1"));
    expect(result.html).toContain('<code class="rt-verb">\\alpha{}</code>');
  });

  it("drops comment environments", () => {
    const result = renderBlock(
      block("Before.\n\\begin{comment}\nsecret draft notes\n\\end{comment}\nAfter.", "text", "b1"),
    );
    expect(result.html).toContain("Before.");
    expect(result.html).toContain("After.");
    expect(result.html).not.toContain("secret");
  });

  it("renders nested formatting commands", () => {
    const result = renderBlock(block("\\textbf{bold \\emph{both}} plain", "text", "b1"));
    expect(result.html).toContain("<strong>bold <em>both</em></strong>");
  });

  it("renders small caps, super- and subscripts", () => {
    const result = renderBlock(
      block("\\textsc{Small Caps}, 1\\textsuperscript{st}, x\\textsubscript{i}.", "text", "b1"),
    );
    expect(result.html).toContain("rt-smallcaps");
    expect(result.html).toContain("<sup>st</sup>");
    expect(result.html).toContain("<sub>i</sub>");
  });

  it("renders spacing commands", () => {
    const result = renderBlock(block("a\\,b\\;c\\quad d\\qquad e", "text", "b1"));
    expect(result.html).toContain("&thinsp;");
    expect(result.html).toContain("&emsp;");
    expect(result.status).toBe("ok");
  });

  it("applies whitelisted colors and drops unsafe ones", () => {
    const safe = renderBlock(block("\\textcolor{red}{hot} and \\textcolor{expression(alert)}{no}.", "text", "b1"));
    expect(safe.html).toContain("rt-color");
    expect(safe.html).not.toContain("expression");

    const hex = renderBlock(block("\\textcolor{#a63a2b}{hex}.", "text", "b1"));
    expect(hex.html).toContain("#a63a2b");

    const invalid = renderBlock(block("\\textcolor{url(javascript:x)}{bad}.", "text", "b1"));
    expect(invalid.html).not.toContain("url(");
  });

  it("escapes href attributes against quote injection", () => {
    const result = renderBlock(
      block('\\href{https://ex.com/a"onmouseover="alert(1)}{link}', "text", "b1"),
    );
    expect(result.html).not.toContain('onmouseover="alert');
    expect(result.html).toContain("&quot;");
  });

  it("strips phantom and noindent commands", () => {
    const result = renderBlock(block("\\noindent \\phantom{xx}Visible.", "text", "b1"));
    expect(result.html).toContain("Visible");
    expect(result.html).not.toContain("phantom");
    expect(result.html).not.toContain("noindent");
  });
});

describe("tables v2", () => {
  it("applies column alignment from the colspec", () => {
    const result = renderBlock(
      block("\\begin{tabular}{lcr}\nleft & center & right \\\\\n\\end{tabular}", "table", "b1"),
    );
    expect(result.html).toContain('class="ta-l"');
    expect(result.html).toContain('class="ta-c"');
    expect(result.html).toContain('class="ta-r"');
  });

  it("supports multicolumn cells", () => {
    const result = renderBlock(
      block(
        "\\begin{tabular}{ccc}\n\\multicolumn{2}{c}{Wide} & x \\\\\na & b & c \\\\\n\\end{tabular}",
        "table",
        "b1",
      ),
    );
    expect(result.html).toContain('colspan="2"');
    expect(result.html).toContain("Wide");
  });

  it("detects booktabs mode", () => {
    const result = renderBlock(
      block(
        "\\begin{tabular}{lr}\\toprule a & b \\\\ \\midrule c & d \\\\ \\bottomrule\\end{tabular}",
        "table",
        "b1",
      ),
    );
    expect(result.html).toContain("rt-table-booktabs");
  });

  it("expands star column specs", () => {
    const result = renderBlock(
      block("\\begin{tabular}{*{3}{c}}\na & b & c \\\\\n\\end{tabular}", "table", "b1"),
    );
    expect(result.html.match(/<td[\s>]/g)?.length).toBe(3);
  });
});

describe("macro extraction v2", () => {
  it("wraps DeclareMathOperator bodies in operatorname", () => {
    const macros = extractMacros("\\DeclareMathOperator{\\lcm}{lcm}");
    expect(macros[0].body).toBe("\\operatorname{lcm}");
  });

  it("supports macros with arguments", () => {
    const blocks = [
      block("\\newcommand{\\ip}[2]{\\langle #1, #2 \\rangle}", "preamble", "p1"),
      block("\\[ \\ip{a}{b} \\]", "equation", "e1"),
    ];
    const results = renderDocument(blocks);
    expect(results.get("e1")?.status).toBe("ok");
    expect(results.get("e1")?.html).toContain("katex");
  });
});

describe("render cache", () => {
  it("returns identical results to direct rendering", () => {
    const blocks = [
      block("Plain prose with $x^2$.", "text", "t1"),
      block("\\begin{equation}\\label{eq:a}x\\end{equation}", "equation", "e1"),
      block("\\begin{theorem}T.\\end{theorem}", "theorem", "th1"),
    ];
    const direct = renderDocument(blocks);
    const cached = renderDocumentCached(blocks);
    expect([...cached.keys()].sort()).toEqual([...direct.keys()].sort());
    for (const [id, result] of direct) {
      expect(cached.get(id)?.status).toBe(result.status);
      expect(cached.get(id)?.html).toBe(result.html);
    }
  });

  it("reuses cached blocks across repeated renders", () => {
    const blocks = [
      block("Alpha $a$.", "text", "t1"),
      block("Beta $b$.", "text", "t2"),
    ];
    renderDocumentCached(blocks);
    const sizeAfterFirst = renderCacheSize();
    renderDocumentCached(blocks);
    renderDocumentCached(blocks);
    expect(renderCacheSize()).toBe(sizeAfterFirst);
  });

  it("only re-renders changed blocks", () => {
    const blocks = [block("Alpha.", "text", "t1"), block("Beta.", "text", "t2")];
    renderDocumentCached(blocks);
    const size = renderCacheSize();
    renderDocumentCached([blocks[0], block("Changed.", "text", "t2")]);
    expect(renderCacheSize()).toBe(size + 1);
  });

  it("re-renders when document numbering changes", () => {
    const base = [
      block("Text \\ref{eq:a}.", "text", "t1"),
      block("\\begin{equation}\\label{eq:a}x\\end{equation}", "equation", "e1"),
    ];
    renderDocumentCached(base);
    const withExtra = [
      block("Text \\ref{eq:a}.", "text", "t1"),
      block("\\begin{equation}\\label{eq:pre}y\\end{equation}", "equation", "e0"),
      block("\\begin{equation}\\label{eq:a}x\\end{equation}", "equation", "e1"),
    ];
    const results = renderDocumentCached(withExtra);
    expect(results.get("t1")?.html).toContain(">2<");
  });
});
