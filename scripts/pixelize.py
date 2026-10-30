#!/usr/bin/env python3
"""Turn a generated "pixel art" image into real pixel art.

Image models draw pixel art as soft, slightly uneven blocks. This keys out the
flat background, finds the art's block size, samples one colour per block,
limits the palette, and trims to the content, so the result can be drawn 1:1
on the walk canvas and scaled by whole numbers.

    pixelize.py in.png out.png [--cell N] [--colors 24] [--key ff00ff]
    pixelize.py sheet.png out_dir --frames 6     # slice a one-row sprite sheet
"""
import argparse
from pathlib import Path

from PIL import Image


def key_out(im, key, tol, strict=False):
    im = im.convert("RGBA")
    kr, kg, kb = key
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            # Magenta-ish: strong red and blue, weak green.
            near = abs(r - kr) + abs(g - kg) + abs(b - kb) < tol
            pinkish = not strict and r > 150 and b > 150 and g < 110 and abs(r - b) < 90
            if a < 128 or near or pinkish:
                px[x, y] = (0, 0, 0, 0)
    return im


def edges(im, axis):
    """Positions along one axis where the colour jumps, sampled on many lines."""
    rgb = im.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    out = []
    lines = range(0, h if axis == 0 else w, 5)
    for line in lines:
        for i in range(1, w if axis == 0 else h):
            a = px[i, line] if axis == 0 else px[line, i]
            b = px[i - 1, line] if axis == 0 else px[line, i - 1]
            if sum(abs(x - y) for x, y in zip(a, b)) > 70:
                out.append(i)
    return out


def detect_cell(im, lo=3.0, hi=24.0):
    """Block size and phase that put the most colour edges on grid lines.

    A real block size s also scores well at 2s, 3s... but not at s/2, so the
    score is normalised by how many grid lines a size implies; the smallest
    size that explains most edges wins.
    """
    xs = edges(im, 0) + edges(im, 1)
    if not xs:
        return lo
    best = None
    s = lo
    while s <= hi:
        top = 0
        for k in range(0, 8):
            phase = s * k / 8
            hit = sum(1 for x in xs if abs(((x - phase + s / 2) % s) - s / 2) <= 0.75)
            top = max(top, hit)
        # Fraction of edges explained, minus the chance rate for this size.
        score = top / len(xs) - 1.5 / s
        if best is None or score > best[0] + 0.01:
            best = (score, s)
        s += 0.05
    return best[1]


def sample(im, cell):
    cols, rows = int(im.width / cell), int(im.height / cell)
    out = Image.new("RGBA", (cols, rows))
    src = im.load()
    dst = out.load()
    for y in range(rows):
        for x in range(cols):
            # Majority of a small 3x3 neighbourhood around the block centre,
            # which ignores the soft edges between blocks.
            cx, cy = int((x + 0.5) * cell), int((y + 0.5) * cell)
            votes = {}
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    p = src[min(im.width - 1, max(0, cx + dx)), min(im.height - 1, max(0, cy + dy))]
                    k = (p[0] // 8, p[1] // 8, p[2] // 8, 255 if p[3] > 127 else 0)
                    votes.setdefault(k, []).append(p)
            group = max(votes.values(), key=len)
            r = sum(p[0] for p in group) // len(group)
            g = sum(p[1] for p in group) // len(group)
            b = sum(p[2] for p in group) // len(group)
            a = 255 if group[0][3] > 127 else 0
            dst[x, y] = (r, g, b, a)
    return out


def quantize(im, colors):
    alpha = im.getchannel("A")
    rgb = im.convert("RGB").quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = rgb.convert("RGBA")
    out.putalpha(alpha.point(lambda a: 255 if a > 127 else 0))
    return out


def clean_specks(im):
    """Drop isolated opaque pixels left over from the background edge."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            n = sum(
                1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if 0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3]
            )
            if n == 0:
                px[x, y] = (0, 0, 0, 0)
    return im


def defringe(im):
    """Remove background-tinted pixels the key missed.

    Magenta that bled into edge pixels survives keying as muddy purple-pink.
    On the silhouette edge it becomes transparent; inside, it takes the most
    common neighbouring colour. Blue-leaning purples (lupines) are kept.
    """
    px = im.load()
    w, h = im.size
    tinted = lambda r, g, b: r > 60 and b > 55 and g < 0.62 * min(r, b) and abs(r - b) < 45
    for _ in range(2):
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if not a or not tinted(r, g, b):
                    continue
                around = [px[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < w and 0 <= y + dy < h]
                if any(n[3] == 0 for n in around) or len(around) < 4:
                    px[x, y] = (0, 0, 0, 0)
                    continue
                good = [n for n in around if not tinted(*n[:3])]
                if good:
                    px[x, y] = max(good, key=good.count)
    return im


def frames(im, count):
    """Split a one-row sheet at the empty columns between figures."""
    w, h = im.size
    alpha = im.getchannel("A").load()
    filled = [any(alpha[x, y] for y in range(h)) for x in range(w)]
    spans, start = [], None
    for x, f in enumerate(filled + [False]):
        if f and start is None:
            start = x
        elif not f and start is not None:
            spans.append((start, x))
            start = None
    # Merge slivers (detached hands, hair tufts) into their nearest neighbour.
    while len(spans) > count:
        gaps = [spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)]
        i = gaps.index(min(gaps))
        spans[i : i + 2] = [(spans[i][0], spans[i + 1][1])]
    boxes = []
    for a, b in spans:
        sub = im.crop((a, 0, b, h))
        bb = sub.getbbox()
        boxes.append(sub.crop(bb))
    fw = max(f.width for f in boxes)
    fh = max(f.height for f in boxes)
    out = []
    for f in boxes:
        canvas = Image.new("RGBA", (fw, fh))
        # Centre horizontally, sit every frame on the same baseline.
        canvas.paste(f, ((fw - f.width) // 2, fh - f.height))
        out.append(canvas)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--cell", type=float)
    ap.add_argument("--height", type=int, help="target height in art pixels of the tallest content")
    ap.add_argument("--colors", type=int, default=24)
    ap.add_argument("--key", default="ff00ff")
    ap.add_argument("--tol", type=int, default=140)
    ap.add_argument("--frames", type=int)
    ap.add_argument("--no-key", action="store_true")
    ap.add_argument("--strict-key", action="store_true", help="keep pinks and purples that are in the art")
    args = ap.parse_args()

    im = Image.open(args.src).convert("RGBA")
    key = tuple(int(args.key[i : i + 2], 16) for i in (0, 2, 4))
    if not args.no_key:
        im = key_out(im, key, args.tol, args.strict_key)
    if args.height:
        box = im.getbbox()
        im = im.crop(box)
        cell = im.height / args.height
    else:
        cell = args.cell or detect_cell(im.convert("RGB").crop(im.getbbox()))
    art = quantize(sample(im, cell), args.colors)
    art = clean_specks(art if args.strict_key else defringe(art))
    print(f"{args.src}: cell {cell:.1f}px -> {art.width}x{art.height}")
    if args.frames:
        out = Path(args.dst)
        out.mkdir(parents=True, exist_ok=True)
        fs = frames(art, args.frames)
        for i, f in enumerate(fs):
            f.save(out / f"{i}.png")
        print(f"{len(fs)} frames, {fs[0].width}x{fs[0].height}")
    else:
        art = art.crop(art.getbbox())
        art.save(args.dst)
        print(f"trimmed {art.width}x{art.height}")


if __name__ == "__main__":
    main()
