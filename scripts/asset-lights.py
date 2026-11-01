#!/usr/bin/env python3
"""Build the night-light layer for a landmark sprite.

Finds the window glass in a pixelized building (by colour rule), splits it into
panes (connected regions), and lights a share of them. The output is a sprite
of the same size holding only the lit pixels, which the walk draws over the
time-of-day tint so windows glow at dusk and night.

    asset-lights.py building.png lights.png --rule blue --share 0.55 --color ffd98a
"""
import argparse
import math
import random

from PIL import Image

RULES = {
    # Dark, blue-leaning glass against warm concrete or wood.
    "blue": lambda r, g, b: b > r + 18 and b >= g - 4 and (r + g + b) / 3 < 125,
    # Very dark glass in a neutral or blue-grey wall.
    "dark": lambda r, g, b: (r + g + b) / 3 < 62 and b >= r,
    # Bright curtain-wall glass.
    "glass": lambda r, g, b: b > r + 45 and b > 120,
    # Teal-tinted glass in a charcoal building.
    "teal": lambda r, g, b: b > r + 14 and g > r + 6 and (r + g + b) / 3 < 120,
    # Panes the artist already painted warm.
    "warm": lambda r, g, b: r > 190 and g > 140 and b < 130 and r - b > 90,
}

# Warm lamps the artist already painted (wall sconces, porch lights).
LAMP = lambda r, g, b: r > 215 and g > 175 and b < 140


def components(mask, w, h):
    seen = set()
    for start in mask:
        if start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            x, y = stack.pop()
            comp.append((x, y))
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in mask and n not in seen:
                    seen.add(n)
                    stack.append(n)
        yield comp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--rule", choices=RULES, required=True)
    ap.add_argument("--share", type=float, default=0.5, help="fraction of panes lit")
    ap.add_argument("--color", default="ffd98a")
    ap.add_argument("--min", type=int, default=3, help="smallest pane, in pixels")
    ap.add_argument("--max", type=int, default=400, help="largest pane, in pixels")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--grid", help="WxH: light glass in grid cells instead of connected panes")
    ap.add_argument("--mullions", action="store_true", help="split glass into panes along detected mullion lines")
    ap.add_argument("--region", help="x0,y0,x1,y1 as fractions: only look for glass inside")
    ap.add_argument("--no-lamps", action="store_true", help="skip warm lamp pixels, for buildings with tan walls")
    ap.add_argument("--debug")
    args = ap.parse_args()

    im = Image.open(args.src).convert("RGBA")
    w, h = im.size
    px = im.load()
    rule = RULES[args.rule]
    x0, y0, x1, y1 = (float(v) for v in (args.region or "0,0,1,1").split(","))
    inside = lambda x, y: x0 * w <= x <= x1 * w and y0 * h <= y <= y1 * h
    mask = {(x, y) for y in range(h) for x in range(w) if px[x, y][3] and inside(x, y) and rule(*px[x, y][:3])}
    lamps = set() if args.no_lamps else {(x, y) for y in range(h) for x in range(w) if px[x, y][3] and LAMP(*px[x, y][:3])}

    rnd = random.Random(args.seed)
    base = tuple(int(args.color[i : i + 2], 16) for i in (0, 2, 4))
    out = Image.new("RGBA", (w, h))
    o = out.load()
    lit = panes = 0
    if args.mullions:
        # Columns and rows that are mostly not glass are mullions; panes are
        # the glass between them.
        def splits(n, along):
            cuts = []
            for i in range(n):
                line = [(i, j) if along == "x" else (j, i) for j in range(h if along == "x" else w)]
                opaque = [p for p in line if px[p][3]]
                glass = sum(1 for p in opaque if p in mask)
                cuts.append(bool(opaque) and glass < 0.3 * len(opaque))
            ids, k, prev = [], 0, True
            for c in cuts:
                if not c and prev:
                    k += 1
                ids.append(None if c else k)
                prev = c
            return ids
        col, row = splits(w, "x"), splits(h, "y")
        cells = {}
        for x, y in mask:
            if col[x] is not None and row[y] is not None:
                cells.setdefault((col[x], row[y]), []).append((x, y))
        groups = list(cells.values())
    elif args.grid:
        gw, gh = (int(v) for v in args.grid.split("x"))
        cells = {}
        for x, y in mask:
            cells.setdefault((x // gw, y // gh), []).append((x, y))
        groups = list(cells.values())
    else:
        groups = list(components(mask, w, h))
    for comp in groups:
        if not args.min <= len(comp) <= args.max:
            continue
        # Outlines and seams are long and thin; panes have some body.
        cw = max(x for x, _ in comp) - min(x for x, _ in comp) + 1
        ch = max(y for _, y in comp) - min(y for _, y in comp) + 1
        if cw < 3 or ch < 2 or len(comp) < 0.45 * cw * ch:
            continue
        panes += 1
        if rnd.random() > args.share:
            continue
        lit += 1
        top = min(y for _, y in comp)
        bottom = max(y for _, y in comp)
        warmth = 0.85 + rnd.random() * 0.15
        for x, y in comp:
            # A little falloff toward the bottom of each pane reads as a lamp.
            t = (y - top) / max(1, bottom - top)
            k = warmth * (1 - 0.18 * t)
            o[x, y] = tuple(min(255, int(c * k + 30 * (1 - t))) for c in base) + (255,)
    for x, y in lamps:
        o[x, y] = (255, 226, 150, 255)
    out.save(args.dst)
    print(f"{args.src}: {panes} panes, {lit} lit, {len(lamps)} lamp px")

    if args.debug:
        dbg = im.copy()
        dbg.alpha_composite(out)
        dark = Image.new("RGBA", dbg.size, (10, 10, 30, 150))
        night = Image.alpha_composite(im, dark)
        night.alpha_composite(out)
        both = Image.new("RGBA", (w * 2 + 6, h), (0, 0, 0, 0))
        both.paste(dbg, (0, 0))
        both.paste(night, (w + 6, 0))
        both.resize((both.width * 3, both.height * 3), Image.NEAREST).save(args.debug)


if __name__ == "__main__":
    main()
