"""Rebuild js/data.js from data/nasa_findings.json (so index.html works by double-click, no server needed)."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data" / "nasa_findings.json").read_text(encoding="utf-8"))
(root / "js" / "data.js").write_text(
    "// AUTO-GENERATED from data/nasa_findings.json by tools/build_data.py - edit the JSON, not this file.\n"
    "window.NASA_KB = " + json.dumps(d, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
print("js/data.js written:", len(d["findings"]), "findings")
