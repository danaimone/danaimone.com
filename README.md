# danaimone.com

Dan's personal site. The top of the page is a scroll-driven pixel-art career walk: Dan and his Samoyed, Mishka, walk from a research lab (PNNL, 2017) past Chewy and Atlassian to Vannevar, ending at a cabin under Mount Rainier with contact details. The sky moves from dawn to night along the way. Below the walk is a plain résumé with the same content, which also prints as a one-page PDF.

Built with Astro, Svelte 5, TypeScript, and a single `<canvas>`. The page is static HTML. The walk is one island: a framework-free game engine and a small Svelte overlay. All UI text is set in Instrument Sans. Dan, Mishka, the landmarks, and Rainier are pixel-art sprites in `public/game/`; the sky, sun, moon, and path are drawn in code.

### Art pipeline

Sprites were generated with GPT Image (via Codex) from the prompts in `scripts/art-prompts/`, using the avatar as the identity reference and the Dan sheet as the style reference for everything else. Raw generations are not committed. Each one is cleaned into true pixel art and its night lights are extracted:

```sh
python3 scripts/pixelize.py raw/dan-sheet.png out/dan --frames 6 --height 84 --colors 28
python3 scripts/pixelize.py raw/lab.png public/game/lab.png --height 112 --colors 32
python3 scripts/asset-lights.py public/game/lab.png public/game/lab-lights.png --rule blue --share 0.6 --color b8f2d6
```

Scenery layers: cascades 92, foothills 84, meadow 38, seattle 104 (water tapered by hand), title 112 with `--strict-key`, icons 34 with `--strict-key`, interior `--cell 2.6`, interior-tall `--cell 2.61`, both `--no-key`.

Per-asset settings used: Mishka `--frames 6 --height 40 --colors 16`; warehouse 150 (`--colors 40`), tower 224, labsnow 132, cabin 124, sign 50 (all `--colors 32`), rainier 240 (`--colors 64 --strict-key`). Lights: warehouse `--rule blue --share 0.8 --min 8 --max 300`; tower `--rule glass --share 0.38 --mullions --max 300`; labsnow `--rule teal --share 1 --color 7fd8ff --min 12 --max 3000`; cabin `--rule dark --share 1 --color ffcf6a --min 6 --region 0.3,0.5,1,0.85`.

## Development

Use [Bun](https://bun.sh). Install the locked dependencies:

```sh
bun install
bun run dev
```

The site runs at http://localhost:4321.

## Validation

```sh
bun run typecheck
bun run build
bun run preview
```

Before publishing, walk the whole page at desktop and phone widths. Check the arrow keys, Space and tap to jump, the timeline buttons, the cabin finale forward and back, reduced motion, `#resume`, and the PDF link.

## Production deployment

The site is static. `bun run build` writes `dist/`, and in production nginx serves it behind a reverse proxy. `bun run resume` must run first on a machine with the licensed fonts, because `public/resume.pdf` is committed output. Copy `resume/private.example.mjs` to `resume/private.mjs` first; that file holds the phone number for private PDFs and stays out of git.

## Structure

- `src/data/resume.ts`: the résumé. The walk, the page, and the PDF all read it. Edit content here.
- `resume/`: tailored versions, the fact bank, and the private phone number. `bun run resume` builds the PDFs, and `bun run resume <version>` builds a tailored one. PDFs use licensed fonts from the folder named by `RESUME_FONTS` and fall back to Jost and Source Serif 4 when they are missing. The fonts stay out of git.
- `src/components/game/engine.ts`: the game, with no framework: scroll mapping, movement, camera, parallax, gems, and the cabin finale. It reports what happens through `WalkEvents`.
- `src/components/game/CareerWalk.svelte`: the overlay: intro, cards, toolkit, toasts, and timeline.
- `src/components/game/art.ts`: sky palettes and dithering, mountains, trees, clouds, path, gems.
- `public/game/`: character strips, landmarks and their `-lights` layers, Rainier.
- `scripts/pixelize.py`, `scripts/asset-lights.py`, `scripts/art-prompts/`: the art pipeline.
- `src/pages/index.astro`: page layout, metadata, and the plain résumé.
- `src/styles/global.css`: tokens, walk overlays, résumé, print styles.

The walk renders at a small logical resolution (about 480 × 300 on a laptop), scaled by a whole number of device pixels so every art pixel stays square and sharp. The loop stops when the walk is off screen. Skill gems are placed only where the verified history supports them; TypeScript, Node.js, and AWS sit at the cabin because they describe current day-to-day work, not a specific employer.

## Content verification

Roles, dates, and figures follow Dan's August 2025 résumé, confirmed by Dan on October 30, 2026. Chewy shows a year only because that job overlapped the start at Atlassian. Vannevar is not on that résumé yet.
