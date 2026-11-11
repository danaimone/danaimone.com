type Project = {
  name: string;
  href?: string;
  privateSource?: true;
  summary: string;
  detail: string;
  stack: string[];
  areas?: [label: string, text: string][];
};

export const projects: Project[] = [
  {
    name: "Onyx",
    privateSource: true,
    summary: "A personal AI agent that runs on my homelab, answers over iMessage, and does real chores.",
    detail:
      "It runs Claude on an open-source agent runtime. My work is everything around that: the bridges into my house and Apple's apps, the memory, the skills, and the guardrails that make it safe to leave running.",
    areas: [
      ["Channels", "iMessage first, plus Discord, email, and voice through Home Assistant. I patched the iMessage bridge so its replies render real bold and italic"],
      ["Memory", "Long-term memory that is isolated per person, so someone else texting it never gets my context. I compared backends before choosing one and added a weekly check for leaks between people"],
      ["House", "Home Assistant calls it when something looks wrong, like a frozen camera or a flapping sensor. It investigates and texts me what it found, within rate limits and quiet hours"],
      ["Ops", "It receives the homelab's audit results, drops repeats, and decides what is worth waking me for"],
      ["Errands", "It files reminders, imports recipes into my recipe app through a file format I reverse-engineered, sends books to our Kindles, and warns me before an account runs short"],
      ["Guardrails", "Skills, scripts, and memory are versioned with signed commits, upgrades go through a preflight and test run, and each bridge to my Mac is a single-purpose SSH key with an allow-list"],
    ],
    stack: ["Claude", "Python", "TypeScript", "Swift", "Home Assistant", "MCP"],
  },
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
    name: "Tablescale",
    privateSource: true,
    summary: "An iPhone app that weighs restaurant meals with a coffee scale under the plate.",
    detail:
      "It speaks the Acaia Lunar's Bluetooth protocol, written from reverse-engineered sources and pinned by byte-exact tests. On-device models label the food from a photo and write the meal summary. It also has Siri intents, a Live Activity, and a Watch app.",
    stack: ["Swift", "SwiftUI", "CoreBluetooth", "Foundation Models", "SwiftData"],
  },
  {
    name: "keylight-camera-switch",
    href: "https://github.com/danaimone/keylight-camera-switch",
    summary: "Turns my desk light on when a call starts and off when it ends.",
    detail:
      "A small Swift helper reads the same CoreMediaIO signal that drives the macOS camera indicator, so it works with any app. A launch agent polls it and calls the Elgato Key Light's local HTTP API.",
    stack: ["Swift", "Shell", "launchd"],
  },
  {
    name: "Homelab",
    summary: "The server at home that runs my house, my media, my backups, and my agents.",
    detail:
      "I treat it like production: changes are scripted and reversible, every incident gets a written report, and nothing is allowed to fail quietly.",
    areas: [
      ["Platform", "Proxmox on an EPYC server with ZFS, dozens of containers and VMs, and two GPUs shared between transcoding, camera detection, and local models"],
      ["Network", "Segmented VLANs for IoT, guests, and a DMZ, separate public and private reverse proxies behind Cloudflare, and Tailscale and WireGuard for remote access"],
      ["Backups", "Three tiers: weekly snapshots, an offsite copy, and daily encrypted backups, with a written recovery plan and a UPS that shuts everything down cleanly"],
      ["Security", "A daily CVE digest across OS packages, apps, and container images, sign-in bans at the proxy, and regular patch sweeps and audits"],
      ["Monitoring", "An audit every six hours for what dashboards miss, such as stale backups, dead tunnels, and dropped recordings, with alerts that page me only when it matters"],
      ["Smart home", "Home Assistant with local Zigbee and Z-Wave, a camera recorder with GPU object detection, and anomaly rules that hand off to Onyx to investigate"],
      ["Apps", "Self-hosted photos, books, git, notes, and media, local speech and language models, and a dashboard app I wrote"],
    ],
    stack: ["Proxmox", "ZFS", "Caddy", "UniFi", "Home Assistant", "Python", "Bash"],
  },
];
