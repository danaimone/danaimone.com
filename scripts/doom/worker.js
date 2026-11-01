
// SPDX-License-Identifier: GPL-2.0-or-later
const FRAME_BYTES = 320 * 200 * 4;

const inflate = async (compressed) =>
  new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());

function play(game) {
  self.onmessage = ({ data }) => {
    try {
      if (data.type === "key") {
        game._site_key(data.down ? 1 : 0, data.code);
        return;
      }
      for (let i = 0; i < data.count; i++) game._site_tick();
      const pixels = data.spare ?? new Uint8ClampedArray(FRAME_BYTES);
      pixels.set(game.HEAPU8.subarray(game._site_rgba(), game._site_rgba() + FRAME_BYTES));
      self.postMessage({ type: "frame", pixels }, [pixels.buffer]);
    } catch {
      self.postMessage({ type: "ended" });
    }
  };
}

self.onmessage = async ({ data }) => {
  try {
    const [wasmBinary, wad] = await Promise.all([inflate(data.wasm), inflate(data.wad)]);
    const failed = () => self.postMessage({ type: "failed" });
    const instantiateWasm = (imports, done) => {
      WebAssembly.instantiate(wasmBinary, imports).then(({ instance }) => done(instance), failed);
    };
    const game = await createDoom({ instantiateWasm, print() {}, printErr() {} });
    game.FS.writeFile("/freedoom1.wad", wad);
    game._site_start();
    play(game);
    self.postMessage({ type: "ready" });
  } catch {
    self.postMessage({ type: "failed" });
  }
};
