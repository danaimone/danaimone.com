import { describe, expect, test } from "bun:test";
import { resume, tailored } from "./resume";

// The list lives in the untracked resume/private.mjs, so a fresh clone skips this check.
const banned: string[] | undefined = await import("../../resume/private.mjs").then((details) => details.banned, () => undefined);

describe("tailored résumés", () => {
  test("a job the version does not mention keeps its main bullets", () => {
    const bulletsOf = ({ jobs }: typeof resume, id: string) => {
      const job = jobs.find((candidate) => candidate.id === id);
      if (!job) throw new Error(`no job ${id}`);
      return job.bullets;
    };
    const version = tailored({ bullets: { chewy: ["Tailored."] } });
    expect(bulletsOf(version, "chewy")).toEqual(["Tailored."]);
    expect(bulletsOf(version, "vannevar")).toEqual(bulletsOf(resume, "vannevar"));
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
