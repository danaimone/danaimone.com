import { EMAIL } from "../../data/resume";
import { STOPS } from "./world";

export const TERMINAL_COLUMNS = 20;
export const TERMINAL_LINES = 8;
export const PROMPT = "→ ";

const MAX_INPUT = 40;
const MAX_SCROLLBACK = 60;
const MAX_RECALLED = 20;
const HISTORY_SHOWN = 4;
// A person does not type on a metronome: the gap before each demo key cycles
// through these, in ticks.
const DEMO_KEY_TICKS = [6, 9, 5, 7, 12, 6, 8, 5, 10];
const TICKS_AFTER_DEMO_COMMAND = 150;
const DEMO_RESUMES_AFTER_TICKS = 900;
const DEMO_COMMANDS = ["whoami", "neofetch", "mishka", "top"];

export type TerminalAction = "doom" | "stoke" | "resume" | "projects" | "pdf";

type Shell = { now: Date; recalled: string[] };
type Command = { reply: string[] | ((shell: Shell) => string[]); action?: TerminalAction };

export const COMMANDS: Record<string, Command> = {
  help: { reply: ["whoami ls mail top", "resume projects pwd", "stoke mishka git log", "The rest is hidden."] },
  whoami: { reply: ["Dan Aimone", "Software Engineer", "Seattle, WA"] },
  pwd: { reply: ["~/cabin", "Under Rainier."] },
  ls: { reply: ["resume.pdf projects/", "rainier/ mishka/", "guitars/"] },
  "ls projects": { reply: ["onyx/ rex-rollcall/", "tablescale/ homelab/", "keylight/ site/"] },
  "ls -a": { reply: [".mishka-treats", ".fire-is-on", "resume.pdf"] },
  "cat resume.pdf": { reply: ["It is a PDF. Try:", "open resume.pdf"] },
  "cat .mishka-treats": { reply: ["Empty.", "She knows."] },
  resume: { reply: ["Heading down."], action: "resume" },
  projects: { reply: ["Heading down."], action: "projects" },
  "cd projects": { reply: ["Heading down."], action: "projects" },
  "open resume.pdf": { reply: ["Opening the PDF."], action: "pdf" },
  mail: { reply: [EMAIL] },
  neofetch: { reply: ["os: log cabin", "wm: firewood", "shell: warm", "dog: Samoyed"] },
  top: { reply: ["mishka  100% nap", "fire     12% cpu", "dan      coffee"] },
  uptime: { reply: ["up since 2017", "load: 1 Samoyed"] },
  mishka: { reply: ["zzz", "She is asleep."] },
  "pet mishka": { reply: ["tail: wag wag", "Still asleep."] },
  walk: { reply: ["One ear moved.", "She heard that."] },
  treat: { reply: ["She is awake.", "You did this."] },
  coffee: { reply: ["Brewing...", "Mug is on the right.", "Obviously."] },
  vim: { reply: ["Already open.", "Other monitor."] },
  nvim: { reply: ["Already open.", "Other monitor."] },
  ":q": { reply: ["Nice try."] },
  ":wq": { reply: ["Saved. Stay."] },
  exit: { reply: ["Nah. Stay.", "The fire is on."] },
  "cd ..": { reply: ["You just got here."] },
  "git blame": { reply: ["It was Mishka."] },
  "git log": { reply: [...STOPS].reverse().map((stop) => `* ${stop.firstYear} ${stop.label}`) },
  "man dan": { reply: ["DAN(1)", "Builds agentic AI", "products end to end.", "See also: mail"] },
  stoke: { reply: ["The fire jumps."], action: "stoke" },
  "git status": { reply: ["nothing to commit,", "dog tree clean"] },
  "git push": { reply: ["Everything", "up-to-date"] },
  "ping rainier": { reply: ["14,411 ft", "Still out there."] },
  weather: { reply: ["PNW: yes", "Chance of rain."] },
  "play guitar": { reply: ["Martin HD-28", "In tune. Mostly."] },
  "play piano": { reply: ["Nord Stage 3", "C major. Always."] },
  rex: { reply: ["Session running."] },
  doom: { reply: ["Loading Doom..."], action: "doom" },
  sudo: { reply: ["Nice try."] },
  "sudo make me a sandwich": { reply: ["Okay."] },
  hello: { reply: ["Hi! Type help."] },
  hi: { reply: ["Hi! Type help."] },
  42: { reply: ["Yes."] },
  date: { reply: ({ now }) => wrapWords(now.toDateString()) },
  history: { reply: ({ recalled }) => recalled.slice(-HISTORY_SHOWN).flatMap(wrapWords) },
};

export type Line =
  | { kind: "prompt"; clock: string; failed: boolean }
  | { kind: "command"; text: string; known: boolean; first: boolean }
  | { kind: "output"; text: string; hint?: boolean };

const chunks = (text: string) => text.match(new RegExp(`.{1,${TERMINAL_COLUMNS}}`, "g")) ?? [""];

// Breaks at spaces where it can, and inside a word only when the word alone is too long.
function wrapWords(text: string) {
  const rows: string[] = [];
  for (const word of text.split(" ").flatMap(chunks)) {
    const last = rows.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= TERMINAL_COLUMNS) rows[rows.length - 1] = `${last} ${word}`;
    else rows.push(word);
  }
  return rows;
}

const clockAt = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

function find(command: string): Command | undefined {
  if (command.startsWith("echo ")) return { reply: wrapWords(command.slice(5)) };
  return Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
}

const isKnown = (command: string) => command === "clear" || find(command) !== undefined;

// The first row of a command leaves room for the prompt's arrow.
function commandRows(input: string, known: boolean): Line[] {
  const first = input.slice(0, TERMINAL_COLUMNS - PROMPT.length);
  const rest = input.slice(first.length);
  return [first, ...(rest ? chunks(rest) : [])].map((text, row) => ({ kind: "command", text, known, first: row === 0 }));
}

// A toy of Dan's own shell: a status line above each prompt, the arrow red after
// a command that failed, and the command itself green once it is one that exists.
export function createTerminal(onAction: (action: TerminalAction) => void = () => {}, now: () => Date = () => new Date()) {
  let scrollback: Line[] = [{ kind: "output", text: "Type help.", hint: true }];
  let prompt: Line = { kind: "prompt", clock: clockAt(now()), failed: false };
  let input = "";
  let recalled: string[] = [];
  let recalling = -1;
  let keystrokes = 0;
  let idleTicks = DEMO_RESUMES_AFTER_TICKS;
  let demoCommand = 0;
  let demoLetter = 0;
  let demoWait = 0;

  const typed = () => input.trim().toLowerCase();

  function run(remember: boolean) {
    const command = typed();
    const found = find(command);
    const output = typeof found?.reply === "function" ? found.reply({ now: now(), recalled }) : found?.reply;
    const failed = command !== "" && command !== "clear" && !found;
    scrollback.push(prompt, ...commandRows(input, isKnown(command)));
    if (command === "clear") scrollback = [];
    else if (output) scrollback.push(...output.map((text): Line => ({ kind: "output", text })));
    else if (failed) scrollback.push(...wrapWords(`zsh: command not found: ${command}`).map((text): Line => ({ kind: "output", text })));
    scrollback = scrollback.slice(-MAX_SCROLLBACK);
    if (remember && command) recalled = [...recalled.filter((past) => past !== input.trim()), input.trim()].slice(-MAX_RECALLED);
    recalling = -1;
    input = "";
    prompt = { kind: "prompt", clock: clockAt(now()), failed };
    if (found?.action) onAction(found.action);
  }

  function recall(step: number) {
    if (!recalled.length) return;
    const from = recalling === -1 ? recalled.length : recalling;
    recalling = Math.min(recalled.length, Math.max(0, from + step));
    input = recalled[recalling] ?? "";
  }

  function pressForDemo() {
    const command = DEMO_COMMANDS[demoCommand];
    keystrokes += 1;
    if (demoLetter < command.length) {
      input += command[demoLetter];
      demoLetter += 1;
      demoWait = DEMO_KEY_TICKS[keystrokes % DEMO_KEY_TICKS.length];
      return;
    }
    run(false);
    demoLetter = 0;
    demoCommand = (demoCommand + 1) % DEMO_COMMANDS.length;
    demoWait = TICKS_AFTER_DEMO_COMMAND;
  }

  return {
    press(key: string) {
      const letter = key.length === 1 && key >= " " && key <= "~";
      if (!letter && key !== "Backspace" && key !== "Enter" && key !== "ArrowUp" && key !== "ArrowDown") return false;
      if (idleTicks >= DEMO_RESUMES_AFTER_TICKS) {
        input = "";
        demoLetter = 0;
      }
      idleTicks = 0;
      keystrokes += 1;
      if (key === "Enter") run(true);
      else if (key === "ArrowUp") recall(-1);
      else if (key === "ArrowDown") recall(1);
      else if (key === "Backspace") input = input.slice(0, -1);
      else if (input.length < MAX_INPUT) input += key;
      return true;
    },
    print(text: string) {
      scrollback.push({ kind: "output", text });
    },
    tick() {
      idleTicks += 1;
      if (idleTicks < DEMO_RESUMES_AFTER_TICKS) return;
      if (demoWait > 0) demoWait -= 1;
      else pressForDemo();
    },
    screen() {
      const lines = [...scrollback, prompt, ...commandRows(input, isKnown(typed()))].slice(-TERMINAL_LINES);
      return { lines, keystrokes };
    },
  };
}

export type Terminal = ReturnType<typeof createTerminal>;
