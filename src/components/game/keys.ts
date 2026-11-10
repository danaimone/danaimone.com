import type { Doom } from "./doom";
import type { WalkDirection } from "./simulation";

// Asked in this order, and only when needed: `pinned` measures layout, and `type`
// prints to the terminal.
export type KeyTargets = {
  doom(): Doom | null;
  atDesk(): boolean;
  pinned(): boolean;
  type(key: string): boolean;
  jump(): void;
};

// The keyboard: arrows walk, space, up or w jump, typing reaches the terminal at
// the desk, and every key goes to Doom while it runs.
export function listenForKeys(targets: KeyTargets) {
  const held = new Set<string>();

  function onKeyDown(event: KeyboardEvent) {
    const doom = targets.doom();
    if (doom) {
      doom.keyDown(event);
      return;
    }
    const inControl = event.target instanceof Element && event.target.closest("a, button, input, textarea");
    if (targets.atDesk() && targets.pinned() && !inControl && !event.metaKey && !event.ctrlKey && !event.altKey && targets.type(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (!targets.pinned()) return;
      event.preventDefault();
      held.add(event.key);
      return;
    }
    if (event.key !== " " && event.key !== "ArrowUp" && event.key !== "w") return;
    if (inControl || !targets.pinned()) return;
    event.preventDefault();
    targets.jump();
  }

  function onKeyUp(event: KeyboardEvent) {
    targets.doom()?.keyUp(event);
    held.delete(event.key);
  }

  const release = () => held.clear();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", release);

  return {
    direction(pinned: boolean): WalkDirection {
      if (!pinned) return 0;
      if (held.has("ArrowRight") === held.has("ArrowLeft")) return 0;
      return held.has("ArrowRight") ? 1 : -1;
    },
    stop() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    },
  };
}
