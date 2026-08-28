import { describe, expect, it } from "vitest";
import {
  geometryOptionsFromSetup,
  pageSetupCssSize,
  pageSetupLabel,
  parsePageSetup,
  readDocumentPolicies,
  usesMicrotype,
} from "./geometry";
import type { Block } from "@/core/blocks/types";
import { segmentsToBlocks } from "@/core/templates";
import { serializeDocumentTex } from "@/core/blocks/serialize";

function preambleBlocks(latex: string): Block[] {
  return segmentsToBlocks([{ type: "preamble", latex }]);
}

describe("parsePageSetup", () => {
  it("defaults to letter with 1in margins without geometry", () => {
    const setup = parsePageSetup("");
    expect(setup.paper).toBe("letter");
    expect(setup.source).toBe("default");
    expect(setup.margins.top).toBeCloseTo(25.4);
  });

  it("reads margin=1in from the geometry package", () => {
    const setup = parsePageSetup("\\usepackage[margin=1in]{geometry}");
    expect(setup.source).toBe("geometry");
    expect(setup.margins.top).toBeCloseTo(25.4);
    expect(setup.paper).toBe("letter");
  });

  it("reads a4paper and metric margins", () => {
    const setup = parsePageSetup("\\usepackage[a4paper, margin=2cm]{geometry}");
    expect(setup.paper).toBe("a4");
    expect(setup.margins.left).toBeCloseTo(20);
  });

  it("reads individual margins", () => {
    const setup = parsePageSetup("\\usepackage[top=10mm, bottom=20mm, left=15mm, right=25mm]{geometry}");
    expect(setup.margins).toEqual({ top: 10, right: 25, bottom: 20, left: 15 });
  });

  it("reads landscape orientation", () => {
    const setup = parsePageSetup("\\usepackage[margin=1in, landscape]{geometry}");
    expect(setup.landscape).toBe(true);
  });

  it("derives margins from textwidth", () => {
    const setup = parsePageSetup("\\usepackage[a4paper, textwidth=160mm]{geometry}");
    expect(setup.margins.left).toBeCloseTo(25);
    expect(setup.margins.right).toBeCloseTo(25);
  });

  it("falls back to documentclass paper size", () => {
    const setup = parsePageSetup("\\documentclass[11pt, a4paper]{article}");
    expect(setup.paper).toBe("a4");
  });

  it("produces css page sizes", () => {
    expect(pageSetupCssSize(parsePageSetup("\\usepackage[a4paper]{geometry}"))).toBe("210mm 297mm");
    expect(pageSetupCssSize(parsePageSetup("\\usepackage[a4paper, landscape]{geometry}"))).toBe("297mm 210mm");
    expect(pageSetupCssSize(parsePageSetup(""))).toBe("215.9mm 279.4mm");
  });

  it("labels setups for the preamble card", () => {
    expect(pageSetupLabel(parsePageSetup("\\usepackage[a4paper, margin=25mm]{geometry}"))).toBe("A4 · 25mm margins");
    expect(pageSetupLabel(parsePageSetup("\\usepackage[landscape]{geometry}"))).toContain("landscape");
  });

  it("round-trips through export options", () => {
    const setup = parsePageSetup("\\usepackage[a4paper, margin=2cm]{geometry}");
    expect(geometryOptionsFromSetup(setup)).toContain("a4paper");
    expect(geometryOptionsFromSetup(setup)).toContain("margin=20mm");
  });
});

describe("readDocumentPolicies", () => {
  it("detects microtype across preamble blocks", () => {
    expect(usesMicrotype("\\usepackage{microtype}")).toBe(true);
    expect(usesMicrotype("\\usepackage[protrusion=true, expansion=false]{microtype}")).toBe(true);
    expect(usesMicrotype("\\usepackage{amsmath}")).toBe(false);

    const blocks = preambleBlocks("\\usepackage[margin=1in]{geometry}\n\\usepackage{microtype}\n\\newcommand{\\dv}{\\mathbf{v}}");
    const policies = readDocumentPolicies(blocks);
    expect(policies.microtype).toBe(true);
    expect(policies.pageSetup.source).toBe("geometry");
  });

  it("ignores geometry mentions in body blocks", () => {
    const blocks = segmentsToBlocks([
      { type: "text", latex: "We use \\textbf{geometry} ideas in this proof." },
    ]);
    const policies = readDocumentPolicies(blocks);
    expect(policies.pageSetup.source).toBe("default");
    expect(policies.microtype).toBe(false);
  });
});

describe("serializeDocumentTex preamble handling", () => {
  it("hoists preamble blocks and emits geometry + microtype", () => {
    const blocks = [
      ...preambleBlocks("\\usepackage[margin=1in]{geometry}\n\\usepackage{microtype}\n\\newcommand{\\dv}{\\mathbf{v}}"),
      ...segmentsToBlocks([{ type: "text", latex: "Body text with $\\dv$." }]),
    ];
    const tex = serializeDocumentTex({ id: "doc_x", title: "Test", blocks, threads: [], createdAt: 0, updatedAt: 0 });
    const beginIndex = tex.indexOf("\\begin{document}");
    const preamble = tex.slice(0, beginIndex);
    const body = tex.slice(beginIndex);

    expect(preamble).toContain("\\usepackage[margin=1in]{geometry}");
    expect(preamble).toContain("\\usepackage{microtype}");
    expect(preamble).toContain("\\newcommand{\\dv}");
    expect(preamble).not.toContain("\\usepackage[margin=1in]{geometry}\n\\usepackage[margin=1in]");
    expect(body).toContain("Body text with $\\dv$.");
    expect(body).not.toContain("\\newcommand");
  });

  it("adds tikz to the export preamble only when figures use it", () => {
    const withTikz = serializeDocumentTex({
      id: "doc_a",
      title: "T",
      blocks: segmentsToBlocks([{ type: "figure", latex: "\\begin{tikzpicture}\\draw (0,0) -- (1,0);\\end{tikzpicture}" }]),
      threads: [],
      createdAt: 0,
      updatedAt: 0,
    });
    expect(withTikz).toContain("\\usepackage{tikz}");

    const withoutTikz = serializeDocumentTex({
      id: "doc_b",
      title: "T",
      blocks: segmentsToBlocks([{ type: "text", latex: "No figures here." }]),
      threads: [],
      createdAt: 0,
      updatedAt: 0,
    });
    expect(withoutTikz).not.toContain("\\usepackage{tikz}");
  });
});
