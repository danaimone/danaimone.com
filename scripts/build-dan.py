#!/usr/bin/env python3
"""Build Dan's walk sheet from pixelized frames.

Sampling redraws small features differently in each frame, so the glasses and
eye shimmer as he walks. One head is cleaned, lowered, and given hand-placed
glasses, then stamped onto every frame at the position that fits it best.

    build-dan.py frames_dir public/game/dan.png
"""
import sys
from pathlib import Path

from PIL import Image

FRAMES = 6
SOURCE_FRAME = 4
HEAD_ROWS = 24
HEAD_COLUMNS = (15, 44)
SEARCH = 9
HAIR_ROWS_REMOVED = (5, 6, 7)
MIN_CROWN_WIDTH = 9

FRAME = (24, 22, 32, 255)
WHITE = (255, 255, 255, 255)
PUPIL = (20, 16, 26, 255)
SKIN = (248, 200, 150, 255)
CLEAR = (0, 0, 0, 0)


def opaque(pixel):
    return pixel[3] > 0


def source_head(frame):
    left, right = HEAD_COLUMNS
    head = frame.crop((left, 0, right, HEAD_ROWS))
    rows = [y for y in range(HEAD_ROWS) if y not in HAIR_ROWS_REMOVED]
    lowered = Image.new("RGBA", (head.width, len(rows)))
    for target, y in enumerate(rows):
        lowered.paste(head.crop((0, y, head.width, y + 1)), (0, target))
    return lowered


def strip_tufts(head):
    px = head.load()
    width, height = head.size
    for y in range(height):
        for x in range(width):
            if not opaque(px[x, y]):
                continue
            neighbours = sum(
                1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if 0 <= x + dx < width and 0 <= y + dy < height and opaque(px[x + dx, y + dy])
            )
            if neighbours < 2:
                px[x, y] = CLEAR


def trim_crown(head):
    px = head.load()
    width, height = head.size
    for y in range(height):
        filled = [x for x in range(width) if opaque(px[x, y])]
        if len(filled) >= MIN_CROWN_WIDTH:
            return
        for x in filled:
            px[x, y] = CLEAR


def find_glasses(head):
    """Return the darkest band's row and the face's front edge at that row."""
    px = head.load()
    width, height = head.size
    def darkness(y):
        return sum(1 for x in range(width // 2, width) if opaque(px[x, y]) and sum(px[x, y][:3]) < 200)
    row = max(range(height // 3, height - 4), key=darkness)
    front = max(x for x in range(width) if opaque(px[x, row]))
    return row, front


def draw_glasses(head, row, front):
    px = head.load()
    left, right = front - 6, front - 1
    top, bottom = row, row + 4
    for x in range(left, right + 1):
        for y in range(top - 2, bottom + 1):
            if opaque(px[x, y]):
                px[x, y] = SKIN
    for x in range(left + 1, right):
        px[x, top] = FRAME
        px[x, bottom] = FRAME
    for y in range(top + 1, bottom):
        px[left, y] = FRAME
        px[right, y] = FRAME
    for x in range(left - 8, left):
        if opaque(px[x, top + 1]):
            px[x, top + 1] = FRAME
    px[left + 1, top + 2] = WHITE
    for x, y in ((left + 2, top + 1), (left + 3, top + 1), (left + 2, top + 2), (left + 3, top + 2)):
        px[x, y] = PUPIL


def best_offset(frame, reference):
    """Where the source head sits in a frame, by matching opaque silhouettes."""
    base = reference.load()
    target = frame.load()
    best, best_score = (0, 0), -1
    for dx in range(-SEARCH, SEARCH + 1):
        for dy in range(0, SEARCH + 1):
            score = 0
            for y in range(reference.height):
                for x in range(reference.width):
                    fx, fy = x + HEAD_COLUMNS[0] + dx, y + dy
                    if 0 <= fx < frame.width and 0 <= fy < frame.height:
                        score += opaque(base[x, y]) == opaque(target[fx, fy])
            if score > best_score:
                best, best_score = (dx, dy), score
    return best


def stamp(frame, reference, head, offset):
    dx, dy = offset
    px = frame.load()
    for y in range(reference.height):
        for x in range(frame.width):
            if y + dy < frame.height:
                if x < HEAD_COLUMNS[0] + dx - 2 or x > HEAD_COLUMNS[1] + dx + 2:
                    continue
                px[x, y + dy] = CLEAR
    bottom = dy + reference.height
    frame.alpha_composite(head, (HEAD_COLUMNS[0] + dx, dy + HAIR_LIFT))
    return bottom


HAIR_LIFT = len(HAIR_ROWS_REMOVED)


def main():
    frames_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
    frames = [Image.open(frames_dir / f"{i}.png").convert("RGBA") for i in range(FRAMES)]
    reference = frames[SOURCE_FRAME].crop((HEAD_COLUMNS[0], 0, HEAD_COLUMNS[1], HEAD_ROWS))
    head = source_head(frames[SOURCE_FRAME])
    strip_tufts(head)
    trim_crown(head)
    row, front = find_glasses(head)
    draw_glasses(head, row, front)
    offsets = [best_offset(frame, reference) for frame in frames]
    width, height = frames[0].size
    sheet = Image.new("RGBA", (width * FRAMES, height))
    for i, (frame, offset) in enumerate(zip(frames, offsets)):
        stamp(frame, reference, head, offset)
        sheet.paste(frame, (i * width, 0))
    sheet.save(out, optimize=True)
    print("frame", width, height, "offsets", offsets, "glasses", row, front)


if __name__ == "__main__":
    main()
