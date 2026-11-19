import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Speicher } from "../src/speicher.js";

vi.mock("../src/log.js", () => ({ log: () => {}, fehlerText: (e: unknown) => String(e) }));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "speicher-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const datei = (name: string) => join(dir, name);
const json = (name: string) => JSON.parse(readFileSync(datei(name), "utf8"));

describe("Speicher", () => {
  it("schreibt und liest wieder", () => {
    const s = new Speicher(dir);
    s.schreibeSpaeter("presets.json", { a: 1 });
    s.leere();
    expect(new Speicher(dir).lies("presets.json")).toEqual({ a: 1 });
    expect(existsSync(datei("presets.json.tmp"))).toBe(false);
  });

  it("hält die vorige Fassung als Sicherung", () => {
    const s = new Speicher(dir);
    s.schreibeSpaeter("presets.json", { v: 1 });
    s.leere();
    expect(existsSync(datei("presets.json.bak"))).toBe(false);
    s.schreibeSpaeter("presets.json", { v: 2 });
    s.leere();
    expect(json("presets.json")).toEqual({ v: 2 });
    expect(json("presets.json.bak")).toEqual({ v: 1 });
  });

  it.each([
    ["leer", ""],
    ["abgeschnitten", '{"v": 2, "pla'],
    ["Nullbytes", "\0\0\0\0"],
  ])("nimmt die Sicherung, wenn die Datei %s ist", (_, inhalt) => {
    writeFileSync(datei("presets.json"), inhalt);
    writeFileSync(datei("presets.json.bak"), '{"v": 1}');
    expect(new Speicher(dir).lies("presets.json")).toEqual({ v: 1 });
  });

  it("nimmt die Sicherung, wenn die Datei fehlt (Strom weg zwischen den beiden rename)", () => {
    writeFileSync(datei("presets.json.bak"), '{"v": 1}');
    writeFileSync(datei("presets.json.tmp"), '{"v": 2}');
    expect(new Speicher(dir).lies("presets.json")).toEqual({ v: 1 });
  });

  it("gibt undefined zurück, wenn nichts lesbar ist", () => {
    expect(new Speicher(dir).lies("presets.json")).toBeUndefined();
    writeFileSync(datei("presets.json"), "kaputt");
    expect(new Speicher(dir).lies("presets.json")).toBeUndefined();
  });

  it("überschreibt eine gute Sicherung nicht mit einer kaputten Datei", () => {
    writeFileSync(datei("presets.json"), "kaputt");
    writeFileSync(datei("presets.json.bak"), '{"v": 1}');
    const s = new Speicher(dir);
    s.schreibeSpaeter("presets.json", { v: 3 });
    s.leere();
    expect(json("presets.json")).toEqual({ v: 3 });
    expect(json("presets.json.bak")).toEqual({ v: 1 });
  });

  it("fasst schnelle Änderungen zusammen", () => {
    vi.useFakeTimers();
    try {
      const s = new Speicher(dir);
      s.schreibeSpaeter("parameter.json", { v: 1 }, 100);
      s.schreibeSpaeter("parameter.json", { v: 2 }, 100);
      vi.advanceTimersByTime(100);
      expect(json("parameter.json")).toEqual({ v: 2 });
      expect(existsSync(datei("parameter.json.bak"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
