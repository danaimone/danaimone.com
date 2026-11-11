import { resume, tailored } from "../../src/data/resume";

const bulletsOf = (id: string) => resume.jobs.find((job) => job.id === id)!.bullets;

export default tailored({
  bullets: {
    pnnl: [bulletsOf("pnnl")[2], bulletsOf("pnnl")[0], bulletsOf("pnnl")[1]],
  },
  skills: [...resume.skills].sort(([a], [b]) => Number(b === "Backend") - Number(a === "Backend")),
});
