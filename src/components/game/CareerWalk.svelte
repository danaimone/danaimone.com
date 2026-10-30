<script lang="ts">
  import { onMount } from "svelte";
  import { EMAIL, elsewhere, experience } from "../../data/resume";
  import { SOIL_DEPTH } from "./art";
  import { END, GEMS, START, TIMELINE, WALK_SHARE, startWalk, type Side, type ToastTone } from "./engine";

  type Toast = { id: number; text: string; x: number; tone: ToastTone };

  const TOAST_MS = 1600;
  const COPIED_MS = 2400;

  let stage: HTMLElement;
  let view: HTMLElement;
  let canvas: HTMLCanvasElement;
  let room: HTMLCanvasElement;
  let walk: ReturnType<typeof startWalk> | undefined;

  let zone = $state("intro");
  let side = $state<Side>("right");
  let collected = $state<string[]>([]);
  let toasts = $state<Toast[]>([]);
  let progress = $state(0);
  let copied = $state(false);
  let nextToast = 0;

  const stop = $derived(experience.find((s) => s.id === zone));

  function cssProps(node: HTMLElement, props: Record<string, string | number>) {
    const apply = (next: Record<string, string | number>) => {
      for (const [name, value] of Object.entries(next)) node.style.setProperty(name, String(value));
    };
    apply(props);
    return { update: apply };
  }

  onMount(() => {
    walk = startWalk(
      { stage, view, canvas, room },
      {
        zone: (next) => (zone = next),
        side: (next) => (side = next),
        collected: (labels) => (collected = labels),
        progress: (next) => (progress = next),
        toast(text, x, tone) {
          const id = ++nextToast;
          toasts = [...toasts.slice(-3), { id, text, x, tone }];
          setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), TOAST_MS);
        },
      },
    );
    return () => walk?.stop();
  });

  function jumpTo(worldX: number) {
    const travel = stage.offsetHeight - window.innerHeight;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const share = worldX === END ? 1 : ((worldX - START) / (END - START)) * WALK_SHARE;
    walk?.teleport(top + share * travel);
  }

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

<section class="walk" bind:this={stage} aria-label="Career walk">
  <div class="walk-view" bind:this={view}>
    <canvas
      bind:this={canvas}
      class="walk-canvas"
      role="img"
      aria-label="A pixel-art walk through Dan’s career: Dan and his Samoyed, Mishka, walk from a research lab past a warehouse and an office tower to the present, then into a cabin under Mount Rainier."
      onpointerdown={() => walk?.jump()}
    ></canvas>
    <canvas bind:this={room} class="walk-room" aria-hidden="true" hidden></canvas>

    <div class="walk-intro" class:is-shown={zone === "intro"}>
      <h1><img src="/game/title.png" alt="Dan Aimone" /></h1>
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

    <a class="walk-skip" class:is-shown={zone !== "intro"} href="#resume">Skip to résumé</a>

    <div class="walk-toolkit" class:is-shown={zone !== "intro"} aria-live="polite">
      <span class="walk-toolkit-count">Toolkit {collected.length}/{GEMS.length}</span>
      <span class="walk-toolkit-items">{collected.join(", ")}</span>
    </div>

    {#each experience as s (s.id)}
      <article class={`walk-card is-${side}`} class:is-shown={stop?.id === s.id} aria-hidden={stop?.id !== s.id}>
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

    <article class={`walk-card walk-contact is-${side}`} class:is-shown={zone === "contact"} aria-hidden={zone !== "contact"}>
      <header><h2>Contact</h2></header>
      <a class="walk-email" href={`mailto:${EMAIL}`} tabindex={zone === "contact" ? 0 : -1}>{EMAIL}</a>
      <div class="walk-contact-row">
        <button type="button" class="copy" onclick={copyEmail} tabindex={zone === "contact" ? 0 : -1}>
          <span aria-live="polite">{copied ? "Copied" : "Copy email"}</span>
        </button>
        <button type="button" class="copy" onclick={() => jumpTo(START)} tabindex={zone === "contact" ? 0 : -1}>
          Walk again
        </button>
        {#each elsewhere.slice(0, 2) as [label, href] (label)}
          <a {href} rel="me" tabindex={zone === "contact" ? 0 : -1}>{label}</a>
        {/each}
      </div>
    </article>

    <div class="walk-toasts" aria-hidden="true">
      {#each toasts as toast (toast.id)}
        <span class={`walk-toast is-${toast.tone}`} use:cssProps={{ "--wx": toast.x }}>
          {toast.tone === "gem" ? `+ ${toast.text}` : toast.text}
        </span>
      {/each}
    </div>

    <nav class="walk-timeline" class:is-inside={zone === "contact"} aria-label="Jump along the walk" use:cssProps={{ "--soil": SOIL_DEPTH }}>
      <div class="walk-track" aria-hidden="true">
        <span use:cssProps={{ transform: `scaleX(${progress})` }}></span>
      </div>
      <ol>
        {#each TIMELINE as mark (mark.label)}
          {@const at = (mark.x - START) / (END - START)}
          <li use:cssProps={{ "--at": at }}>
            <button type="button" class:is-passed={progress >= at - 0.01} onclick={() => jumpTo(mark.x)}>
              <span class="walk-year">{mark.year}</span>
              {mark.label}
            </button>
          </li>
        {/each}
      </ol>
    </nav>
  </div>
</section>
