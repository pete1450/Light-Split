#!/usr/bin/env python3
"""Assemble the single-file PRISM build:
head.html + three.min.js + levels/*.json + logic.js + game.js -> ~/workspace/your_files/prism/index.html"""
import json
import pathlib
import sys

root = pathlib.Path(__file__).parent
head = (root / "head.html").read_text()
three = (root / "three.min.js").read_text()
logic = (root / "logic.js").read_text()
game = (root / "game.js").read_text()

# levels: build/levels/*.json -> validated, inlined as PRISM_LEVELS_JSON
PIECE_TYPES = ("emit", "mirror", "split", "comb", "recv", "wall")
COLOR_NAMES = ("R", "O", "Y", "L", "G", "T", "C", "A", "B", "W")
levels = []
for path in sorted((root / "levels").glob("*.json")):
    try:
        lv = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        sys.exit(f"level {path.name}: invalid JSON: {e}")
    for field in ("id", "name", "fixed"):
        if field not in lv:
            sys.exit(f"level {path.name}: missing field '{field}'")
    if not isinstance(lv["fixed"], list):
        sys.exit(f"level {path.name}: 'fixed' must be a list")
    for p in lv["fixed"]:
        if p.get("t") not in PIECE_TYPES:
            sys.exit(f"level {path.name}: bad piece type {p!r}")
        if not (isinstance(p.get("x"), int) and isinstance(p.get("y"), int)
                and 0 <= p["x"] < 10 and 0 <= p["y"] < 10):
            sys.exit(f"level {path.name}: bad coords {p!r}")
        if "a" in p and not isinstance(p["a"], (int, float)):
            sys.exit(f"level {path.name}: bad angle {p!r}")
        if "col" in p and p["col"] not in COLOR_NAMES:
            sys.exit(f"level {path.name}: bad color {p!r}")
        if "fixed" in p and not isinstance(p["fixed"], bool):
            sys.exit(f"level {path.name}: 'fixed' must be true/false {p!r}")
    levels.append(lv)
print(f"levels: {len(levels)} loaded from build/levels/")
levels_js = "var PRISM_LEVELS_JSON = " + json.dumps(levels, separators=(",", ":")) + ";"

out = (
    head
    + "<script>\n" + three + "\n</script>\n"
    + "<script>\n" + levels_js + "\n</script>\n"
    + "<script>\n" + logic + "\n</script>\n"
    + "<script>\n" + game + "\n</script>\n"
    + "</body>\n</html>\n"
)

dest = pathlib.Path.home() / "workspace" / "your_files" / "prism" / "index.html"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out)
print("wrote", dest, f"({len(out) / 1024:.0f} KB)")
