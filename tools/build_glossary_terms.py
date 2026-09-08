#!/usr/bin/env python3
"""Build the glossary tooltip data file from 04_glossary.md.

The glossary stays the single source of truth for terms + definitions.
This script

  1. parses 04_glossary.md into {term, formal, plain} entries,
  2. attaches the curated match patterns per term (the strings that
     actually show up in the reading pages — e.g. "OPF" for the term
     "OPF (optimal power flow)"; the full term string is always added
     automatically),
  3. writes _data/glossary.json, which _includes/head.html injects into
     the browser and assets/js/glossary_tooltips.js uses to wrap terms
     with hover tooltips (reference only — the tooltip links nowhere).

Usage:
  python3 tools/build_glossary_terms.py           # rewrite _data/glossary.json
  python3 tools/build_glossary_terms.py --dump    # print every parsed entry
                                                  # (term + definitions) for
                                                  # review (also to
                                                  # /tmp/glossary_dump.txt)
  python3 tools/build_glossary_terms.py --report  # scan all site markdown
                                                  # pages and print exactly
                                                  # which terms would get a
                                                  # tooltip, with context

Re-run after editing 04_glossary.md or the MATCHES curation below; commit
both this file and _data/glossary.json.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "04_glossary.md"
OUT = ROOT / "_data" / "glossary.json"

# Pages scanned by --report (everything readers see, except the glossary
# itself — its terms already sit right next to their definitions).
REPORT_PAGES = [
    "00_README.md",
    "01_fundamentals_bridge.md",
    "02_gpu_basics_and_kernels.md",
    "03_gpu_grid_optimization_review.md",
    "05_scopus_search_guide.md",
    "06_phd_roadmap.md",
    "index.md",
    "papers.md",
    "quiz.md",
    "README.md",
]

# Curated match patterns, keyed by the exact glossary term. List the
# shorter forms (acronyms, plurals, hyphen variants) the reading pages
# actually use; the full term string is added automatically.
#
# Curation rules of thumb:
#   - only patterns whose meaning is unambiguous in this corpus
#     ("grid" alone is NOT safe: in 01/03 it means the power grid, in 02
#     the CUDA grid — so the CUDA entry only gets "3D grid");
#   - hyphenated variants are listed explicitly ("warm-start", "N-1");
#   - case: a pattern containing an uppercase letter matches
#     case-sensitively (acronyms), all-lowercase patterns match
#     case-insensitively.
MATCHES = {
    # --- A. Grid physics & models ---
    "bus": ["buses"],
    "swing (slack) / PV / PQ bus": ["swing bus", "slack bus", "PV bus",
                                    "PV-bus", "PQ bus"],
    "Ybus (bus admittance matrix)": ["Ybus", "bus admittance matrix"],
    "sparsity": ["sparse"],
    "CSR (compressed sparse row)": ["CSR"],
    "complex power (S = P + jQ), power factor": ["complex power", "power factor"],
    "per-unit (pu)": ["per-unit", "per unit", "pu"],
    "transmission line (π model)": ["transmission lines", "π model"],
    "AC power flow (Newton–Raphson)": ["AC power flow", "AC power-flow",
                                       "Newton–Raphson", "Newton-Raphson"],
    "Jacobian": ["Jacobians"],
    "fill-in": ["fill-in"],
    "DC power flow": ["DC power-flow", "DC flow"],
    "N-1 contingency": ["N-1", "N-1 contingencies", "contingency", "contingencies"],
    "state estimation (WLS)": ["state estimation", "WLS"],
    "DistFlow": [],
    "radial / distribution network": ["radial", "radial network",
                                      "distribution network"],
    "microgrid": ["microgrids"],
    "ancillary services": [],
    "timescales (strategic / daily / intraday / real-time)": ["timescale", "timescales"],
    # --- B. Optimization ---
    "objective (function)": ["objective", "objectives", "objective function"],
    "constraint": ["constraints"],
    "LP / QP": ["LP", "LPs", "QP"],
    "MILP / MINLP": ["MILPs", "MINLP"],
    "convexity": ["convex"],
    "duality / KKT conditions": ["duality", "KKT", "KKT conditions", "KKT system"],
    "simplex / interior point (IPM)": ["simplex", "IPM", "interior point",
                                       "interior-point", "interior point method",
                                       "interior-point method",
                                       "interior-point methods"],
    "branch-and-bound / cutting planes": ["branch and bound", "cutting plane"],
    "ADMM (Alternating Direction Method of Multipliers)": ["ADMM"],
    "Benders decomposition": ["Benders"],
    "warm start": ["warm-start", "warm-started"],
    "relaxation": ["relaxations"],
    # --- C. Grid operations & DERMS ---
    "OPF (optimal power flow)": ["OPF", "optimal power flow"],
    "DC-OPF / AC-OPF": ["DC-OPF", "AC-OPF", "DC OPF", "AC OPF"],
    "SCOPF (security-constrained OPF)": ["SCOPF", "security-constrained OPF"],
    "unit commitment (UC)": ["UC", "unit commitment"],
    "SCUC / SCED": ["SCUC", "SCED"],
    "rolling horizon": ["rolling-horizon", "receding horizon"],
    "ramp limits / start-up cost": ["ramp", "ramp limits", "start-up cost",
                                    "start-up costs", "startup cost",
                                    "startup costs"],
    "DER (distributed energy resource)": ["DER", "DERs",
                                          "distributed energy resource",
                                          "distributed energy resources"],
    "DERMS": ["DERMS"],
    "DER-CMS / ADMS": ["DER-CMS", "ADMS"],
    "OpenADR / demand response (DR)": ["OpenADR", "demand response", "DR"],
    "IEEE 2030.5 / IEEE 2020": ["IEEE 2030.5", "IEEE 2020"],
    "feeder / voltage band": ["feeders", "voltage band", "voltage bands"],
    # --- D. Planning ---
    "NPC (net present cost)": ["NPC", "net present cost"],
    "capex / opex": ["capex", "opex"],
    "TEP (transmission expansion planning)": ["TEP",
                                              "transmission expansion planning"],
    "scenario / scenario tree": ["scenario", "scenarios", "scenario tree",
                                 "scenario trees"],
    "stochastic programming": ["stochastic", "stochastic program"],
    "robust optimization": [],
    "multi-period / investment model": ["multi-period", "multi-year",
                                        "investment model", "investment models"],
    "levelized cost (LCOE/LCOS)": ["LCOE", "LCOS", "levelized cost"],
    "energy hub / multi-energy system": ["energy hub", "multi-energy system"],
    # --- E. GPU / HPC ---
    "GPU / SM / CUDA core": ["GPUs", "SM", "SMs", "CUDA core", "CUDA cores"],
    "warp / SIMT": ["warps", "SIMT"],
    "thread / block / grid": ["thread", "threads", "block", "blocks", "3D grid"],
    "shared memory / global memory (HBM)": ["shared memory", "global memory",
                                            "HBM"],
    "coalesced access": ["coalesced"],
    "launch overhead": ["launch-overhead", "overhead-bound"],
    "roofline / bandwidth-bound vs compute-bound": ["roofline",
                                                    "bandwidth-bound",
                                                    "compute-bound",
                                                    "memory-bandwidth-bound"],
    "Amdahl's law": ["Amdahl", "Amdahl's"],
    "double precision (FP64)": ["double precision", "FP64"],
    "cuSPARSE / cuSOLVER / NCCL": ["cuSPARSE", "cuSOLVER", "NCCL"],
    "batch processing / data parallelism": ["batch processing",
                                            "data parallelism"],
}


def strip_front_matter(text):
    lines = text.split("\n")
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return "\n".join(lines[i + 1:])
    return text


def clean_ws(s):
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s*\n\s*", " ", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def parse(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    text = strip_front_matter(text)
    paras = re.split(r"\n\s*\n", text)
    entries = []
    cat = "?"
    for para in paras:
        p = para.strip()
        if not p:
            continue
        if p.startswith("## "):
            m = re.match(r"##\s+([A-Z])\.\s*(.*)", p)
            if m:
                cat = m.group(1)
            continue
        if p.startswith("---"):
            continue
        m = re.match(r"\*\*(.+?)\*\*", p)
        if not m:
            continue
        term_raw = m.group(1).strip()
        rest = p[m.end():]
        msep = re.match(r"\s*[\u2014\-]\s*", rest)
        dstart = msep.end() if msep else 0
        dtext = clean_ws(rest[dstart:])

        formal = ""
        plain = ""
        mf = re.search(r"\*Formal:\*\s*", dtext)
        mp = re.search(r"\*Plain:\*\s*", dtext)
        if mf:
            if mp and mp.start() > mf.end():
                formal = clean_ws(dtext[mf.end(): mp.start()])
            else:
                formal = clean_ws(dtext[mf.end():])
            if mp:
                plain = clean_ws(dtext[mp.end():])
        else:
            formal = clean_ws(dtext)

        formal = formal.replace("*Formal:*", "").replace("*Plain:*", "").strip()
        plain = plain.replace("*Formal:*", "").replace("*Plain:*", "").strip()

        entries.append(
            {"term": clean_ws(term_raw), "formal": formal, "plain": plain, "cat": cat}
        )
    return entries


def clean_definition(s):
    """Strip markdown emphasis/backticks from a definition for tooltip use.

    Only *paired* markers are removed, so a lone conjugate star as in
    "S = V·I*" is left alone.
    """
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    s = s.replace("`", "")
    return clean_ws(s)


def build_entries():
    """Parse the glossary and attach curated match patterns.

    Fails loudly if MATCHES and 04_glossary.md have drifted apart, or if
    one pattern would be assigned to two different terms (the runtime
    resolver can only pick one definition per matched span).
    """
    raw = parse(SRC)
    terms = [e["term"] for e in raw]
    if len(terms) != len(set(terms)):
        dupes = sorted({t for t in terms if terms.count(t) > 1})
        raise SystemExit("duplicate terms in glossary: %s" % dupes)
    unknown = [k for k in MATCHES if k not in terms]
    if unknown:
        raise SystemExit(
            "MATCHES keys not found in 04_glossary.md: %s\n"
            "(rename or remove them in tools/build_glossary_terms.py)" % unknown
        )

    entries = []
    seen_patterns = {}
    for e in raw:
        curated = MATCHES.get(e["term"], [])
        matches = [e["term"]] + [p for p in curated if p != e["term"]]
        for pat in matches:
            low = pat.lower()
            if low in seen_patterns:
                raise SystemExit(
                    "pattern %r maps to both %r and %r — assign it to one term"
                    % (pat, seen_patterns[low], e["term"])
                )
            seen_patterns[low] = e["term"]
        entries.append(
            {
                "term": e["term"],
                "formal": clean_definition(e["formal"]),
                "plain": clean_definition(e["plain"]),
                "matches": matches,
                "cat": e["cat"],
            }
        )
    return entries


def strip_code(text):
    """Front matter, fenced code blocks and inline code — none of that
    should ever get a tooltip, so the report ignores it."""
    text = re.sub(r"\A---\n.*?\n---\n", "", text, count=1, flags=re.S)
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", "", text)
    return text


def python_matcher(pat):
    """Mirror of the browser-side matcher in assets/js/glossary_tooltips.js:
    no letter/digit/underscore before, none (and no hyphen) after."""
    flags = 0 if re.search(r"[A-Z]", pat) else re.I
    return re.compile(r"(?<!\w)" + re.escape(pat) + r"(?![\w\-])", flags)


def write_json(entries):
    OUT.parent.mkdir(exist_ok=True)
    payload = [
        {k: e[k] for k in ("term", "formal", "plain", "matches")} for e in entries
    ]
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    n_pats = sum(len(e["matches"]) for e in payload)
    print(
        "wrote %s — %d terms, %d match patterns" % (OUT, len(payload), n_pats)
    )


def dump_entries(entries):
    lines = ["TOTAL: %d terms\n" % len(entries)]
    for i, e in enumerate(entries, 1):
        lines.append("%2d. [%s] %s" % (i, e["cat"], e["term"]))
        fs = e["formal"][:160] + ("..." if len(e["formal"]) > 160 else "")
        lines.append("     F: %s" % fs)
        if e["plain"]:
            ps = e["plain"][:120] + ("..." if len(e["plain"]) > 120 else "")
            lines.append("     P: %s" % ps)
        lines.append("     M: %s" % " | ".join(e["matches"]))
        lines.append("")
    dump = "\n".join(lines)
    with open("/tmp/glossary_dump.txt", "w", encoding="utf-8") as f:
        f.write(dump)
    print(dump)


def report(entries):
    """Scan every reading page and show which terms would get a tooltip."""
    compiled = []  # (entry, [(matcher, pattern), ...])
    for e in entries:
        compiled.append((e, [(python_matcher(p), p) for p in e["matches"]]))

    total_by_term = {}
    print("Glossary tooltip match report (what readers would see)\n")
    for name in REPORT_PAGES:
        path = ROOT / name
        if not path.exists():
            continue
        text = strip_code(path.read_text(encoding="utf-8"))
        counts = {}  # term -> [count, [snippets]]
        for e, pats in compiled:
            for rx, pat in pats:
                for m in rx.finditer(text):
                    c = counts.setdefault(e["term"], [0, []])
                    c[0] += 1
                    if len(c[1]) < 3:
                        s = max(0, m.start() - 45)
                        e2 = min(len(text), m.end() + 45)
                        ctx = re.sub(r"\s+", " ", text[s:e2]).strip()
                        c[1].append("…%s…" % ctx)
        if not counts:
            print("== %s — no matches" % name)
            continue
        total = sum(c[0] for c in counts.values())
        print("== %s — %d matches" % (name, total))
        for term, (n, snips) in sorted(counts.items(), key=lambda kv: -kv[1][0]):
            print("   %4d× %s" % (n, term))
            for s in snips:
                print("        %s" % s)
        for term, (n, _snips) in counts.items():
            total_by_term[term] = total_by_term.get(term, 0) + n
        print()

    never = [e["term"] for e in entries if e["term"] not in total_by_term]
    if never:
        print("Terms that never match a reading page (fine — reference only):")
        print("   " + "; ".join(never))


def main():
    entries = build_entries()
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "--dump":
        dump_entries(entries)
    elif arg == "--report":
        report(entries)
    elif arg not in ("", "--build"):
        raise SystemExit(__doc__)
    else:
        write_json(entries)
        print("(run with --report to preview matches, --dump to review entries)")


if __name__ == "__main__":
    main()
