// A multi-line block directive ends where orz-markdown ends it (its `}}` line): found by the Chemistry of
// Macromolecules course, where a `{{mermaid … }}` diagram swallowed the rest of the study guide into one figure unit,
// so nothing after it was read, linked or checked.
import test from "node:test";
import assert from "node:assert/strict";
import { segmentDeliverable } from "../scripts/lib/core/segment.mjs";

const forms = (text, rel = "study-guide/x.md") => segmentDeliverable(text, rel).units.map((u) => [u.form, u.text.split("\n")[0]]);

test("[req.units.segmenter] a multi-line {{mermaid}}, {{chart}} or {{smiles}} block is one figure unit, and the text after it is read", () => {
  for (const block of ["{{mermaid\nflowchart TD\n  A[One] --> B[Two]\n}}", "{{chart\ntype: bar\nlabels: A, B\ndata: 1, 2\n}}", "{{smiles\nCCO\n}}"]) {
    const f = forms(`# T\n\nIntro para.\n\n${block}\n\nAfter the figure.\n\n## Next\n\nMore text.\n`);
    assert.deepEqual(f.map(([k]) => k), ["paragraph", "figure", "paragraph", "paragraph"], block);
    assert.deepEqual(f.slice(2).map(([, t]) => t), ["After the figure.", "More text."]);
  }
  // a one-line block, and a slide deck
  assert.deepEqual(forms("# T\n\n{{smiles CCO}}\n\nAfter.\n").map(([k]) => k), ["figure", "paragraph"]);
  const deck = "{{nyml\nkind: document\ncarrier: slides\ntitle: T\n}}\n\n<!-- slide -->\n## One\n{{mermaid\nflowchart LR\n  A --> B\n}}\n\n<!-- slide -->\n## Two\n- a point after the diagram\n";
  assert.ok(segmentDeliverable(deck, "slides/x.md").units.some((u) => /a point after the diagram/.test(u.text)), "the next slide is read");
});
