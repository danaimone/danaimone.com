export const contact = {
  location: "Seattle, WA",
  email: "hello@danaimone.com",
  site: "https://danaimone.com",
  linkedin: { handle: "in/danaimone", url: "https://linkedin.com/in/danaimone" },
  github: { handle: "github/danaimone", url: "https://github.com/danaimone" },
};

export const EMAIL = contact.email;

export const elsewhere: [label: string, href: string][] = [
  ["GitHub", contact.github.url],
  ["LinkedIn", contact.linkedin.url],
  ["Instagram", "https://instagram.com/danaimone"],
  ["X", "https://twitter.com/dan_aimone"],
];

export type StopId = "vannevar" | "atlassian" | "chewy" | "pnnl";

type Years = { from: number; to: number | "present" };

type Job = {
  id: "vannevar" | "atlassian-2" | "atlassian-1" | "chewy" | "pnnl";
  stop: StopId;
  company: string;
  title: string;
  dates: Years;
  years: string;
  bullets: string[];
};

const yearsText = ({ from, to }: Years) => (from === to ? `${from}` : `${from} – ${to === "present" ? "Present" : to}`);

const withYears = (jobs: Omit<Job, "years">[]): Job[] => jobs.map((job) => ({ ...job, years: yearsText(job.dates) }));

type Resume = {
  contact: typeof contact;
  jobs: Job[];
  education: { school: string; place: string; degree: string; field: string };
  skills: [label: string, items: string][];
};

export const resume: Resume = {
  contact,
  jobs: withYears([
    {
      id: "vannevar",
      stop: "vannevar",
      company: "Vannevar",
      title: "Software Engineer",
      dates: { from: 2025, to: "present" },
      bullets: [
        "Built agentic AI products end to end, from the agent harness and prompts to the backend and interface, shipping per-agent tool selection, stop/rejoin for running chats, and chat sharing",
        "Led Dashboards from RFC to usable product in about six weeks: wrote the spec, sequenced the team’s work, and built on existing data API content types so sharing and permissions came built in",
        "Designed and shipped the user-facing side of a citations overhaul that replaced model-generated citations with deterministic ones (200%+ more citations): hover cards, a Sources panel, and ICD-206 compliant exports",
        "Unblocked government users a week before a key deadline by tracing a download failure to an egress proxy, then working with their IT on an allowlist that now covers users nationwide",
        "Built the first automated end-to-end coverage of the agent backend, with Playwright suites and hourly smoke tests",
        "Owned about 1 in 6 production deploys over six months and led deploy validation",
      ],
    },
    {
      id: "atlassian-2",
      stop: "atlassian",
      company: "Atlassian",
      title: "Full-Stack Software Engineer 2",
      dates: { from: 2024, to: 2025 },
      bullets: [
        "Raised feature adoption 90.7% and cut legacy system usage 31.3% by shipping 10+ Objective Creation features behind a progressive Statsig rollout, affecting $8M+ ARR from enterprise customers",
        "Took Sentry error alerts from 192 to 0 by adding error handling, validation, and monitoring across the React/TypeScript frontend and Node.js backend services",
        "Shipped Dependency Tags, the most requested feature, and delivered Release Vehicle enhancements 13 days early across the schema, REST API, and React UI",
      ],
    },
    {
      id: "atlassian-1",
      stop: "atlassian",
      company: "Atlassian",
      title: "Full-Stack Software Engineer 1",
      dates: { from: 2022, to: 2024 },
      bullets: [
        "Delivered the Grid Column Configurations API for 12+ enterprise customers ($8M+ ARR), with repository and service layers covered by SpecFlow integration tests",
        "Served as release manager for 15+ releases, mentored 2 engineers, and led a “Joy of React” course for 7+ engineers",
      ],
    },
    {
      id: "chewy",
      stop: "chewy",
      company: "Chewy",
      title: "Software Engineer",
      dates: { from: 2022, to: 2022 },
      bullets: [
        "Built the dynamic pricing backend features behind a 20% revenue increase across 4,000 SKUs",
        "Raised bundle sales 90% by standardizing product bundles as a component library across product pages",
      ],
    },
    {
      id: "pnnl",
      stop: "pnnl",
      company: "Pacific Northwest National Lab",
      title: "Software Engineer",
      dates: { from: 2017, to: 2021 },
      bullets: [
        "Built full-stack React and C# ASP.NET applications used by 100+ analysts for real-time cybersecurity analysis",
        "Sped up data analysis workflows 30% with algorithmic improvements and visualization tools in D3.js and Java",
        "Co-authored a peer-reviewed paper on modeling adversarial activity, presented at a DARPA conference",
      ],
    },
  ]),
  education: {
    school: "Western Washington University",
    place: "Bellingham, WA",
    degree: "Bachelor of Science in",
    field: "Computer Science",
  },
  skills: [
    ["AI", "Agent harnesses, LangGraph, LangChain, tool calling, prompt design, end-to-end agent testing"],
    ["Languages", "TypeScript, JavaScript, Python, Go, C#, Java, Kotlin, Scala"],
    ["Frontend", "React, Next.js, Remix, Svelte, Astro, TanStack Query, Tailwind, Playwright, Jest"],
    ["Backend", "Node.js, GraphQL, REST APIs, PostgreSQL, SQL Server, MongoDB, Redis"],
    ["Platform", "AWS, Docker, CI/CD, Statsig, Sentry, Octopus"],
  ],
};

type TailoredBullets = Partial<Record<Job["id"], string[]>>;

export function tailored({ bullets, skills }: { bullets: TailoredBullets; skills?: Resume["skills"] }): Resume {
  return {
    ...resume,
    jobs: resume.jobs.map((job) => ({ ...job, bullets: bullets[job.id] ?? job.bullets })),
    skills: skills ?? resume.skills,
  };
}

type Stop = {
  id: StopId;
  company: string;
  dates: Years;
  span: string;
  roles: Job[];
};

export const experience: Stop[] = [...new Set(resume.jobs.map((job) => job.stop))].map((id) => {
  const roles = resume.jobs.filter((job) => job.stop === id);
  const dates = { from: roles[roles.length - 1].dates.from, to: roles[0].dates.to };
  return { id, company: roles[0].company, dates, span: yearsText(dates), roles };
});
