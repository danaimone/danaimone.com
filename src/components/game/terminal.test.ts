import { describe, expect, test } from "bun:test";
import { RESPONSES, TERMINAL_COLUMNS, TERMINAL_LINES, createTerminal, type Line } from "./terminal";

const type = (terminal: ReturnType<typeof createTerminal>, text: string) => {
  for (const key of text) terminal.press(key);
  terminal.press("Enter");
};
const text = (line: Line) => (line.kind === "prompt" ? "" : line.text);
const shown = (terminal: ReturnType<typeof createTerminal>) => terminal.screen().lines.map(text);
const typing = (terminal: ReturnType<typeof createTerminal>) => terminal.screen().lines.at(-1);

describe("cabin terminal", () => {
  test("runs a known command", () => {
    const terminal = createTerminal();
    type(terminal, "whoami");
    expect(shown(terminal)).toContain("Dan Aimone");
  });

  test("answers an unknown command the way zsh does, and does nothing", () => {
    const commands: string[] = [];
    const terminal = createTerminal((command) => commands.push(command));
    type(terminal, "rm -rf /");
    expect(shown(terminal).join(" ")).toContain("zsh: command not found: rm -rf /");
    expect(commands).toEqual(["rm -rf /"]);
  });

  test("a status line comes before every prompt, and reports a failed command", () => {
    const terminal = createTerminal(undefined, () => new Date(2026, 10, 11, 9, 54));
    type(terminal, "nope");
    type(terminal, "pwd");
    const prompts = terminal.screen().lines.filter((line) => line.kind === "prompt");
    expect(prompts.map((line) => line.kind === "prompt" && line.failed)).toEqual([true, false]);
    expect(prompts.every((line) => line.kind === "prompt" && line.clock === "09:54")).toBe(true);
    const kinds = terminal.screen().lines.map((line) => line.kind);
    kinds.forEach((kind, index) => {
      if (kind === "command" && (terminal.screen().lines[index] as Extract<Line, { kind: "command" }>).first) expect(kinds[index - 1]).toBe("prompt");
    });
  });

  test("a command is marked known only once it is one that exists", () => {
    const terminal = createTerminal();
    for (const key of "whoam") terminal.press(key);
    expect(typing(terminal)).toMatchObject({ kind: "command", text: "whoam", known: false });
    terminal.press("i");
    expect(typing(terminal)).toMatchObject({ kind: "command", text: "whoami", known: true });
  });

  test("backspace edits and clear empties the screen", () => {
    const terminal = createTerminal();
    terminal.press("x");
    terminal.press("Backspace");
    type(terminal, "clear");
    expect(terminal.screen().lines.map((line) => line.kind)).toEqual(["prompt", "command"]);
    expect(typing(terminal)).toMatchObject({ text: "" });
  });

  test("up and down recall what the visitor typed", () => {
    const terminal = createTerminal();
    type(terminal, "pwd");
    type(terminal, "whoami");
    terminal.press("ArrowUp");
    expect(typing(terminal)).toMatchObject({ text: "whoami" });
    terminal.press("ArrowUp");
    expect(typing(terminal)).toMatchObject({ text: "pwd" });
    terminal.press("ArrowDown");
    terminal.press("ArrowDown");
    expect(typing(terminal)).toMatchObject({ text: "" });
  });

  test("ignores keys that are not typing", () => {
    const terminal = createTerminal();
    expect(terminal.press("ArrowLeft")).toBe(false);
    expect(terminal.press("Tab")).toBe(false);
    expect(terminal.press("Shift")).toBe(false);
  });

  test("markup stays inert text and long input stays on screen", () => {
    const terminal = createTerminal();
    for (const key of "<script>".repeat(20)) terminal.press(key);
    const { lines } = terminal.screen();
    expect(lines.length).toBeLessThanOrEqual(TERMINAL_LINES);
    expect(lines.filter((line) => line.kind === "command").map(text).join("")).toBe("<script>".repeat(5));
  });

  test("doom is hidden from help and reports itself when typed", () => {
    const commands: string[] = [];
    const terminal = createTerminal((command) => commands.push(command));
    type(terminal, "help");
    expect(shown(terminal).join(" ")).not.toContain("doom");
    expect(commands).not.toContain("doom");
    type(terminal, "doom");
    expect(commands).toContain("doom");
  });

  test("every reply fits the screen", () => {
    for (const command of [...Object.keys(RESPONSES), "nope", "echo one two three four five six seven", "date", "a-very-long-command-that-does-not-exist"]) {
      const terminal = createTerminal();
      type(terminal, command);
      for (const line of terminal.screen().lines) {
        const room = line.kind === "command" && line.first ? TERMINAL_COLUMNS - 2 : TERMINAL_COLUMNS;
        expect(text(line).length).toBeLessThanOrEqual(room);
      }
    }
  });

  test("demos by itself, and a visitor's key takes over at once", () => {
    const terminal = createTerminal();
    for (let i = 0; i < 60; i++) terminal.tick();
    expect(shown(terminal).join(" ")).toContain("whoami");
    terminal.press("h");
    expect(typing(terminal)).toMatchObject({ text: "h" });
    for (let i = 0; i < 300; i++) terminal.tick();
    expect(typing(terminal)).toMatchObject({ text: "h" });
  });

  test("the demo's commands are not offered back to the visitor", () => {
    const terminal = createTerminal();
    for (let i = 0; i < 400; i++) terminal.tick();
    terminal.press("ArrowUp");
    expect(typing(terminal)).toMatchObject({ text: "" });
  });
});
