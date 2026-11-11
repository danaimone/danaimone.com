type Project = {
  name: string;
  href?: string;
  privateSource?: true;
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
  {
    name: "Onyx",
    privateSource: true,
    summary: "A personal AI agent that runs on my homelab and answers over iMessage.",
    detail:
      "It looks into smart-home anomalies, audits the servers every few hours, files recipes and reminders, and texts me only when something needs me. I built the bridges, skills, and checks around it.",
    stack: ["Claude", "Python", "TypeScript", "Home Assistant", "Proxmox"],
  },
  {
    name: "Tablescale",
    privateSource: true,
    summary: "An iPhone app that weighs restaurant meals with a coffee scale under the plate.",
    detail:
      "It speaks the Acaia Lunar's Bluetooth protocol, written from reverse-engineered sources and pinned by byte-exact tests. On-device models label the food from a photo and write the meal summary. It also has Siri intents, a Live Activity, and a Watch app.",
    stack: ["Swift", "SwiftUI", "CoreBluetooth", "Foundation Models", "SwiftData"],
  },
  {
    name: "Homelab",
    summary: "A Proxmox server at home running a few dozen services, with the monitoring I wrote for it.",
    detail:
      "Dashboards said everything was fine when it wasn't, so I wrote an audit for what they miss: stale backups, dead tunnels, dropped recordings. A daily job checks every installed version against new CVEs.",
    stack: ["Proxmox", "ZFS", "Caddy", "Python", "Bash"],
  },
  {
    name: "keylight-camera-switch",
    href: "https://github.com/danaimone/keylight-camera-switch",
    summary: "Turns my desk light on when a call starts and off when it ends.",
    detail:
      "A small Swift helper reads the same CoreMediaIO signal that drives the macOS camera indicator, so it works with any app. A launch agent polls it and calls the Elgato Key Light's local HTTP API.",
    stack: ["Swift", "Shell", "launchd"],
  },
];
