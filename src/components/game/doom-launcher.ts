import type { Doom, DoomEnd } from "./doom";

// Doom is loaded only when someone types `doom` at the cabin's terminal. A launch
// that resolves after stop() never starts.
export function createDoomLauncher(host: HTMLElement, print: (line: string) => void) {
  let doom: Doom | null = null;
  let requested = false;

  function ended(end: DoomEnd) {
    doom = null;
    requested = false;
    print(end === "quit" ? "Back at the cabin." : "Doom did not load.");
  }

  return {
    launch() {
      if (requested) return;
      requested = true;
      import("./doom").then(
        ({ startDoom }) => {
          if (requested) doom = startDoom(host, ended);
        },
        () => ended("failed"),
      );
    },
    running: (): Doom | null => doom,
    requested: () => requested,
    stop() {
      requested = false;
      doom?.end("quit");
    },
  };
}
