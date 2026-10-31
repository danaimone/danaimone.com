import { describe, expect, test } from "bun:test";
import { resume, tailored } from "./resume";

describe("tailored résumés", () => {
  test("a job the version does not mention keeps its main bullets", () => {
    const version = tailored({ bullets: { chewy: ["Tailored."] } });
    const job = (id: string) => version.jobs.find((candidate) => candidate.id === id);
    expect(job("chewy")?.bullets).toEqual(["Tailored."]);
    expect(job("vannevar")?.bullets).toEqual(resume.jobs.find((candidate) => candidate.id === "vannevar")?.bullets);
  });
});

describe("public résumé data", () => {
  test("dates are years only", () => {
    for (const job of resume.jobs) expect(job.years).toMatch(/^\d{4}( – (\d{4}|Present))?$/);
  });
});
