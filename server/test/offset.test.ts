import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARAMETER_DEFAULTS } from "@parrafraktor/engine";
import { SETTINGS_DEFAULTS, offsetsDiffer, checkPresets, shiftOffset } from "@parrafraktor/protocol";
import { HOLD_MS } from "../src/input/streamdeck/layout.js";
import { StreamDeckModule } from "../src/input/streamdeck/index.js";
import { Controller } from "../src/controller.js";

vi.mock("../src/log.js", () => ({ log: () => {}, errorText: (e: unknown) => String(e) }));

const fresh = () => new Controller({ ...PARAMETER_DEFAULTS }, structuredClone(SETTINGS_DEFAULTS), checkPresets([]));

describe("offset per element", () => {
  it("the common offset shifts all, the distances stay", () => {
    const s = fresh();
    s.set({ offset: 10, offsetGetrennt: true, offsetElemente: [0, 10, 30] });
    s.set({ offset: 25 });
    expect(s.parameter.offsetElemente).toEqual([15, 25, 45]);
    s.adjust("offset", -5);
    expect(s.parameter).toMatchObject({ offset: 20, offsetElemente: [10, 20, 40] });
  });

  it("at the edge it stops instead of squeezing the distances", () => {
    const p = { ...PARAMETER_DEFAULTS, offset: 0, offsetGetrennt: true, offsetElemente: [0, 100, 170] };
    expect(shiftOffset(p, 50)).toEqual({ offset: 10, offsetElemente: [10, 110, 180] });
  });

  it("without \"per element\" only the offset", () => {
    const s = fresh();
    s.set({ offset: 40 });
    expect(s.parameter.offsetElemente).toEqual(PARAMETER_DEFAULTS.offsetElemente);
  });

  it("adjusting one element turns on \"per element\", reset makes all alike again", () => {
    const s = fresh();
    s.set({ offset: 20 });
    s.adjustElementOffset(1, 15);
    expect(s.parameter).toMatchObject({ offsetGetrennt: true, offsetElemente: [20, 35, 20] });
    expect(offsetsDiffer(s.parameter)).toBe(true);
    s.reset("offset");
    expect(s.parameter.offsetGetrennt).toBe(false);
    expect(new Set(s.parameter.offsetElemente).size).toBe(1);
    expect(offsetsDiffer(s.parameter)).toBe(false);
  });

  it("presets carry the per-element values without shifting twice", () => {
    const s = fresh();
    s.set({ offset: 5, offsetGetrennt: true, offsetElemente: [1, 2, 3] });
    s.storePreset(0);
    s.set({ offset: 50 });
    s.recallPreset(0);
    expect(s.parameter).toMatchObject({ offset: 5, offsetElemente: [1, 2, 3] });
  });
});

// Private members of the Stream Deck module the tests drive directly
interface DeckInternals {
  encoderDown(i: number): void;
  encoderUp(i: number): void;
  turn(i: number, steps: number): void;
  fields(): { title: string; value: string }[];
  close(): Promise<void>;
}

describe("offset per element on the Stream Deck", () => {
  let s: Controller, deck: DeckInternals;
  beforeEach(() => {
    vi.useFakeTimers();
    s = fresh();   // sine: the first encoder page starts with Offset
    deck = new StreamDeckModule(s) as unknown as DeckInternals;
  });
  afterEach(async () => {
    await deck.close();
    vi.useRealTimers();
  });

  const long = (i: number) => { deck.encoderDown(i); vi.advanceTimersByTime(HOLD_MS.encoderLong); deck.encoderUp(i); };

  it("long press on Offset: three elements and all on the encoders", () => {
    expect(deck.fields()[0]!.title).toBe("Offset");
    long(0);
    expect(deck.fields().map((f) => f.title)).toEqual(["Off. 1", "Off. 2", "Off. 3", "Off. all"]);
    expect(s.parameter.offsetGetrennt).toBe(true);
    deck.turn(2, 10);
    deck.turn(3, 4);
    const o = s.parameter.offset;
    expect(s.parameter.offsetElemente).toEqual([o, o, o + 10]);
    long(1);
    expect(deck.fields()[0]!.title).toBe("Offset 1–3");   // back, the elements stay different
  });

  it("a short press on Offset acts on release: reset for all", () => {
    s.set({ offset: 30 });
    deck.encoderDown(0);
    expect(s.parameter.offset).toBe(30);
    deck.encoderUp(0);
    expect(s.parameter.offset).toBe(PARAMETER_DEFAULTS.offset);
  });
});
