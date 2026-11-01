import { describe, expect, test } from "bun:test";
import { PROMPT, RESPONSES, TERMINAL_COLUMNS, TERMINAL_ROWS, createTerminal } from "./terminal";

const type = (terminal: ReturnType<typeof createTerminal>, text: string) => {
  for (const key of text) terminal.press(key);
  terminal.press("Enter");
};

describe("cabin terminal", () => {
  test("runs a known command", () => {
    const terminal = createTerminal();
    type(terminal, "whoami");
    expect(terminal.screen().rows).toContain("dan aimone");
  });

  test("explains an unknown command instead of doing anything", () => {
    const terminal = createTerminal();
    type(terminal, "rm -rf /");
    expect(terminal.screen().rows).toContain("unknown command");
  });

  test("backspace edits and clear empties the screen", () => {
    const terminal = createTerminal();
    terminal.press("x");
    terminal.press("Backspace");
    type(terminal, "clear");
    expect(terminal.screen().rows).toEqual([PROMPT]);
  });

  test("ignores keys that are not typing", () => {
    const terminal = createTerminal();
    expect(terminal.press("ArrowLeft")).toBe(false);
    expect(terminal.press("Shift")).toBe(false);
  });

  test("markup stays inert text and long input stays on screen", () => {
    const terminal = createTerminal();
    for (const key of "<script>".repeat(20)) terminal.press(key);
    const { rows } = terminal.screen();
    expect(rows.length).toBeLessThanOrEqual(TERMINAL_ROWS);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(TERMINAL_COLUMNS);
  });

  test("doom is hidden from help and reports itself when typed", () => {
    const commands: string[] = [];
    const terminal = createTerminal((command) => commands.push(command));
    type(terminal, "help");
    expect(terminal.screen().rows.join(" ")).not.toContain("doom");
    expect(commands).not.toContain("doom");
    type(terminal, "doom");
    expect(commands).toContain("doom");
  });

  test("every reply fits the screen", () => {
    for (const command of [...Object.keys(RESPONSES), "nope"]) {
      const terminal = createTerminal();
      type(terminal, command);
      for (const row of terminal.screen().rows) expect(row.length).toBeLessThanOrEqual(TERMINAL_COLUMNS);
    }
  });

  test("demos by itself, and a visitor's key takes over at once", () => {
    const terminal = createTerminal();
    for (let i = 0; i < 60; i++) terminal.tick();
    expect(terminal.screen().rows.join(" ")).toContain("whoami");
    terminal.press("h");
    const typing = terminal.screen().rows.at(-1);
    expect(typing).toBe(`${PROMPT}h`);
    for (let i = 0; i < 300; i++) terminal.tick();
    expect(terminal.screen().rows.at(-1)).toBe(typing);
  });
});
