#!/usr/bin/env python3
"""Store every game image as an indexed PNG when it has 256 colours or fewer.

Pixel art has few colours, so an indexed file holds the same pixels in a third of the bytes. A file is rewritten
only when the result decodes to exactly the same RGBA pixels and is smaller.

    python3 scripts/pack-art.py public/game
"""
import io
import sys
from pathlib import Path

from PIL import Image

saved = 0
for path in sorted(Path(sys.argv[1]).rglob("*.png")):
    image = Image.open(path)
    rgba = image.convert("RGBA")
    colours = rgba.getcolors(256)
    if image.mode == "P" or colours is None:
        continue
    palette = [colour for _, colour in colours]
    index = {colour: i for i, colour in enumerate(palette)}
    packed = Image.new("P", rgba.size)
    packed.putdata([index[pixel] for pixel in rgba.getdata()])
    packed.putpalette([channel for colour in palette for channel in colour[:3]])
    buffer = io.BytesIO()
    packed.save(buffer, "PNG", optimize=True, transparency=bytes(colour[3] for colour in palette))
    before, after = path.stat().st_size, buffer.tell()
    if after < before and list(Image.open(buffer).convert("RGBA").getdata()) == list(rgba.getdata()):
        path.write_bytes(buffer.getvalue())
        saved += before - after
        print(f"{path.name}: {before} -> {after}")
print(f"saved {saved} bytes")
