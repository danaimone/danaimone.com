#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { phone } from "../resume/private.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fonts = join(root, "node_modules/@fontsource");
const licensedFonts = process.env.RESUME_FONTS ?? "fonts";
const name = process.argv[2] ?? "main";
const entry = name === "main" ? "resume/main-entry.ts" : `resume/versions/${name}.ts`;

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const face = (family, path, weight, style = "normal") => `
  @font-face {
    font-family: "${family}";
    src: url("${pathToFileURL(path)}");
    font-weight: ${weight};
    font-style: ${style};
  }`;

const freeFace = (family, file, weight, style) => face(family, join(fonts, file), weight, style);
const licensedFace = (family, file, weight, style) => face(family, join(licensedFonts, file), weight, style);

const job = ({ company, title, years, bullets }) => `
  <div class="job">
    <div class="line"><span><b>${escape(company)}</b> &bull; ${escape(title)}</span><i>${escape(years)}</i></div>
    <ul>${bullets.map((b) => `<li>${escape(b)}</li>`).join("")}</ul>
  </div>`;

const html = (r, contactPhone) => `<!doctype html>
<meta charset="utf-8">
<style>
  ${licensedFace("Futura PT", "Futura PT Light.ttf", 300)}
  ${licensedFace("Futura PT", "Futura PT Light Oblique.ttf", 300, "italic")}
  ${licensedFace("Futura PT", "Futura PT Book.ttf", 400)}
  ${licensedFace("Futura PT", "Futura PT Book Oblique.ttf", 400, "italic")}
  ${licensedFace("Futura PT", "Futura PT Medium.ttf", 500)}
  ${licensedFace("Le Monde Livre", "Le Monde Livre Std Demi.ttf", 600)}
  ${freeFace("Jost", "jost/files/jost-latin-300-normal.woff2", 300)}
  ${freeFace("Jost", "jost/files/jost-latin-300-italic.woff2", 300, "italic")}
  ${freeFace("Jost", "jost/files/jost-latin-400-normal.woff2", 400)}
  ${freeFace("Jost", "jost/files/jost-latin-400-italic.woff2", 400, "italic")}
  ${freeFace("Jost", "jost/files/jost-latin-500-normal.woff2", 500)}
  ${freeFace("Playfair", "playfair-display/files/playfair-display-latin-700-normal.woff2", 700)}
  ${freeFace("Source Serif", "source-serif-4/files/source-serif-4-latin-600-normal.woff2", 600)}
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { padding: 24pt 36pt 0; font: 400 11.7pt/1.27 "Futura PT", Jost, sans-serif; color: #000; letter-spacing: -0.012em; }
  h1 { font: 700 50pt/1 Playfair, serif; letter-spacing: 0.01em; text-align: center; text-transform: uppercase; }
  .contact { margin-top: 7pt; text-align: center; font-size: 11.8pt; }
  .contact a { color: #0a6db5; text-decoration: underline; }
  .contact a.plain { color: inherit; text-decoration: none; }
  h2 { margin-top: 8pt; padding-bottom: 1pt; border-bottom: 1.4pt solid #000; font: 600 16.4pt/1.2 "Le Monde Livre", "Source Serif", serif; letter-spacing: 0; }
  .job { margin-top: 3.5pt; }
  .line { display: flex; justify-content: space-between; align-items: baseline; font-size: 13.2pt; font-weight: 400; }
  .line b { font-weight: 500; }
  .line i { font-size: 12.4pt; font-weight: 300; color: #222; }
  ul { list-style: none; }
  li { position: relative; padding-left: 9pt; margin-top: 0.6pt; }
  li::before { content: ""; position: absolute; left: 0.3pt; top: 0.42em; width: 4.4pt; height: 4.4pt; border-radius: 50%; background: #000; }
  .degree em { font-style: italic; }
  .skills { display: grid; grid-template-columns: max-content 1fr; gap: 0.5pt 12pt; margin-top: 4pt; }
  .skills b { font-weight: 500; }
</style>
<h1>Dan Aimone</h1>
<p class="contact">
  <a class="plain" href="mailto:${r.contact.email}">${r.contact.email}</a>
  ${contactPhone ? `&middot; ${contactPhone}` : ""}
  &middot; <a href="${r.contact.linkedin.url}">${r.contact.linkedin.handle}</a>
  &middot; <a href="${r.contact.github.url}">${r.contact.github.handle}</a>
  &middot; <a href="${r.contact.site}">${new URL(r.contact.site).host}</a>
</p>
<h2>Work Experience</h2>
${r.jobs.map(job).join("")}
<h2>Education</h2>
<div class="job">
  <div class="line"><span><b>${escape(r.education.school)}</b></span><i>${escape(r.education.place)}</i></div>
  <p class="degree">${escape(r.education.degree)} <em>${escape(r.education.field)}</em></p>
</div>
<h2>Skills</h2>
<div class="skills">${r.skills.map(([label, items]) => `<b>${escape(label)}</b><span>${escape(items)}</span>`).join("")}</div>`;

async function loadVersion() {
  const outfile = join(root, "resume/out/.version.mjs");
  await build({ entryPoints: [join(root, entry)], bundle: true, format: "esm", platform: "node", outfile, logLevel: "error" });
  const { default: version } = await import(`${pathToFileURL(outfile)}?${Date.now()}`);
  await rm(outfile);
  return version;
}

async function render(page, resume, contactPhone, path) {
  const htmlPath = join(root, "resume/out/.page.html");
  await writeFile(htmlPath, html(resume, contactPhone));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 8.5 * 96, height: 11 * 96 });
  await page.emulateMedia({ media: "print" });
  const spare = await page.evaluate(() => Math.round(11 * 96 - document.body.getBoundingClientRect().height));
  await page.pdf({ path, format: "Letter", printBackground: true, preferCSSPageSize: true });
  await rm(htmlPath);
  const pages = (await readFile(path, "latin1")).match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  if (pages !== 1) throw new Error(`${path} is ${pages} pages (${-spare}px too tall; a line is about 20px); a résumé must be 1. Cut a bullet or shorten one.`);
  console.log(`${spare}px to spare on the page`);
}

await mkdir(join(root, "resume/out"), { recursive: true });
const version = await loadVersion();
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  const privatePdf = join(root, "resume/out", `DanAimone-${name}.pdf`);
  await render(page, version, phone, privatePdf);
  console.log(`wrote ${privatePdf}`);
  if (name === "main") {
    await render(page, version, null, join(root, "public/resume.pdf"));
    console.log("wrote public/resume.pdf (no phone number)");
  }
} finally {
  await browser.close();
}
