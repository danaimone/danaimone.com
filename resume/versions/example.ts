import { resume, tailored } from "../../src/data/resume";

const bulletsOf = (id: string) => resume.jobs.find((job) => job.id === id)!.bullets;

// A tailored version changes only the jobs it names. This one leads PNNL with the
// research bullet and puts the backend skills first; copy it to start a new one.
export default tailored({
  bullets: {
    pnnl: [bulletsOf("pnnl")[2], bulletsOf("pnnl")[0], bulletsOf("pnnl")[1]],
  },
  skills: [...resume.skills].sort(([a], [b]) => Number(b === "Backend") - Number(a === "Backend")),
});
