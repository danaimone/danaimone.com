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

export const RESPONSES: Record<string, string[]> = {
  help: ["whoami ls hire top", "neofetch mishka pwd", "resume stoke git log", "The rest is hidden."],
  whoami: ["Dan Aimone", "Software Engineer", "Seattle, WA"],
  pwd: ["~/cabin", "Under Rainier."],
  ls: ["resume.pdf rainier/", "mishka/ guitars/"],
  "ls -a": [".mishka-treats", ".fire-is-on", "resume.pdf"],
  "cat resume.pdf": ["It is a PDF. Try:", "open resume.pdf"],
  "cat .mishka-treats": ["Empty.", "She knows."],
  resume: ["Heading down."],
  "open resume.pdf": ["Opening the PDF."],
  hire: [EMAIL],
  "sudo hire dan": ["Granted.", EMAIL],
  neofetch: ["os: log cabin", "wm: firewood", "shell: warm", "dog: Samoyed"],
  top: ["mishka  100% nap", "fire     12% cpu", "dan      coffee"],
  uptime: ["up since 2017", "load: 1 Samoyed"],
  mishka: ["zzz", "She is asleep."],
  "pet mishka": ["tail: wag wag", "Still asleep."],
  walk: ["One ear moved.", "She heard that."],
  treat: ["She is awake.", "You did this."],
  coffee: ["Brewing...", "Mug is on the right.", "Obviously."],
  vim: ["Already open.", "Other monitor."],
  nvim: ["Already open.", "Other monitor."],
  ":q": ["Nice try."],
  ":wq": ["Saved. Stay."],
  exit: ["Nah. Stay.", "The fire is on."],
  "cd ..": ["You just got here."],
  "git blame": ["It was Mishka."],
  "git log": [...STOPS].reverse().map((stop) => `* ${stop.firstYear} ${stop.label}`),
  "man dan": ["DAN(1)", "Builds agentic AI", "products end to end.", "See also: hire"],
  stoke: ["The fire jumps."],
  "git status": ["nothing to commit,", "dog tree clean"],
  "git push": ["Everything", "up-to-date"],
  "ping rainier": ["14,411 ft", "Still out there."],
  weather: ["PNW: yes", "Chance of rain."],
  "play guitar": ["Martin HD-28", "In tune. Mostly."],
  "play piano": ["Nord Stage 3", "C major. Always."],
  rex: ["Session running."],
  doom: ["Loading Doom..."],
  sudo: ["Nice try."],
  "sudo make me a sandwich": ["Okay."],
  hello: ["Hi! Type help."],
  hi: ["Hi! Type help."],
  42: ["Yes."],
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

function reply(command: string, now: Date): string[] | null {
  if (command === "date") return wrapWords(now.toDateString());
  if (command.startsWith("echo ")) return wrapWords(command.slice(5));
  return RESPONSES[command] ?? null;
}

const BUILT_IN = ["clear", "date", "history"];
const isKnown = (command: string) => BUILT_IN.includes(command) || command.startsWith("echo ") || command in RESPONSES;

// The first row of a command leaves room for the prompt's arrow.
function commandRows(input: string, known: boolean): Line[] {
  const first = input.slice(0, TERMINAL_COLUMNS - PROMPT.length);
  const rest = input.slice(first.length);
  return [first, ...(rest ? chunks(rest) : [])].map((text, row) => ({ kind: "command", text, known, first: row === 0 }));
}

// A toy of Dan's own shell: a status line above each prompt, the arrow red after
// a command that failed, and the command itself green once it is one that exists.
export function createTerminal(onCommand: (command: string) => void = () => {}, now: () => Date = () => new Date()) {
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
    const output = command === "history" ? recalled.slice(-HISTORY_SHOWN).flatMap(wrapWords) : reply(command, now());
    const failed = command !== "" && command !== "clear" && output === null;
    scrollback.push(prompt, ...commandRows(input, isKnown(command)));
    if (command === "clear") scrollback = [];
    else if (output) scrollback.push(...output.map((text): Line => ({ kind: "output", text })));
    else if (failed) scrollback.push(...wrapWords(`zsh: command not found: ${command}`).map((text): Line => ({ kind: "output", text })));
    scrollback = scrollback.slice(-MAX_SCROLLBACK);
    if (remember && command) recalled = [...recalled.filter((past) => past !== input.trim()), input.trim()].slice(-MAX_RECALLED);
    recalling = -1;
    input = "";
    prompt = { kind: "prompt", clock: clockAt(now()), failed };
    onCommand(command);
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
