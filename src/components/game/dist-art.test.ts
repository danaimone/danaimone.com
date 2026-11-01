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

async function namesLoadArtRequests() {
  const names: string[] = [];
  mock.module("./art-url", () => ({ gameUrl: (name: string) => (names.push(name), name) }));
  globalThis.Image = class {
    src = "";
    decode = async () => {};
  } as unknown as typeof Image;
  const { loadArt } = await import("./assets");
  await loadArt();
  return names;
}

describe("built game art", () => {
  test("dist is built from the current art", () => {
    expect(existsSync(join(DIST, "index.html"))).toBe(true);
    const built = statSync(join(DIST, "index.html")).mtimeMs;
    const stale = filesUnder("public/game").filter((file) => statSync(file).mtimeMs > built);
    expect(stale).toEqual([]);
  });

  test("every image loadArt requests is a hashed file the bundle points at", async () => {
    const names = await namesLoadArtRequests();
    expect(names.length).toBeGreaterThan(40);
    const hashed = filesUnder(join(DIST, "_astro")).filter((file) => file.endsWith(".png"));
    const byContent = new Map(hashed.map((file) => [sha(file), file]));
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

  test("no page or script points at a fixed-name /game/ image", () => {
    const offenders = filesUnder(DIST)
      .filter((file) => /\.(html|js)$/.test(file))
      .filter((file) => /(?<!\/public)\/game\/[\w/-]+\.png/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
