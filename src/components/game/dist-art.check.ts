import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

async function namesTheWalkRequests() {
  let names: string[] = [];
  mock.module("./art-url", () => ({ gameUrl: (name: string) => (names.push(name), name) }));
  globalThis.Image = class {
    src = "";
    decode = async () => {};
  } as unknown as typeof Image;
  const { loadArt, loadRoom } = await import("./assets");
  await loadArt();
  const walk = names;
  names = [];
  await Promise.all([loadRoom("wide"), loadRoom("tall")]);
  return { walk, room: names };
}

let requested: ReturnType<typeof namesTheWalkRequests> | undefined;
const walkRequests = () => (requested ??= namesTheWalkRequests());

const hashedByContent = () => new Map(filesUnder(join(DIST, "_astro")).filter((file) => file.endsWith(".png")).map((file) => [sha(file), file]));

describe("built game art", () => {
  test("dist is built from the current art", () => {
    expect(existsSync(join(DIST, "index.html"))).toBe(true);
    const built = statSync(join(DIST, "index.html")).mtimeMs;
    const stale = filesUnder("public/game").filter((file) => statSync(file).mtimeMs > built);
    expect(stale).toEqual([]);
  });

  test("every image the walk requests is a hashed file the bundle points at", async () => {
    const { walk, room } = await walkRequests();
    const names = [...walk, ...room];
    expect(names.length).toBeGreaterThan(30);
    const byContent = hashedByContent();
    const bundle = filesUnder(join(DIST, "_astro"))
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const missing = names.filter((name) => {
      const file = byContent.get(sha(`public/game/${name}.png`));
      return !file || !/\.[\w-]{8}\.png$/.test(file) || !bundle.includes(`/_astro/${file.split("/").pop()}`);
    });
    expect(missing).toEqual([]);
  });

  test("the page head preloads exactly the art the walk waits for before its first frame", async () => {
    const { walk } = await walkRequests();
    const byContent = hashedByContent();
    const expected = walk.map((name) => `/_astro/${byContent.get(sha(`public/game/${name}.png`))?.split("/").pop()}`);
    const head = readFileSync(join(DIST, "index.html"), "utf8").split("</head>")[0];
    const preloaded = [...head.matchAll(/\/_astro\/[\w.-]+\.png/g)].map(([url]) => url);
    expect(preloaded.sort()).toEqual(expected.sort());
  });

  test("no page or script points at a fixed-name /game/ image", () => {
    const offenders = filesUnder(DIST)
      .filter((file) => /\.(html|js)$/.test(file))
      .filter((file) => /(?<!\/public)\/game\/[\w/-]+\.png/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
