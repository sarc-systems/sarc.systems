#!/usr/bin/env python3
"""generate-library-collection-covers.py — regenerate the placeholder cover
image for each Library Collection's own _index.md.

A Collection-summary Entry (docs/library-v2.md § 11) is a real Entry like
any other, so the Library root's Images view needs it to have a primary
image or it's simply omitted from that view (the existing, correct
behavior for any Entry with no image — see CLAUDE.md § Library "Images").
Rather than photographing something, each Collection gets a plain solid
square in its own Colorplan identity color (data/library/collections.yaml)
— the same design language already used for type-swatch filter chips and
Map nodes, extended to the one place that still needed an actual raster
image. Generated, not photographed or sourced — credited "SARC",
rights.status sarc-owned; never claims a real photograph's provenance.

Regenerate with `make library-covers` whenever a Collection's color
changes or a new Collection is registered. Requires: pip install Pillow.
"""

import json
import os

import yaml
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLLECTIONS_PATH = os.path.join(ROOT, "data/library/collections.yaml")
COLORPLAN_PATH = os.path.join(ROOT, "data/colorplan.json")
SIZE = 1200
FILENAME = "cover.png"

with open(COLLECTIONS_PATH) as f:
    collections = yaml.safe_load(f)

with open(COLORPLAN_PATH) as f:
    colorplan = json.load(f)
hex_by_slug = {c["slug"]: c["hex"] for c in colorplan["colors"]}

count = 0
for coll in collections:
    if coll.get("source", {}).get("adapter") != "hugo":
        continue
    slug = coll["color"]
    if slug not in hex_by_slug:
        raise SystemExit(f"generate-library-collection-covers: Collection {coll['id']!r} has unknown color {slug!r}")
    hex_color = hex_by_slug[slug]
    section = coll["source"]["section"]  # e.g. "library/research"
    out_dir = os.path.join(ROOT, "content", section)
    if not os.path.isdir(out_dir):
        raise SystemExit(f"generate-library-collection-covers: {out_dir} does not exist — run this after the Collection's _index.md is created")
    out_path = os.path.join(out_dir, FILENAME)
    img = Image.new("RGB", (SIZE, SIZE), hex_color)
    img.save(out_path, "PNG", optimize=True)
    count += 1
    print(f"  {coll['id']}: {slug} ({hex_color}) -> {os.path.relpath(out_path, ROOT)}")

print(f"Generated {count} Collection cover(s).")
