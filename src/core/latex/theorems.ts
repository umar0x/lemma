export const THEOREM_LABELS: Record<string, string> = {
  theorem: "Theorem",
  lemma: "Lemma",
  proposition: "Proposition",
  corollary: "Corollary",
  definition: "Definition",
  remark: "Remark",
  proof: "Proof",
  example: "Example",
  axiom: "Axiom",
  note: "Note",
  fact: "Fact",
  claim: "Claim",
  conjecture: "Conjecture",
  criterion: "Criterion",
  property: "Property",
  observation: "Observation",
};

export function theoremLabel(env: string): string {
  return THEOREM_LABELS[env] ?? "Theorem";
}
