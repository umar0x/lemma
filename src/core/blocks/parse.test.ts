import { describe, expect, it } from "vitest";
import { parseSource } from "./parse";

function types(source: string) {
  return parseSource(source).map((segment) => segment.type);
}

function latexList(source: string) {
  return parseSource(source).map((segment) => segment.latex);
}

describe("parseSource", () => {
  it("splits plain paragraphs into text blocks", () => {
    const source = "First paragraph.\n\nSecond paragraph.";
    expect(types(source)).toEqual(["text", "text"]);
  });

  it("extracts bracket display math as an equation block", () => {
    const source = "Intro text.\n\n\\[ E = mc^2 \\]\n\nOutro text.";
    expect(types(source)).toEqual(["text", "equation", "text"]);
  });

  it("extracts dollar display math as an equation block", () => {
    const source = "$$ \\int_0^1 x\\,dx = \\frac{1}{2} $$";
    expect(types(source)).toEqual(["equation"]);
    expect(parseSource(source)[0].latex).toBe("$$ \\int_0^1 x\\,dx = \\frac{1}{2} $$");
  });

  it("keeps inline math inside text blocks", () => {
    const source = "The value $x + y$ stays inline.";
    expect(types(source)).toEqual(["text"]);
  });

  it("classifies align environments", () => {
    const source = "\\begin{align}\na &= b \\\\\nb &= c\n\\end{align}";
    expect(types(source)).toEqual(["align"]);
  });

  it("classifies starred align environments", () => {
    const source = "\\begin{align*}\na &= b\n\\end{align*}";
    expect(types(source)).toEqual(["align"]);
  });

  it("classifies theorem environments with the correct type", () => {
    const source = "\\begin{theorem}[Euler]\n$e^{i\\pi} + 1 = 0$\n\\end{theorem}";
    const [segment] = parseSource(source);
    expect(segment.type).toBe("theorem");
    expect(segment.latex).toContain("[Euler]");
  });

  it("handles nested identical environments", () => {
    const source = "\\begin{itemize}\n\\item outer\n\\begin{itemize}\n\\item inner\n\\end{itemize}\n\\end{itemize}";
    const [segment] = parseSource(source);
    expect(segment.type).toBe("text");
    expect(segment.latex).toContain("\\item inner");
  });

  it("ignores environments mentioned inside comments", () => {
    const source = "% \\begin{align} commented out\n\nReal text.";
    expect(types(source)).toEqual(["text", "text"]);
  });

  it("ignores display math mentioned inside comments", () => {
    const source = "Text % \\[ broken\nstill same paragraph";
    expect(types(source)).toEqual(["text"]);
    expect(parseSource(source)[0].latex).toContain("still same paragraph");
  });

  it("handles escaped percent signs", () => {
    const source = "Costs 50\\% of \\[ x \\] budget.";
    expect(types(source)).toEqual(["text", "equation", "text"]);
  });

  it("classifies macro-only paragraphs as preamble", () => {
    const source = "\\newcommand{\\vecv}{\\mathbf{v}}\n\\DeclareMathOperator{\\lcm}{lcm}";
    expect(types(source)).toEqual(["preamble"]);
  });

  it("treats mixed prose and macros as text", () => {
    const source = "We define notation. \\newcommand{\\R}{\\mathbb{R}} And continue.";
    expect(types(source)).toEqual(["text"]);
  });

  it("classifies figures and tables", () => {
    const source = [
      "\\begin{figure}",
      "\\includegraphics{plot.png}",
      "\\caption{A plot}",
      "\\end{figure}",
      "",
      "\\begin{table}",
      "\\begin{tabular}{cc}",
      "a & b \\\\",
      "\\end{tabular}",
      "\\end{table}",
    ].join("\n");
    expect(types(source)).toEqual(["figure", "table"]);
  });

  it("classifies verbatim as code", () => {
    const source = "\\begin{verbatim}\nint main() { return 0; }\n\\end{verbatim}";
    expect(types(source)).toEqual(["code"]);
  });

  it("leaves incomplete environments in the text flow", () => {
    const source = "\\begin{align}\na &= b\n\nno end yet";
    const segments = parseSource(source);
    expect(segments.map((s) => s.type)).toEqual(["text", "text"]);
    expect(segments[0].latex).toContain("\\begin{align}");
  });

  it("preserves exact source of segments", () => {
    const source = "Keep  double  spaces   exactly.";
    expect(latexList(source)).toEqual(["Keep  double  spaces   exactly."]);
  });

  it("round-trips through serialization unchanged", () => {
    const source = [
      "Some intro with $x^2$ inline.",
      "",
      "\\[ f(x) = x^2 \\]",
      "",
      "\\begin{align}",
      "a &= b \\\\",
      "c &= d",
      "\\end{align}",
      "",
      "\\begin{theorem}",
      "All that glitters is not gold.",
      "\\end{theorem}",
    ].join("\n");
    const segments = parseSource(source);
    const serialized = segments.map((s) => s.latex).join("\n\n");
    expect(parseSource(serialized).map((s) => s.latex)).toEqual(segments.map((s) => s.latex));
  });

  it("handles consecutive display equations without blank lines", () => {
    const source = "\\[ a \\]\n\\[ b \\]";
    expect(types(source)).toEqual(["equation", "equation"]);
    expect(latexList(source)).toEqual(["\\[ a \\]", "\\[ b \\]"]);
  });

  it("handles unknown environments as plain text", () => {
    const source = "\\begin{customenv}\nsome content\n\\end{customEnv}";
    expect(types(source)).toEqual(["text"]);
  });

  it("handles crlf line endings", () => {
    const source = "First.\r\n\r\nSecond.\r\n";
    expect(types(source)).toEqual(["text", "text"]);
  });

  it("handles empty source", () => {
    expect(parseSource("")).toEqual([]);
    expect(parseSource("   \n\n  \n")).toEqual([]);
  });
});
