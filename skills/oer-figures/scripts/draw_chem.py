#!/usr/bin/env python
"""Publication-quality chemistry figures with RDKit — structures & reaction schemes.

Run via uv so RDKit is ephemeral (no permanent project dep):
    uv run --with rdkit --with cairosvg python draw_chem.py mol  "C=Cc1ccccc1" --out guide/assets/styrene.svg --legend "Styrene"
    uv run --with rdkit python draw_chem.py grid "C=C:Ethylene" "C=CC:Propylene" "C=Cc1ccccc1:Styrene" --out guide/assets/monomers.svg
    uv run --with rdkit python draw_chem.py poly "*CC(*)c1ccccc1" --out guide/assets/polystyrene_repeat.svg --legend "Polystyrene repeat unit"
    uv run --with rdkit python draw_chem.py rxn  "C=Cc1ccccc1>>*CC(*)c1ccccc1" --out guide/assets/ps_polymerization.svg

SVG is preferred for line art (crisp at any zoom, small, embeds cleanly in the public
site). Use `*` (dummy atoms) for polymer repeat-unit attachment points. These are
SELF-GENERATED originals — record them as such in ATTRIBUTION.md (no external license).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem.Draw import rdMolDraw2D


def _opts(d):
    o = d.drawOptions()
    o.bondLineWidth = 2
    o.padding = 0.12
    o.legendFontSize = 18
    o.addStereoAnnotation = True


def _write(d, out: str):
    d.FinishDrawing()
    txt = d.GetDrawingText()
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if out.endswith(".svg") else "wb"
    Path(out).write_bytes(txt if isinstance(txt, bytes) else txt.encode()) if mode == "wb" \
        else Path(out).write_text(txt)


def _drawer(out, w, h):
    return rdMolDraw2D.MolDraw2DSVG(w, h) if out.endswith(".svg") \
        else rdMolDraw2D.MolDraw2DCairo(w, h)


def mol(smiles, out, legend, w, h):
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        raise SystemExit(f"invalid SMILES: {smiles}")
    d = _drawer(out, w, h); _opts(d)
    rdMolDraw2D.PrepareAndDrawMolecule(d, m, legend=legend or "")
    _write(d, out); print("wrote", out)


def grid(pairs, out, per_row, cell):
    """Lay out several structures on a fixed GRID — each molecule gets its own
    cell so they NEVER overlap (the old DrawMolecules packed them onto one canvas
    and overlapped large/numerous structures). SVG only (line art)."""
    from rdkit.Chem import Draw
    mols, legs = [], []
    for p in pairs:
        smi, _, leg = p.partition(":")
        m = Chem.MolFromSmiles(smi)
        if m is None:
            raise SystemExit(f"invalid SMILES: {smi}")
        mols.append(m); legs.append(leg or smi)
    per_row = max(1, min(per_row, len(mols)))
    do = rdMolDraw2D.MolDrawOptions()
    do.legendFontSize = 16; do.bondLineWidth = 2; do.padding = 0.12
    svg = Draw.MolsToGridImage(mols, molsPerRow=per_row, subImgSize=(cell, cell),
                               legends=legs, useSVG=True, drawOptions=do)
    txt = svg.data if hasattr(svg, "data") else str(svg)
    if not out.endswith(".svg"):
        out = out.rsplit(".", 1)[0] + ".svg"  # grid is SVG-only
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(txt)
    print(f"wrote {out} ({len(mols)} structures, {per_row}/row, {cell}px cells — no overlap)")


def rxn(smarts, out, w, h):
    r = AllChem.ReactionFromSmarts(smarts, useSmiles=True)
    if r is None:
        raise SystemExit(f"invalid reaction: {smarts}")
    d = _drawer(out, w, h)
    d.DrawReaction(r)
    _write(d, out); print("wrote", out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("mol", "poly"):
        p = sub.add_parser(name); p.add_argument("smiles")
        p.add_argument("--out", required=True); p.add_argument("--legend", default="")
        p.add_argument("--w", type=int, default=420); p.add_argument("--h", type=int, default=320)
    p = sub.add_parser("grid"); p.add_argument("pairs", nargs="+")
    p.add_argument("--out", required=True); p.add_argument("--per-row", type=int, default=3)
    p.add_argument("--cell", type=int, default=260,
                   help="per-structure cell size in px (each molecule isolated; no overlap)")
    p = sub.add_parser("rxn"); p.add_argument("smarts")
    p.add_argument("--out", required=True); p.add_argument("--w", type=int, default=760)
    p.add_argument("--h", type=int, default=260)
    a = ap.parse_args()
    if a.cmd in ("mol", "poly"):
        mol(a.smiles, a.out, a.legend, a.w, a.h)
    elif a.cmd == "grid":
        grid(a.pairs, a.out, a.per_row, a.cell)
    elif a.cmd == "rxn":
        rxn(a.smarts, a.out, a.w, a.h)


if __name__ == "__main__":
    main()
