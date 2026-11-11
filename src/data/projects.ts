type Project = {
  name: string;
  href: string;
  summary: string;
  detail: string;
  stack: string[];
};

export const projects: Project[] = [
  {
    name: "rex-rollcall",
    href: "https://github.com/danaimone/rex-rollcall",
    summary: "One picker for every coding-agent session on every machine I use.",
    detail:
      "I run Claude Code, Codex, opencode, and pi across a laptop, a Mac mini, and a homelab, and kept losing track of them. One key lists every live and past session by state, then jumps to the pane or resumes it beside me.",
    stack: ["Go", "Lua", "fzf", "GoReleaser"],
  },
  {
    name: "danaimone.com",
    href: "https://github.com/danaimone/danaimone.com",
    summary: "This site: a scroll-driven pixel-art walk on a canvas engine I wrote.",
    detail:
      "A fixed-step simulation drives stacked canvases drawn at art resolution, so the world scrolls in device pixels and stays sharp. The cabin terminal is real, and a frame harness replays the whole walk to catch visual regressions.",
    stack: ["TypeScript", "Astro", "Svelte", "Canvas", "Bun"],
  },
];
