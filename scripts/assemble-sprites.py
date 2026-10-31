#!/usr/bin/env python3
"""Assemble Dan's and Mishka's sheets from PixelLab frames.

    assemble-sprites.py frames_dir mishka-base.png public/game
"""
import sys
from pathlib import Path

from PIL import Image

DAN = (57, 78)
MISHKA = (51, 38)
DAN_SEQUENCE = [f"loopb-{i}" for i in range(8)] + ["leap-0"] + [f"leap-{i}" for i in range(2, 7)]
MISHKA_SEQUENCE = [f"m-walk-{i}" for i in range(8)] + ["m-sit-6"]
MISHKA_LEAP_FRAME = 5
HEAD_SOURCE = "head-1"
NECK_ROWS = range(18, 36)
HAZEL_EYE = [((34, 16), (154, 116, 46, 255)), ((35, 16), (125, 138, 66, 255)), ((34, 17), (125, 138, 66, 255))]


def planted(frame, size):
    out = Image.new("RGBA", size)
    out.paste(frame, (0, size[1] - frame.getbbox()[3]))
    return out


def neck(frame):
    """Row and centre of the narrowest span between head and shoulders."""
    px = frame.load()
    def span(y):
        return [x for x in range(frame.width) if px[x, y][3]]
    row = min(NECK_ROWS, key=lambda y: (len(span(y)) or frame.width, y))
    columns = span(row)
    return row, (columns[0] + columns[-1]) // 2


def lock_head(frame, head, head_neck, target):
    row, centre = target
    frame.paste((0, 0, 0, 0), (0, 0, frame.width, row))
    frame.alpha_composite(head, (centre - head_neck[1], row - head_neck[0]))


def steady(necks):
    """Correct a misread collar: a neck can't sit above both neighbours or jump sideways."""
    count = len(necks)
    def fixed(i):
        before, (row, centre), after = necks[i - 1], necks[i], necks[(i + 1) % count]
        return max(row, min(before[0], after[0])), sorted((before[1], centre, after[1]))[1]
    return [fixed(i) for i in range(count)]


def locked_heads(frames, source):
    for point, color in HAZEL_EYE:
        source.putpixel(point, color)
    head_neck = neck(source)
    head = source.crop((0, 0, source.width, head_neck[0]))
    targets = steady([neck(frame) for frame in frames])
    for frame, target in zip(frames, targets):
        lock_head(frame, head, head_neck, target)
    return targets


def sheet(frames, size):
    out = Image.new("RGBA", (size[0] * len(frames), size[1]))
    for i, frame in enumerate(frames):
        out.paste(frame, (i * size[0], 0))
    return out


def load(frames_dir, name):
    return Image.open(frames_dir / f"{name}.png").convert("RGBA")


def main():
    frames_dir, mishka_base, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    dan = [planted(load(frames_dir, name), DAN) for name in DAN_SEQUENCE]
    print(locked_heads(dan, load(frames_dir, sys.argv[4] if len(sys.argv) > 4 else HEAD_SOURCE)))
    sheet(dan, DAN).save(out / "dan.png", optimize=True)
    mishka = [planted(load(frames_dir, name), MISHKA) for name in MISHKA_SEQUENCE]
    width, height = MISHKA
    left = MISHKA_LEAP_FRAME * width
    leap = Image.open(mishka_base).convert("RGBA").crop((left, 0, left + width, height))
    sheet(mishka + [leap], MISHKA).save(out / "mishka.png", optimize=True)


if __name__ == "__main__":
    main()
