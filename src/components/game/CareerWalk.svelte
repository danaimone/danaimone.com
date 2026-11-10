<script lang="ts">
  import { onMount } from "svelte";
  import { EMAIL, elsewhere, experience } from "../../data/resume";
  import { gameUrl } from "./art-url";
  import { PARALLAX_LAYERS, startWalk } from "./engine";
  import type { Zone } from "./simulation";
  import { BACK_TO_START, GEMS, STOPS, TIMELINE } from "./world";

  type Toast = { id: number; text: string; x: number; tone: "gem" | "level" };

  const TOAST_MS = 1600;
  const COPIED_MS = 2400;

  let stage: HTMLElement;
  let view: HTMLElement;
  let canvas: HTMLCanvasElement;
  let layers: HTMLCanvasElement[] = [];
  let plane: HTMLCanvasElement;
  let actors: HTMLCanvasElement;
  let room: HTMLCanvasElement;
  let skip: HTMLAnchorElement;
  let mainScreen: HTMLCanvasElement;
  let sideScreen: HTMLCanvasElement;
  let walk: ReturnType<typeof startWalk> | undefined;

  let zone = $state<Zone>("intro");
  let inside = $state(false);
  let unavailable = $state(false);
  let collected = $state<string[]>([]);
  let toasts = $state<Toast[]>([]);
  let progress = $state(0);
  let copied = $state(false);
  let nextToast = 0;

  const stop = $derived(experience.find((s) => s.id === zone));
  const cardSide = (id: string) => STOPS.find((s) => s.id === id)?.cardSide;

  function cssProps(node: HTMLElement, props: Record<string, string | number>) {
    const apply = (next: Record<string, string | number>) => {
      for (const [name, value] of Object.entries(next)) node.style.setProperty(name, String(value));
    };
    apply(props);
    return { update: apply };
  }

  onMount(() => {
    walk = startWalk(
      { stage, view, canvas, layers, plane, actors, room, screens: { main: mainScreen, side: sideScreen } },
      {
        zone: (next) => (zone = next),
        inside: (next) => (inside = next),
        unavailable: () => (unavailable = true),
        open(place) {
          if (place === "pdf") window.open("/resume.pdf", "_blank", "noopener");
          else skip.click();
        },
        collected: (labels) => (collected = labels),
        progress: (next) => (progress = next),
        toast(text, x, tone) {
          const id = ++nextToast;
          const jobCard = view.querySelector(".walk-card.is-shown:not(.walk-contact)");
          view.style.setProperty("--card-floor", `${jobCard?.getBoundingClientRect().bottom ?? 0}px`);
          toasts = [...toasts.slice(-3), { id, text, x, tone }];
          setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), TOAST_MS);
        },
      },
    );
    return () => walk?.stop();
  });

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(EMAIL);
      copied = true;
      setTimeout(() => (copied = false), COPIED_MS);
    } catch {
      window.location.href = `mailto:${EMAIL}`;
    }
  }
</script>

<section class="walk" class:is-unavailable={unavailable} bind:this={stage} aria-label="Career walk">
  <div class="walk-view" bind:this={view}>
    <canvas bind:this={room} class="walk-room" aria-hidden="true" hidden></canvas>
    <canvas bind:this={mainScreen} class="walk-screen" aria-hidden="true" hidden></canvas>
    <canvas bind:this={sideScreen} class="walk-screen" aria-hidden="true" hidden></canvas>
    <canvas
      bind:this={canvas}
      class="walk-canvas"
      role="img"
      aria-label="A pixel-art walk through Dan’s career: Dan and his Samoyed, Mishka, walk from a research lab past the Chewy office and a tower to the present, then into a cabin under Mount Rainier."
      onclick={() => walk?.jump()}
    ></canvas>
    {#each { length: PARALLAX_LAYERS }, i (i)}
      <canvas bind:this={layers[i]} class="walk-canvas walk-layer" aria-hidden="true"></canvas>
    {/each}
    <canvas bind:this={plane} class="walk-canvas walk-plane" aria-hidden="true"></canvas>
    <canvas bind:this={actors} class="walk-canvas walk-actors" aria-hidden="true"></canvas>

    <div class="walk-intro" class:is-shown={zone === "intro"}>
      <h1><img src={gameUrl("title")} alt="Dan Aimone" width="286" height="112" /></h1>
      <p class="walk-lede">
        AI-native software engineer at Vannevar, building agentic products
        end to end, from the harness to the interface. Previously Atlassian
        and Chewy.
      </p>
      <div class="walk-actions">
        <a class="button" href={`mailto:${EMAIL}`}>Email me</a>
        <a class="button is-quiet" href="#resume">Résumé</a>
        <p class="walk-hint">
          <span class="hint-key">
            Scroll or <kbd>←</kbd> <kbd>→</kbd> to walk. <kbd>Space</kbd> to jump.
          </span>
          <span class="hint-tap">Scroll to walk. Tap to jump.</span>
        </p>
      </div>
    </div>

    <a bind:this={skip} class="walk-skip" class:is-shown={zone !== "intro" && !inside} href="#resume">Skip to résumé</a>

    <div class="walk-toolkit" class:is-shown={zone !== "intro"} aria-live="polite">
      <span class="walk-toolkit-count">Toolkit {collected.length}/{GEMS.length}</span>
      <span class="walk-toolkit-items">{collected.join(", ")}</span>
    </div>

    {#each experience as s (s.id)}
      <article class={`walk-card is-${cardSide(s.id)}`} class:is-shown={stop?.id === s.id} aria-hidden={stop?.id !== s.id}>
        <header>
          <h2>{s.company}</h2>
          <p>{s.span}</p>
        </header>
        {#each s.roles as role (role.title + role.years)}
          <div class="walk-role">
            <h3>{role.title}</h3>
            {#if s.roles.length > 1}
              <p class="walk-role-years">{role.years}</p>
            {/if}
            <ul><li>{role.bullets[0]}</li></ul>
          </div>
        {/each}
      </article>
    {/each}

    <article class="walk-card walk-contact" class:is-shown={zone === "contact"} aria-hidden={zone !== "contact"}>
      <header><h2>Contact</h2></header>
      <a class="walk-email" href={`mailto:${EMAIL}`} tabindex={zone === "contact" ? 0 : -1}>{EMAIL}</a>
      <div class="walk-contact-row">
        <button type="button" class="copy copy-email" onclick={copyEmail} tabindex={zone === "contact" ? 0 : -1}>
          <span aria-live="polite">{copied ? "Copied" : "Copy email"}</span>
        </button>
        <button type="button" class="copy" onclick={() => walk?.teleport(BACK_TO_START)} tabindex={zone === "contact" ? 0 : -1}>
          Walk again
        </button>
        {#each elsewhere.slice(0, 2) as [label, href] (label)}
          <a {href} rel="me" tabindex={zone === "contact" ? 0 : -1}>{label}</a>
        {/each}
        <a href="#resume" tabindex={zone === "contact" ? 0 : -1}>Résumé</a>
      </div>
      <p class="walk-terminal-hint hint-key">The terminal works. Try typing <kbd>help</kbd></p>
    </article>

    <div class="walk-toasts" aria-hidden="true">
      {#each toasts as toast (toast.id)}
        <span class={`walk-toast is-${toast.tone}`} use:cssProps={{ "--wx": toast.x }}>
          {toast.tone === "gem" ? `+ ${toast.text}` : toast.text}
        </span>
      {/each}
    </div>

    <nav class="walk-timeline" class:is-inside={inside} inert={inside} aria-label="Jump along the walk">
      <div class="walk-track" aria-hidden="true">
        <span use:cssProps={{ transform: `scaleX(${progress})` }}></span>
      </div>
      <ol>
        {#each TIMELINE as mark (mark.label)}
          <li use:cssProps={{ "--at": mark.at }}>
            <button type="button" class:is-passed={progress >= mark.at - 0.01} onclick={(event) => {
                walk?.teleport(mark.destination);
                if (event.detail > 0) event.currentTarget.blur();
              }}
            >
              <span class="walk-year">{mark.caption}</span>
              {mark.label}
            </button>
          </li>
        {/each}
      </ol>
    </nav>
  </div>
</section>
