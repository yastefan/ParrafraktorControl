import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store } from "../src/store.js";

vi.mock("../src/log.js", () => ({ log: () => {}, errorText: (e: unknown) => String(e) }));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "store-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const file = (name: string) => join(dir, name);
const json = (name: string) => JSON.parse(readFileSync(file(name), "utf8"));

describe("store", () => {
  it("writes and reads again", () => {
    const s = new Store(dir);
    s.writeLater("presets.json", { a: 1 });
    s.flush();
    expect(new Store(dir).read("presets.json")).toEqual({ a: 1 });
    expect(existsSync(file("presets.json.tmp"))).toBe(false);
  });

  it("keeps the previous version as backup", () => {
    const s = new Store(dir);
    s.writeLater("presets.json", { v: 1 });
    s.flush();
    expect(existsSync(file("presets.json.bak"))).toBe(false);
    s.writeLater("presets.json", { v: 2 });
    s.flush();
    expect(json("presets.json")).toEqual({ v: 2 });
    expect(json("presets.json.bak")).toEqual({ v: 1 });
  });

  it.each([
    ["empty", ""],
    ["cut off", '{"v": 2, "pla'],
    ["null bytes", "\0\0\0\0"],
  ])("takes the backup when the file is %s", (_, content) => {
    writeFileSync(file("presets.json"), content);
    writeFileSync(file("presets.json.bak"), '{"v": 1}');
    expect(new Store(dir).read("presets.json")).toEqual({ v: 1 });
  });

  it("takes the backup when the file is missing (power lost between the two renames)", () => {
    writeFileSync(file("presets.json.bak"), '{"v": 1}');
    writeFileSync(file("presets.json.tmp"), '{"v": 2}');
    expect(new Store(dir).read("presets.json")).toEqual({ v: 1 });
  });

  it("returns undefined when nothing is readable", () => {
    expect(new Store(dir).read("presets.json")).toBeUndefined();
    writeFileSync(file("presets.json"), "broken");
    expect(new Store(dir).read("presets.json")).toBeUndefined();
  });

  it("does not overwrite a good backup with a broken file", () => {
    writeFileSync(file("presets.json"), "broken");
    writeFileSync(file("presets.json.bak"), '{"v": 1}');
    const s = new Store(dir);
    s.writeLater("presets.json", { v: 3 });
    s.flush();
    expect(json("presets.json")).toEqual({ v: 3 });
    expect(json("presets.json.bak")).toEqual({ v: 1 });
  });

  it("merges quick changes", () => {
    vi.useFakeTimers();
    try {
      const s = new Store(dir);
      s.writeLater("parameter.json", { v: 1 }, 100);
      s.writeLater("parameter.json", { v: 2 }, 100);
      vi.advanceTimersByTime(100);
      expect(json("parameter.json")).toEqual({ v: 2 });
      expect(existsSync(file("parameter.json.bak"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
