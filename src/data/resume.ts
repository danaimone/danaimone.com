export const EMAIL = "hello@danaimone.com";

export const elsewhere = [
  ["GitHub", "https://github.com/danaimone"],
  ["LinkedIn", "https://linkedin.com/in/danaimone"],
  ["Instagram", "https://instagram.com/danaimone"],
  ["X", "https://twitter.com/dan_aimone"],
];

export type Job = {
  stop: "vannevar" | "atlassian" | "chewy" | "pnnl";
  company: string;
  title: string;
  years: string;
  bullets: string[];
};

export type Resume = {
  jobs: Job[];
  education: { school: string; place: string; degree: string; field: string };
  skills: [label: string, items: string][];
};

export const resume: Resume = {
  jobs: [
    {
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

export type Stop = {
  id: Job["stop"];
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
