# danaimone.com

Dan's personal site, live at https://danaimone.com. The top of the page is a scroll-driven pixel-art career walk: Dan and his Samoyed, Mishka, walk through Washington from a research lab (PNNL, 2017) past Chewy and Atlassian to Vannevar, with the Seattle skyline in the distance. The sky moves from dawn to night, Mount Rainier rises for the final reveal, and the walk ends inside a cabin with contact details. Below the walk is a résumé in Catppuccin Mocha, built from the same data as the downloadable PDF.

Built with Bun, Astro 7, Svelte 5, TypeScript, and canvas. The page is static HTML. The walk is one island: a framework-free game engine and a small Svelte overlay. UI text is Instrument Sans, with Pixelify Sans for headings and buttons; both are self-hosted. Characters, landmarks, scenery, icons, and the title logo are pixel-art sprites in `public/game/`. The sky and the era-by-era path are drawn in code.

### Art pipeline

Art was generated with GPT Image (via Codex) from the prompts in `scripts/art-prompts/`, using the avatar as the identity reference and the Dan sheet as the style reference for everything else. Raw generations are not committed. Each one is cleaned into true pixel art, and building night lights are extracted. The cabin is built differently: each layout is one scene painted from scratch on a 4 px art grid (`cabin-wide.txt`, then `cabin-hands.txt` for the hands, then `cabin-tall.txt` to repaint the same room for phones). The desk group was then repainted as a walnut sit-stand desk with Dan standing at it (`cabin-desk.txt`, and `cabin-desk-tall.txt` for phones), and only that group was laid back onto each painting. `scripts/build-cabin.py` uses each painting as painted, with nothing pasted on (it redraws one thing, the keyboard's grey front strip, as the walnut wrist rest Dan's keyboard has), measures the hearth for the fire the page simulates, and draws Mishka's breathing to fit it. The typing frames are painted too: `cabin-typing.txt` is run on a 16x close-up of the hands, once per finger pose, and only the finger pixels that changed are kept, with `room-layouts.json` as the manifest. The monitors are generated as flat key colors, so the masks come straight from the art. After any art build, run `python3 scripts/pack-art.py public/game`: it stores each image as an indexed PNG when that is pixel-identical and smaller, which roughly halves the art.

```sh
python3 scripts/pixelize.py raw/dan-sheet.png out/dan --frames 6 --height 84 --colors 28
python3 scripts/pixelize.py raw/lab.png public/game/lab.png --height 112 --colors 32
python3 scripts/asset-lights.py public/game/lab.png public/game/lab-lights.png --rule blue --share 0.6 --color b8f2d6 --max 2000 --region 0,0,0.8,1 --no-lamps
```

Scenery layers: cascades 92, foothills 84, meadow 38, seattle 104 (water tapered by hand), title 112 with `--strict-key`, icons 34 with `--strict-key`, 

Per-asset settings used: Mishka `--frames 6 --height 40 --colors 16`; Chewy office 231 (`--colors 40`), tower 224, labsnow 132, cabin 124, sign 50 (all `--colors 32`), rainier 240 (`--colors 64 --strict-key`). Lights: warehouse `--rule blue --share 0.8 --min 8 --max 300`; tower `--rule glass --share 0.38 --mullions --max 300`; labsnow `--rule teal --share 1 --color 7fd8ff --min 12 --max 3000`; cabin `--rule dark --share 1 --color ffcf6a --min 6 --region 0.3,0.5,1,0.85`.

## Development

Use [Bun](https://bun.sh). Install the locked dependencies:

```sh
bun install
bun run dev
```

The site runs at http://localhost:4321.

## Validation

```sh
bun test
bun run typecheck
bun run build
bun run preview
```

Before publishing, walk the whole page at desktop and phone widths. Check the arrow keys, Space and tap to jump, the timeline teleports and Back to Start, the Rainier reveal, the cabin finale forward and back, the pixel dissolve on section links, reduced motion, and the PDF link. Open the browser console and confirm there are no Content Security Policy violations.

## Production deployment

The site is static. In production nginx serves `dist/` behind a reverse proxy.

1. Copy `resume/private.example.mjs` to `resume/private.mjs`. That file holds the phone number for private PDFs and stays out of git.
2. Run `bun run resume` on a machine with the licensed fonts. `public/resume.pdf` is committed output and has no phone number.
3. Run `bun run build`.
4. Package `dist/`, copy it to the web server's root.
5. Reload nginx, then check the page, `/resume.pdf`, and the security headers through https://danaimone.com.

Pushing to `main` does not deploy.

## Security

- A strict Content Security Policy is generated at build time, with hashes for inline scripts and styles. Set dynamic styles through the CSSOM, because `style` attributes are blocked.
- The page makes no third-party requests. Fonts and images are served from the same origin.
- nginx allows only GET and HEAD, blocks dotfiles, and sends the usual hardening headers. HSTS is sent for the apex domain.
- HTML, the PDF, and images send `Cache-Control: no-cache`, so browsers revalidate. Hashed `_astro` files are cached for a year.

## Structure

- `src/data/resume.ts`: the résumé and contact links. The walk, the page, and the PDF all read it. Edit content here.
- `resume/`: tailored versions, the fact bank, and the private phone number. `bun run resume` builds the PDFs, and `bun run resume <version>` builds a tailored one. PDFs use licensed fonts from the folder named by `RESUME_FONTS` and fall back to Jost and Source Serif 4 when they are missing. The fonts stay out of git.
- `src/components/game/track.ts`: converts between scroll, world position, walk progress, and the finale.
- `src/components/game/simulation.ts`: the rules of the walk, with no browser: following, sprinting, jumps, gems, zones, teleport. Input and effects are plain data, so `bun test` covers it.
- `src/components/game/world.ts`: career stops, landmarks, and gems. To add a job, add it to the résumé and give it a place here; the compiler requires it.
- `src/components/game/assets.ts`: loads the art by name. If any image fails, the walk becomes a static hero and the résumé still works.
- `src/components/game/room-scene.ts`: the cabin's live scene: the fire (simulated in `fire.ts`), hand frames, candles, steam, Mishka, window lights, the Rex terminal, and Neovim showing `simulation.ts`.
- `src/components/game/terminal.ts`: the toy terminal on the monitor. It prints canned text and runs nothing.
- `src/components/game/engine.ts`: browser plumbing and drawing. It feeds the simulation and renders what the simulation reports.
- `src/components/game/CareerWalk.svelte`: the overlay: intro, cards, toolkit, toasts, timeline.
- `src/components/game/art.ts`: sky palettes and dithering, tiled scenery, path, gems.
- `public/game/`: sprites, scenery layers, building `-lights` layers, company logos, and icons.
- `scripts/pixelize.py`, `scripts/asset-lights.py`, `scripts/build-cabin.py`, `scripts/art-prompts/`: the art pipeline.
- `src/pages/index.astro`: page layout, metadata, the résumé sheet, About, and Contact.
- `src/styles/global.css`: tokens, walk overlays, pixel buttons, and the résumé sheet.
- `src/scripts/pixel-wipe.ts`: the pixel dissolve on in-page links.

The walk renders at a small logical resolution (about 480 × 300 on a laptop), scaled by a whole number of device pixels so every art pixel stays square and sharp. The cabin interior is a separate canvas at art resolution, for the same reason. Physics run at a fixed 60 steps per second on any display. See `GLOSSARY.md` for the terms used in the code. The loop stops when the walk is off screen. Skill gems are placed only where the verified history supports them; TypeScript, Node.js, and AWS sit at the cabin because they describe current day-to-day work, not a specific employer.

## Content verification

Roles, dates, and figures follow Dan's résumé, confirmed by Dan on October 30, 2026, plus his 2026 self-review for Vannevar. Dates are years only. Public text says "government users" and names no customers, units, or internal products.
