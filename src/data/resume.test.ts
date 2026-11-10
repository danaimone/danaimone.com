import { describe, expect, test } from "bun:test";
import example from "../../resume/versions/example";
import { resume, tailored } from "./resume";

// The list lives in the untracked resume/private.mjs, so a fresh clone skips this check.
const banned: string[] | undefined = await import("../../resume/private.mjs").then((details) => details.banned, () => undefined);

describe("tailored résumés", () => {
  test("keep every job in the main order", () => {
    expect(example.jobs.map((job) => job.id)).toEqual(resume.jobs.map((job) => job.id));
  });

  test("a job the version does not mention keeps its main bullets", () => {
    const version = tailored({ bullets: { chewy: ["Tailored."] } });
    const job = (id: string) => version.jobs.find((candidate) => candidate.id === id);
    expect(job("chewy")?.bullets).toEqual(["Tailored."]);
    expect(job("vannevar")?.bullets).toEqual(resume.jobs.find((candidate) => candidate.id === "vannevar")?.bullets);
  });

  test("bullets stay on their own employer", () => {
    expect(example.jobs.find((job) => job.id === "chewy")?.company).toBe("Chewy");
    const bullets = (from: typeof resume) => [...(from.jobs.find((job) => job.id === "pnnl")?.bullets ?? [])].sort();
    expect(bullets(example)).toEqual(bullets(resume));
  });
});

describe("public résumé data", () => {
  test("dates are years only", () => {
    for (const job of resume.jobs) expect(job.years).toMatch(/^\d{4}( – (\d{4}|Present))?$/);
  });

  test.skipIf(!banned)("names nothing on the private list", () => {
    const text = JSON.stringify(resume);
    for (const name of banned ?? []) expect(text).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
});
