#!/usr/bin/env python
"""Fetch openly-licensed images for OER, with license + attribution capture.

Run via uv so dependencies are ephemeral (no permanent project dep):
    uv run --with requests python fetch_open_image.py search "isotactic polypropylene" --source commons
    uv run --with requests python fetch_open_image.py get  --title "File:Polypropylene tacticity.svg" --out guide/assets/pp_tacticity.svg
    uv run --with requests python fetch_open_image.py search "self-healing polymer" --source openverse
    uv run --with requests python fetch_open_image.py get  --url <openverse_detail_url> --out guide/assets/foo.jpg

Sources: Wikimedia Commons (commons.wikimedia.org) and Openverse (openverse.org).
Only PERMISSIVE-OER licenses are accepted by default: CC0 / Public Domain / CC BY /
CC BY-SA. NC (NonCommercial) and ND (NoDerivatives) are flagged "REVIEW" and NOT
auto-downloaded (NC is unsafe for many OER reuses; ND forbids cropping/derivatives).

`get` writes the image AND a sidecar <out>.attrib.json with the fields you must copy
into guide/ATTRIBUTION.md. It prints a ready-to-paste attribution line. NEVER embed an
asset whose license you could not capture here.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import requests

UA = {"User-Agent": "Conductor-OER/1.0 (educational OER figure sourcing; contact yuwang@louisiana.edu)"}
COMMONS = "https://commons.wikimedia.org/w/api.php"
OPENVERSE = "https://api.openverse.org/v1/images/"

# permissive licenses safe to embed in a publicly-served OER (with attribution)
_OK = re.compile(r"(?i)\b(cc0|public domain|cc[\s-]?by(?:[\s-]?sa)?(?:[\s-]?\d(?:\.\d)?)?)\b")
_BAD = re.compile(r"(?i)\b(nc|noncommercial|nd|noderiv|fair use|all rights reserved|copyright)\b")


def classify(license_str: str) -> str:
    s = license_str or ""
    if _BAD.search(s) and not re.search(r"(?i)by-sa", s):
        return "REVIEW"
    if _OK.search(s):
        return "OK"
    return "REVIEW"


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").strip()


# ----------------------------------------------------------------- Wikimedia
def commons_search(query: str, limit: int):
    r = requests.get(COMMONS, params={
        "action": "query", "format": "json", "list": "search",
        "srsearch": query, "srnamespace": "6", "srlimit": str(limit)},
        headers=UA, timeout=30).json()
    out = []
    for hit in r.get("query", {}).get("search", []):
        info = commons_info(hit["title"])
        if info:
            out.append(info)
    return out


def commons_info(title: str):
    r = requests.get(COMMONS, params={
        "action": "query", "format": "json", "prop": "imageinfo", "titles": title,
        "iiprop": "url|extmetadata|mime|size"}, headers=UA, timeout=30).json()
    pages = r.get("query", {}).get("pages", {})
    for pg in pages.values():
        ii = pg.get("imageinfo")
        if not ii:
            continue
        info = ii[0]
        md = info.get("extmetadata", {})
        lic = md.get("LicenseShortName", {}).get("value", "")
        return {
            "source": "Wikimedia Commons",
            "title": title,
            "url": info.get("url"),
            "mime": info.get("mime"),
            "license": lic,
            "license_url": md.get("LicenseUrl", {}).get("value", ""),
            "creator": _strip_html(md.get("Artist", {}).get("value", "")),
            "credit": _strip_html(md.get("Credit", {}).get("value", "")),
            "landing": f"https://commons.wikimedia.org/wiki/{title.replace(' ', '_')}",
            "status": classify(lic),
        }
    return None


# ----------------------------------------------------------------- Openverse
def openverse_search(query: str, limit: int):
    r = requests.get(OPENVERSE, params={
        "q": query, "license": "cc0,by,by-sa,pdm", "page_size": str(limit)},
        headers=UA, timeout=30).json()
    # Openverse returns bare license CODES (by, by-sa, cc0, pdm, …); the query above
    # already restricts to OER-permissive ones, so map the code to a status directly
    # (classify() expects a human license string and would mis-flag bare codes).
    code_ok = {"cc0", "pdm", "by", "by-sa"}
    out = []
    for it in r.get("results", []):
        code = (it.get("license", "") or "").lower()
        ver = (it.get("license_version", "") or "")
        pretty = "Public Domain (PDM)" if code == "pdm" else (
            f"CC {code.upper()} {ver}".strip())
        out.append({
            "source": "Openverse", "title": it.get("title"), "url": it.get("url"),
            "mime": "image/" + (it.get("filetype") or "jpeg"),
            "license": pretty,
            "license_url": it.get("license_url", ""),
            "creator": it.get("creator", ""),
            "landing": it.get("foreign_landing_url", ""),
            "id": it.get("id"),
            "status": "OK" if code in code_ok else "REVIEW",
        })
    return out


def download(url: str, out: str):
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    resp = requests.get(url, headers=UA, timeout=60)
    resp.raise_for_status()
    Path(out).write_bytes(resp.content)
    return len(resp.content)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search"); s.add_argument("query")
    s.add_argument("--source", choices=["commons", "openverse"], default="commons")
    s.add_argument("--limit", type=int, default=6)
    g = sub.add_parser("get")
    g.add_argument("--title"); g.add_argument("--url"); g.add_argument("--out", required=True)
    g.add_argument("--source", choices=["commons", "openverse"], default="commons")
    g.add_argument("--allow-review", action="store_true",
                   help="download even if license is REVIEW (you take responsibility)")
    a = ap.parse_args()

    if a.cmd == "search":
        hits = commons_search(a.query, a.limit) if a.source == "commons" \
            else openverse_search(a.query, a.limit)
        for h in hits:
            print(f"[{h['status']}] {h['license'] or '?':14} | {h['title']}")
            print(f"        url:     {h['url']}")
            print(f"        landing: {h['landing']}  | creator: {h['creator'][:60]}")
        if not hits:
            print("(no results)")
        return 0

    # get
    if a.title:
        info = commons_info(a.title)
        if not info:
            print("could not resolve title", file=sys.stderr); return 2
    elif a.url:
        info = {"source": ("Openverse" if a.source == "openverse" else "Wikimedia Commons"),
                "url": a.url, "license": "", "license_url": "", "creator": "",
                "landing": a.url, "status": "REVIEW", "title": a.url}
        print("NOTE: direct --url skips license capture; prefer --title (commons) or a search result.",
              file=sys.stderr)
    else:
        print("get needs --title or --url", file=sys.stderr); return 2

    if info["status"] != "OK" and not a.allow_review:
        print(f"REFUSING: license '{info['license']}' is REVIEW (NC/ND/unknown). "
              f"Pick a CC0/PD/CC-BY/CC-BY-SA asset, or re-run with --allow-review only "
              f"after you have verified it is OER-safe.", file=sys.stderr)
        return 3
    n = download(info["url"], a.out)
    Path(a.out + ".attrib.json").write_text(json.dumps(info, indent=2))
    cred = info["creator"] or "see source page"
    print(f"saved {a.out} ({n} bytes)")
    print(f"ATTRIBUTION ROW -> | {Path(a.out).name} | {info['license']} | {cred} | "
          f"{info['landing']} |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
