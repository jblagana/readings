#!/usr/bin/env python3
"""Fetch OpenAlex citation counts + first authors for the DOI-backed papers.

One-time data-gathering step (NOT a build step). Reads the audit table at the
repo root, queries OpenAlex once per DOI, and writes a dated, reproducible
snapshot to tools/citations_snapshot.json. The snapshot is what the citation
chips on the deck ultimately reflect (see _data/paper_slides.yaml).

Usage:  python3 tools/fetch_citations.py
Outputs: tools/citations_snapshot.json  (committed provenance artifact)
         /tmp/cite_table.txt            (compact table, for authoring)
"""
import csv
import datetime
import json
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = "/home/jan.rhey.lagana/Readings"
CSV = f"{ROOT}/papers_scopus_table.csv"
OUT = f"{ROOT}/tools/citations_snapshot.json"
TABLE = "/tmp/cite_table.txt"
UA = "gpu-powerflow-reading-package/1.0 (research; fetch_citations.py)"
ASOF = datetime.date.today().isoformat()


def fetch_work(doi):
    url = f"https://api.openalex.org/works/https://doi.org/{doi}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def first_authors(work):
    au = work.get("authorships") or []
    names = [
        a["author"]["display_name"]
        for a in au
        if a.get("author", {}).get("display_name")
    ]
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return f"{names[0]} et al."


def process(row):
    pid = (row.get("id") or "").strip()
    doi = (row.get("doi") or "").strip()
    entry = {
        "doi": doi,
        "title": row.get("title", ""),
        "citations": None,
        "authors": "",
        "oa_title": None,
        "oa_year": None,
        "status": "ok",
    }
    if not doi:
        entry["status"] = "no-doi"
        return pid, entry
    try:
        w = fetch_work(doi)
        entry["citations"] = int(w.get("cited_by_count", 0) or 0)
        entry["authors"] = first_authors(w)
        entry["oa_title"] = w.get("display_name")
        entry["oa_year"] = w.get("publication_year")
    except urllib.error.HTTPError as e:
        entry["status"] = f"http {e.code}"
    except Exception as e:  # noqa: BLE001 - record and continue
        entry["status"] = f"{type(e).__name__}: {e}"
    return pid, entry


def main():
    rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
    papers = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(process, r) for r in rows]
        for f in as_completed(futs):
            pid, entry = f.result()
            papers[pid] = entry

    ok = sum(1 for e in papers.values() if e["status"] == "ok")
    data = {
        "fetched_at": ASOF,
        "source": "OpenAlex (api.openalex.org /works, cited_by_count)",
        "stats": {"total": len(papers), "ok": ok, "missing": len(papers) - ok},
        "papers": {k: papers[k] for k in sorted(papers)},
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)

    lines = [f"{'id':5} {'cites':>5}  status  authors | doi"]
    for pid in sorted(papers):
        e = papers[pid]
        lines.append(
            f"{pid:5} {str(e['citations']):>5}  {e['status']:9} "
            f"{e['authors'][:34]:34} | {e['doi']}"
        )
    lines.append("")
    lines.append(f"STATS total={len(papers)} ok={ok} missing={len(papers)-ok}")
    lines.append(f"ASOF {ASOF}")
    with open(TABLE, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
