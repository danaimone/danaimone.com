# danaimone.com

[![CI](https://github.com/danaimone/danaimone.com/actions/workflows/ci.yml/badge.svg)](https://github.com/danaimone/danaimone.com/actions/workflows/ci.yml)

<p>
  <img src="docs/readme/walk.png" alt="Pixel-art Dan and his Samoyed walking past the Chewy office and the Seattle skyline by day, with the career timeline along the bottom" width="32%" />
  <img src="docs/readme/rainier.png" alt="Mount Rainier at night above the cabin, with skill gems popping up as Dan walks" width="32%" />
  <img src="docs/readme/cabin.png" alt="Inside the cabin: Dan at a standing desk with a working terminal on the monitor, a fire, and the dog asleep on the rug" width="32%" />
</p>

My personal site, live at https://danaimone.com. The top of the page is a pixel-art walk through my career that you drive by scrolling. My Samoyed, Mishka, and I walk through Washington from PNNL in 2017 to Vannevar today, while the sky goes from dawn to night. It ends in a cabin under Mount Rainier with a terminal you can type in. Below the walk is my résumé, built from the same data as the PDF.

Built with Bun, Astro, Svelte 5 and TypeScript. The page is static HTML. The walk runs on a small canvas engine I wrote, with a Svelte overlay on top.

## What's interesting

- **Simulation is separate from drawing.** The rules of the walk run at a fixed 60 steps per second and never touch the browser. Input and effects are plain data, so `bun test` covers them.
- **One small contract per canvas.** Every canvas sits behind `resize`, `paint` and `cut`. Adding a layer means writing one surface and adding it to the engine's list.
- **Sharp pixels.** The world renders at a small resolution, scales by a whole number of device pixels, and scrolls in device pixels, so the art never blurs.
- **Refactors are checked to the pixel.** `scripts/walk-frames.mjs` replays the walk under a fake clock and seeded randomness at several screen sizes, then diffs against an earlier capture.
- **Strict CSP, no third parties.** The policy is generated at build time with hashes for inline code. Fonts and images come from the same origin, and there's no tracking.
- **Works without JavaScript.** With scripts off, the walk becomes a still image and the résumé reads as normal.
- **Doom on the cabin monitor.** `scripts/build-doom.sh` builds it from pinned, checksummed sources, and the page loads it only when you ask for it.

## Run it

```sh
bun install
bun run dev        # http://localhost:4321
bun run typecheck
bun run build
bun test           # unit tests, no build needed
bun run test:dist  # checks dist/, run after a build
```

CI runs typecheck, build, `bun test` and `test:dist` on every pull request and push to `main`. Pushing to `main` does not deploy.

`bun run resume` builds the PDF. Private details and tailored versions stay out of the repo. `resume/private.example.mjs` and `resume/versions/example.ts` show their shape.

## Where to start reading

- `src/data/resume.ts`: the résumé and contact links. The walk, the page and the PDF all read it.
- `src/components/game/engine.ts`: runs each frame. It feeds input to the simulation, turns its effects into page events, and draws nothing itself.
- `src/components/game/simulation.ts`: the rules of the walk, with no browser.
- `src/components/game/surface.ts`: the canvas contract and the layout every surface shares.
- `src/components/game/world.ts`: where each job, landmark and gem sits.
- `src/components/game/room-scene.ts` and `terminal.ts`: the cabin and its toy shell.
- `src/pages/index.astro`: the page itself.

[`GLOSSARY.md`](GLOSSARY.md) defines the terms the code uses.

## Licence

The code is MIT licensed (see [`LICENSE`](LICENSE)). The artwork and the résumé text are not: they depict me and my dog, and are all rights reserved. Doom and the fonts carry their own licences. See [`NOTICE.md`](NOTICE.md).
