import { describe, expect, it } from "vitest";
import { containsTikzPicture, renderTikzPicture } from "./tikz";

const PX = 37.795275591;
const cm = (value: number) => Math.round(value * PX * 100) / 100;

describe("renderTikzPicture", () => {
  it("detects tikzpicture blocks", () => {
    expect(containsTikzPicture("\\begin{tikzpicture}\\end{tikzpicture}")).toBe(true);
    expect(containsTikzPicture("plain text")).toBe(false);
  });

  it("draws a line with svg y-axis flipped", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) -- (2,0);\\end{tikzpicture}");
    expect(result.error).toBeUndefined();
    expect(result.svg).toContain('class="tikz-svg"');
    expect(result.svg).toMatch(/d="M 0 0 L 75.59 0"/);
    expect(result.width).toBeGreaterThan(70);
  });

  it("flips vertical coordinates into svg space", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) -- (0,2);\\end{tikzpicture}");
    expect(result.svg).toMatch(/d="M 0 0 L 0 -75.59"/);
  });

  it("renders rectangles from corner to corner", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) rectangle (2,1);\\end{tikzpicture}");
    expect(result.svg).toMatch(/<rect x="0" y="-37.8"/);
    expect(result.svg).toMatch(/width="75.59"/);
    expect(result.svg).toMatch(/height="37.8"/);
  });

  it("renders circles and fills", () => {
    const filled = renderTikzPicture("\\begin{tikzpicture}\\fill[red] (0,0) circle (1);\\end{tikzpicture}");
    expect(filled.svg).toContain("<ellipse");
    expect(filled.svg).toContain('fill="#dc2626"');
    const drawn = renderTikzPicture("\\begin{tikzpicture}\\draw[blue] (0,0) circle (0.5);\\end{tikzpicture}");
    expect(drawn.svg).toContain('stroke="#2563eb"');
    expect(drawn.svg).toContain('fill="none"');
  });

  it("supports ellipse with two radii", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) ellipse (2 and 1);\\end{tikzpicture}");
    expect(result.svg).toMatch(/rx="75.59"/);
    expect(result.svg).toMatch(/ry="37.8"/);
  });

  it("places standalone nodes with labels", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\node at (1,1) {A};\\end{tikzpicture}");
    expect(result.svg).toContain("<text");
    expect(result.svg).toContain(">A</text>");
    expect(result.svg).toMatch(/text-anchor="middle"/);
  });

  it("applies above/below/left/right node offsets", () => {
    const above = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) node[above] {T} -- (1,0);\\end{tikzpicture}");
    const below = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) node[below] {T} -- (1,0);\\end{tikzpicture}");
    const aboveY = Number(/y="(-?[\d.]+)"/.exec(above.svg)![1]);
    const belowY = Number(/y="(-?[\d.]+)"/.exec(below.svg)![1]);
    expect(aboveY).toBeLessThan(belowY);
  });

  it("renders node shapes (circle, rectangle) around text", () => {
    const circle = renderTikzPicture("\\begin{tikzpicture}\\node[draw, circle] (a) at (0,0) {A};\\end{tikzpicture}");
    expect(circle.svg).toContain("<ellipse");
    const box = renderTikzPicture("\\begin{tikzpicture}\\node[draw, fill=blue!20, rounded corners] at (0,0) {B};\\end{tikzpicture}");
    expect(box.svg).toContain("<rect");
    expect(box.svg).toContain("rx=");
  });

  it("supports named coordinates and references", () => {
    const result = renderTikzPicture(
      "\\begin{tikzpicture}\\coordinate (A) at (0,0); \\coordinate (B) at (2,1); \\draw (A) -- (B);\\end{tikzpicture}",
    );
    expect(result.error).toBeUndefined();
    expect(result.svg).toMatch(/d="M 0 0 L 75.59 -37.8"/);
  });

  it("supports polar coordinates", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) -- (90:1);\\end{tikzpicture}");
    expect(result.svg).toMatch(/L 0 -37.8/);
  });

  it("supports relative coordinates", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) -- ++(1,0) -- ++(0,1);\\end{tikzpicture}");
    expect(result.svg).toMatch(/L 37.8 0 L 37.8 -37.8/);
  });

  it("closes cycles", () => {
    const result = renderTikzPicture(
      "\\begin{tikzpicture}\\draw (0,0) -- (2,0) -- (2,1) -- cycle;\\end{tikzpicture}",
    );
    expect(result.svg).toMatch(/ Z/);
  });

  it("renders grids with step 1cm", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw[help lines] (0,0) grid (2,2);\\end{tikzpicture}");
    expect(result.svg).toMatch(/stroke-dasharray/);
    expect(result.width).toBeGreaterThanOrEqual(cm(2));
    expect(result.height).toBeGreaterThanOrEqual(cm(2));
  });

  it("renders arcs", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) arc (0:90:1);\\end{tikzpicture}");
    expect(result.svg).toMatch(/A 37.8 37.8 0/);
  });

  it("applies arrow markers", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw[->] (0,0) -- (1,0);\\end{tikzpicture}");
    expect(result.svg).toContain("<marker");
    expect(result.svg).toMatch(/marker-end="url\(#/);
    const both = renderTikzPicture("\\begin{tikzpicture}\\draw[<->] (0,0) -- (1,0);\\end{tikzpicture}");
    expect(both.svg).toMatch(/marker-start="url\(#/);
  });

  it("applies line styles and widths", () => {
    const dashed = renderTikzPicture("\\begin{tikzpicture}\\draw[dashed] (0,0) -- (1,0);\\end{tikzpicture}");
    expect(dashed.svg).toContain('stroke-dasharray="6 4"');
    const thick = renderTikzPicture("\\begin{tikzpicture}\\draw[thick] (0,0) -- (1,0);\\end{tikzpicture}");
    expect(thick.svg).toContain('stroke-width="1.4"');
    const dotted = renderTikzPicture("\\begin{tikzpicture}\\draw[dotted, ultra thick, red] (0,0) -- (1,0);\\end{tikzpicture}");
    expect(dotted.svg).toContain('stroke-dasharray="1.5 3.5"');
    expect(dotted.svg).toContain('stroke-width="3"');
    expect(dotted.svg).toContain('stroke="#dc2626"');
  });

  it("mixes colors with the xcolor syntax", () => {
    const light = renderTikzPicture("\\begin{tikzpicture}\\draw[red!30] (0,0) -- (1,0);\\end{tikzpicture}");
    expect(light.svg).toMatch(/stroke="#[a-f0-9]{6}"/);
    expect(light.svg).not.toContain('stroke="#dc2626"');
    const mixed = renderTikzPicture("\\begin{tikzpicture}\\draw[red!50!blue] (0,0) -- (1,0);\\end{tikzpicture}");
    expect(mixed.svg).toMatch(/stroke="#/);
    expect(mixed.svg).not.toContain('stroke="#dc2626"');
  });

  it("expands foreach loops over numeric and letter ranges", () => {
    const numeric = renderTikzPicture(
      "\\begin{tikzpicture}\\foreach \\x in {0,1,2} {\\draw (\\x,0) -- (\\x,1);}\\end{tikzpicture}",
    );
    const paths = numeric.svg.match(/<path/g);
    expect(paths?.length).toBe(3);
    const range = renderTikzPicture(
      "\\begin{tikzpicture}\\foreach \\x in {1,...,4} {\\node at (\\x,0) {\\x};}\\end{tikzpicture}",
    );
    const nodes = range.svg.match(/<text/g);
    expect(nodes?.length).toBe(4);
    expect(range.svg).toContain(">4</text>");
  });

  it("applies picture-level scale", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}[scale=2]\\draw (0,0) -- (1,0);\\end{tikzpicture}");
    expect(result.svg).toMatch(/L 75.59 0/);
  });

  it("rotates pictures about the origin", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}[rotate=90]\\draw (0,0) -- (1,0);\\end{tikzpicture}");
    expect(result.svg).toMatch(/L 0 -37.8/);
  });

  it("draws to[bend] curves as quadratics", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) to[bend left=45] (2,0);\\end{tikzpicture}");
    expect(result.svg).toMatch(/ Q /);
  });

  it("renders plot coordinates as polylines", () => {
    const result = renderTikzPicture(
      "\\begin{tikzpicture}\\draw plot coordinates {(0,0) (1,1) (2,0.5)};\\end{tikzpicture}",
    );
    expect(result.svg).toMatch(/M 0 0 L 37.8 -37.8 L 75.59 -18.9/);
  });

  it("uses tikzset-defined styles", () => {
    const result = renderTikzPicture(
      "\\begin{tikzpicture}\\tikzset{myaxis/.style={->, thick, blue}}\\draw[myaxis] (0,0) -- (1,0);\\end{tikzpicture}",
    );
    expect(result.svg).toContain('stroke="#2563eb"');
    expect(result.svg).toContain('stroke-width="1.4"');
    expect(result.svg).toMatch(/marker-end="url\(#/);
  });

  it("renders inline path nodes at the last coordinate", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) -- (2,0) node[right] {end};\\end{tikzpicture}");
    expect(result.svg).toContain(">end</text>");
  });

  it("handles labels on nodes", () => {
    const result = renderTikzPicture(
      "\\begin{tikzpicture}\\node[label=above:$x$] at (0,0) {O};\\end{tikzpicture}",
    );
    const texts = result.svg.match(/<text/g);
    expect(texts?.length).toBe(2);
  });

  it("reports empty pictures as errors", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\end{tikzpicture}");
    expect(result.error).toBeDefined();
    expect(result.svg).toBe("");
  });

  it("keeps the figure bounded to its content", () => {
    const small = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) -- (1,0);\\end{tikzpicture}");
    const big = renderTikzPicture("\\begin{tikzpicture}\\draw (0,0) -- (10,0);\\end{tikzpicture}");
    expect(big.width).toBeGreaterThan(small.width * 5);
  });

  it("escapes raw node text when no renderer is given", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\node at (0,0) {<b>x</b>};\\end{tikzpicture}");
    expect(result.svg).toContain("&lt;b&gt;");
  });

  it("delegates node text to the provided renderer", () => {
    const result = renderTikzPicture("\\begin{tikzpicture}\\node at (0,0) {$x^2$};\\end{tikzpicture}", {
      renderText: (text) => `<i>${text}</i>`,
    });
    expect(result.svg).toContain("<i>$x^2$</i>");
  });

  it("combines many features in one realistic figure", () => {
    const figure = [
      "\\begin{tikzpicture}[scale=0.8]",
      "\\draw[->] (0,0) -- (5,0) node[right] {$x$};",
      "\\draw[->] (0,0) -- (0,3) node[above] {$y$};",
      "\\draw[thick, blue] (0,0) -- (4,2.5);",
      "\\fill[red] (2,1.25) circle (0.08);",
      "\\node[below right] at (2,1.25) {$P$};",
      "\\draw[dashed] (2,1.25) -- (2,0);",
      "\\end{tikzpicture}",
    ].join("\n");
    const result = renderTikzPicture(figure);
    expect(result.error).toBeUndefined();
    expect(result.svg).toContain('stroke="#2563eb"');
    expect(result.svg).toContain('fill="#dc2626"');
    expect(result.svg).toContain('stroke-dasharray="6 4"');
    expect(result.svg).toMatch(/>\$x\$</);
    expect(result.unsupported).toHaveLength(0);
  });
});
