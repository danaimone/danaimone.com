export const TERMINAL_COLUMNS = 20;
export const TERMINAL_ROWS = 7;

export const PROMPT = "→ ";
const MAX_INPUT = 40;
const MAX_HISTORY = 40;
const TICKS_PER_DEMO_KEY = 7;
const TICKS_AFTER_DEMO_COMMAND = 150;
const DEMO_RESUMES_AFTER_TICKS = 900;
const DEMO_COMMANDS = ["whoami", "neofetch", "mishka", "top"];

export const RESPONSES: Record<string, string[]> = {
  help: ["whoami ls hire top", "neofetch mishka pwd", "the rest is hidden"],
  whoami: ["dan aimone", "software engineer", "seattle, wa"],
  pwd: ["~/cabin", "under rainier"],
  ls: ["resume.pdf rainier/", "mishka/ guitars/"],
  "ls -a": [".mishka-treats", ".fire-is-on", "resume.pdf"],
  "cat resume.pdf": ["scroll down.", "or type hire"],
  "cat .mishka-treats": ["empty.", "she knows."],
  hire: ["hello@danaimone.com"],
  "sudo hire dan": ["granted.", "hello@danaimone.com"],
  neofetch: ["os: log cabin", "wm: firewood", "shell: warm", "dog: samoyed"],
  top: ["mishka  100% nap", "fire     12% cpu", "dan      coffee"],
  uptime: ["up since 2017", "load: 1 samoyed"],
  mishka: ["zzz", "she is asleep"],
  "pet mishka": ["tail: wag wag", "still asleep"],
  walk: ["one ear moved.", "she heard that."],
  treat: ["she is awake.", "you did this."],
  coffee: ["brewing...", "mug is on the right.", "obviously."],
  vim: ["already open.", "other monitor."],
  nvim: ["already open.", "other monitor."],
  ":q": ["nice try."],
  ":wq": ["saved. stay."],
  exit: ["nah. stay.", "the fire is on."],
  "git blame": ["it was mishka"],
  "git status": ["nothing to do", "dog tree clean"],
  "git push": ["everything up", "to date"],
  "ping rainier": ["14,411 ft", "still out there"],
  weather: ["pnw: yes", "chance of rain"],
  "play guitar": ["martin hd-28", "in tune. mostly."],
  "play piano": ["nord stage 3", "c major. always."],
  rex: ["session running"],
  doom: ["loading doom..."],
  sudo: ["nice try"],
  "sudo make me a sandwich": ["okay."],
  hello: ["hi! type help"],
  hi: ["hi! type help"],
  42: ["yes."],
};

function wrap(text: string) {
  const rows: string[] = [];
  for (let i = 0; i < text.length; i += TERMINAL_COLUMNS) rows.push(text.slice(i, i + TERMINAL_COLUMNS));
  return rows.length ? rows : [""];
}

export function createTerminal(onCommand: (command: string) => void = () => {}) {
  let history: string[] = ["type help"];
  let input = "";
  let keystrokes = 0;
  let idleTicks = DEMO_RESUMES_AFTER_TICKS;
  let demoCommand = 0;
  let demoLetter = 0;
  let demoWait = 0;

  function run() {
    const command = input.trim().toLowerCase();
    history.push(...wrap(PROMPT + input));
    input = "";
    if (command === "clear") history = [];
    else if (command) history.push(...(RESPONSES[command] ?? ["unknown command", "try help"]));
    history = history.slice(-MAX_HISTORY);
    onCommand(command);
  }

  function pressForDemo() {
    const command = DEMO_COMMANDS[demoCommand];
    keystrokes += 1;
    if (demoLetter < command.length) {
      input += command[demoLetter];
      demoLetter += 1;
      demoWait = TICKS_PER_DEMO_KEY;
      return;
    }
    run();
    demoLetter = 0;
    demoCommand = (demoCommand + 1) % DEMO_COMMANDS.length;
    demoWait = TICKS_AFTER_DEMO_COMMAND;
  }

  return {
    press(key: string) {
      const typed = key.length === 1 && key >= " " && key <= "~";
      if (!typed && key !== "Backspace" && key !== "Enter") return false;
      if (idleTicks >= DEMO_RESUMES_AFTER_TICKS) {
        input = "";
        demoLetter = 0;
      }
      idleTicks = 0;
      keystrokes += 1;
      if (key === "Enter") run();
      else if (key === "Backspace") input = input.slice(0, -1);
      else if (input.length < MAX_INPUT) input += key;
      return true;
    },
    print(line: string) {
      history.push(line);
    },
    tick() {
      idleTicks += 1;
      if (idleTicks < DEMO_RESUMES_AFTER_TICKS) return;
      if (demoWait > 0) demoWait -= 1;
      else pressForDemo();
    },
    screen() {
      const rows = [...history, ...wrap(PROMPT + input)].slice(-TERMINAL_ROWS);
      return { rows, keystrokes };
    },
  };
}

export type Terminal = ReturnType<typeof createTerminal>;
