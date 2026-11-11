import { describe, expect, test } from "bun:test";
import { resume, tailored } from "./resume";

const bannedInUntrackedPrivateFile: string[] | undefined = await import("../../resume/private.mjs").then((details) => details.banned, () => undefined);

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

  const freshCloneWithoutPrivateFile = !bannedInUntrackedPrivateFile;
  test.skipIf(freshCloneWithoutPrivateFile)("names nothing on the private list in the untracked resume/private.mjs", () => {
    const text = JSON.stringify(resume);
    for (const name of bannedInUntrackedPrivateFile ?? []) expect(text).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
});
