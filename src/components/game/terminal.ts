export const TERMINAL_COLUMNS = 17;
export const TERMINAL_ROWS = 6;

const PROMPT = "> ";
const MAX_INPUT = 40;
const MAX_HISTORY = 40;
const TICKS_PER_DEMO_KEY = 7;
const TICKS_AFTER_DEMO_COMMAND = 150;
const DEMO_RESUMES_AFTER_TICKS = 900;
const DEMO_COMMANDS = ["whoami", "ls", "mishka"];

const RESPONSES: Record<string, string[]> = {
  help: ["whoami ls hire", "mishka rex clear"],
  whoami: ["dan aimone", "software engineer"],
  ls: ["resume.pdf", "rainier/ mishka/"],
  mishka: ["zzz", "she is asleep"],
  hire: ["hello@", "danaimone.com"],
  rex: ["session running"],
  sudo: ["nice try"],
};

function wrap(text: string) {
  const rows: string[] = [];
  for (let i = 0; i < text.length; i += TERMINAL_COLUMNS) rows.push(text.slice(i, i + TERMINAL_COLUMNS));
  return rows.length ? rows : [""];
}

export function createTerminal() {
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
