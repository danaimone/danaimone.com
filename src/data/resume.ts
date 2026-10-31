export const contact = {
  email: "hello@danaimone.com",
  site: "https://danaimone.com",
  linkedin: { handle: "in/danaimone", url: "https://linkedin.com/in/danaimone" },
  github: { handle: "github/danaimone", url: "https://github.com/danaimone" },
};

export const EMAIL = contact.email;

export const elsewhere = [
  ["GitHub", contact.github.url],
  ["LinkedIn", contact.linkedin.url],
  ["Instagram", "https://instagram.com/danaimone"],
  ["X", "https://twitter.com/dan_aimone"],
];

export type StopId = "vannevar" | "atlassian" | "chewy" | "pnnl";

export type Job = {
  id: "vannevar" | "atlassian-2" | "atlassian-1" | "chewy" | "pnnl";
  stop: StopId;
  company: string;
  title: string;
  years: string;
  bullets: string[];
};

export type Resume = {
  contact: typeof contact;
  jobs: Job[];
  education: { school: string; place: string; degree: string; field: string };
  skills: [label: string, items: string][];
};

export const resume: Resume = {
  contact,
  jobs: [
    {
      id: "vannevar",
      stop: "vannevar",
      company: "Vannevar",
      title: "Software Engineer",
      years: "2025 – Present",
      bullets: [
        "Built agentic AI products end to end, from the agent harness and backend to the interface, including per-agent tool selection, stop/rejoin for running chats, and chat sharing",
        "Led Dashboards from RFC to usable product in about six weeks, writing the spec, sequencing work across the team, and building on data API content types so sharing and permissions came built in",
        "Designed and shipped the user-facing side of a citations overhaul, moving citations from model-generated to deterministic with 200%+ more citations, hover cards, a Sources panel, and ICD-206 compliant exports",
        "Unblocked government users a week before a key deadline by tracing a download failure to an egress proxy and working with their IT on an allowlist that now covers users nationwide",
        "Built the first automated end-to-end coverage of the agent backend with Playwright and hourly smoke tests",
      ],
    },
    {
      id: "atlassian-2",
      stop: "atlassian",
      company: "Atlassian",
      title: "Full-Stack Software Engineer 2",
      years: "2024 – 2025",
      bullets: [
        "Drove 90.7% feature adoption increase with a progressive Statsig rollout of Objective Creation Experience, impacting $8M+ ARR from enterprise customers and reducing legacy system usage by 31.3%",
        "Reduced Sentry error alerts from 192 to 0 by implementing error handling, validation logic, and monitoring across React/TypeScript frontend and Node.js backend services",
      ],
    },
    {
      id: "atlassian-1",
      stop: "atlassian",
      company: "Atlassian",
      title: "Full-Stack Software Engineer 1",
      years: "2022 – 2024",
      bullets: [
        "Delivered Grid Column Configurations API serving 12+ customers ($8M+ ARR), implementing maintainable repository/service layers with comprehensive SpecFlow integration tests",
        "Mentored engineering team through weekly pairing sessions and led “Joy of React” training course, establishing frontend best practices and code review standards that improved team velocity and code quality",
      ],
    },
    {
      id: "chewy",
      stop: "chewy",
      company: "Chewy",
      title: "Software Engineer",
      years: "2022",
      bullets: [
        "Improved React/Next.js application performance by 90% through frontend architecture optimization",
        "Increased revenue by 20% across 4,000 SKUs through dynamic pricing backend feature development",
      ],
    },
    {
      id: "pnnl",
      stop: "pnnl",
      company: "Pacific Northwest National Lab",
      title: "Software Engineer",
      years: "2017 – 2021",
      bullets: [
        "Built full-stack web applications using React.js frontend and C# ASP.NET backend serving 100+ security analysts for real-time cybersecurity analysis",
        "Accelerated data analysis workflows by 30% through implementing algorithmic improvements and visualization tools using D3.js and Java",
        "Co-authored peer-reviewed paper on modeling adversarial activity, presented at a DARPA conference",
      ],
    },
  ],
  education: {
    school: "Western Washington University",
    place: "Bellingham, WA",
    degree: "Bachelor of Science in",
    field: "Computer Science",
  },
  skills: [
    ["Languages", "TypeScript, JavaScript, Python, Java, C#, Kotlin, Scala"],
    ["Frontend", "React, Next.js, Remix.js, Redux, CSS-in-JS, TanStack Query, Jest, React Testing Library, Playwright"],
    ["Backend", "Node.js, Express.js, REST APIs, GraphQL, PostgreSQL, Microsoft SQL, MongoDB"],
    ["Platform/Tools", "AWS, Docker, Octopus, Feature Flags (Statsig), Git, CI/CD, Webpack"],
  ],
};

export type TailoredBullets = Partial<Record<Job["id"], string[]>>;

export function tailored({ bullets, skills }: { bullets: TailoredBullets; skills?: Resume["skills"] }): Resume {
  return {
    ...resume,
    jobs: resume.jobs.map((job) => ({ ...job, bullets: bullets[job.id] ?? job.bullets })),
    skills: skills ?? resume.skills,
  };
}

export type Stop = {
  id: StopId;
  company: string;
  span: string;
  roles: Job[];
};

export const experience: Stop[] = resume.jobs.reduce<Stop[]>((stops, job) => {
  const stop = stops.find((s) => s.id === job.stop);
  if (stop) {
    stop.roles.push(job);
    stop.span = `${job.years.split(" – ")[0]} – ${stop.span.split(" – ").pop()}`;
  } else {
    stops.push({ id: job.stop, company: job.company, span: job.years, roles: [job] });
  }
  return stops;
}, []);
