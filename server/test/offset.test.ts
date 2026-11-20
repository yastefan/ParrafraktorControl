import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARAMETER_DEFAULTS } from "@parrafraktor/engine";
import { SETTINGS_DEFAULTS, offsetsDiffer, checkPresets, shiftOffset } from "@parrafraktor/protocol";
import { HALTEN_MS } from "../src/eingabe/streamdeck/belegung.js";
import { StreamDeckModul } from "../src/eingabe/streamdeck/index.js";
import { Steuerung } from "../src/steuerung.js";

vi.mock("../src/log.js", () => ({ log: () => {}, fehlerText: (e: unknown) => String(e) }));

const neu = () => new Steuerung({ ...PARAMETER_DEFAULTS }, structuredClone(SETTINGS_DEFAULTS), checkPresets([]));

describe("Offset je Element", () => {
  it("der gemeinsame Offset verschiebt alle, die Abstände bleiben", () => {
    const s = neu();
    s.setze({ offset: 10, offsetGetrennt: true, offsetElemente: [0, 10, 30] });
    s.setze({ offset: 25 });
    expect(s.parameter.offsetElemente).toEqual([15, 25, 45]);
    s.verstelle("offset", -5);
    expect(s.parameter).toMatchObject({ offset: 20, offsetElemente: [10, 20, 40] });
  });

  it("am Rand bleibt er stehen, statt die Abstände zu stauchen", () => {
    const p = { ...PARAMETER_DEFAULTS, offset: 0, offsetGetrennt: true, offsetElemente: [0, 100, 170] };
    expect(shiftOffset(p, 50)).toEqual({ offset: 10, offsetElemente: [10, 110, 180] });
  });

  it("ohne „je Element“ nur der Offset", () => {
    const s = neu();
    s.setze({ offset: 40 });
    expect(s.parameter.offsetElemente).toEqual(PARAMETER_DEFAULTS.offsetElemente);
  });

  it("Element einzeln verstellen schaltet „je Element“ ein, Vorgabe macht alle wieder gleich", () => {
    const s = neu();
    s.setze({ offset: 20 });
    s.verstelleOffsetElement(1, 15);
    expect(s.parameter).toMatchObject({ offsetGetrennt: true, offsetElemente: [20, 35, 20] });
    expect(offsetsDiffer(s.parameter)).toBe(true);
    s.vorgabe("offset");
    expect(s.parameter.offsetGetrennt).toBe(false);
    expect(new Set(s.parameter.offsetElemente).size).toBe(1);
    expect(offsetsDiffer(s.parameter)).toBe(false);
  });

  it("Presets tragen die Werte je Element mit, ohne doppelt zu verschieben", () => {
    const s = neu();
    s.setze({ offset: 5, offsetGetrennt: true, offsetElemente: [1, 2, 3] });
    s.speicherePreset(0);
    s.setze({ offset: 50 });
    s.rufePresetAuf(0);
    expect(s.parameter).toMatchObject({ offset: 5, offsetElemente: [1, 2, 3] });
  });
});

interface DeckIntern {
  reglerRunter(i: number): void;
  reglerHoch(i: number): void;
  drehe(i: number, schritte: number): void;
  felder(): { titel: string; wert: string }[];
  schliesse(): Promise<void>;
}

describe("Offset je Element am Stream Deck", () => {
  let s: Steuerung, deck: DeckIntern;
  beforeEach(() => {
    vi.useFakeTimers();
    s = neu();   // Sinus: erste Reglerseite beginnt mit Offset
    deck = new StreamDeckModul(s) as unknown as DeckIntern;
  });
  afterEach(async () => {
    await deck.schliesse();
    vi.useRealTimers();
  });

  const lang = (i: number) => { deck.reglerRunter(i); vi.advanceTimersByTime(HALTEN_MS.reglerLang); deck.reglerHoch(i); };

  it("langer Druck auf Offset: drei Elemente und alle auf den Reglern", () => {
    expect(deck.felder()[0]!.titel).toBe("Offset");
    lang(0);
    expect(deck.felder().map((f) => f.titel)).toEqual(["Off. 1", "Off. 2", "Off. 3", "Off. all"]);
    expect(s.parameter.offsetGetrennt).toBe(true);
    deck.drehe(2, 10);
    deck.drehe(3, 4);
    const o = s.parameter.offset;
    expect(s.parameter.offsetElemente).toEqual([o, o, o + 10]);
    lang(1);
    expect(deck.felder()[0]!.titel).toBe("Offset 1–3");   // zurück, Elemente bleiben verschieden
  });

  it("kurzer Druck auf Offset wirkt beim Loslassen: Vorgabe für alle", () => {
    s.setze({ offset: 30 });
    deck.reglerRunter(0);
    expect(s.parameter.offset).toBe(30);
    deck.reglerHoch(0);
    expect(s.parameter.offset).toBe(PARAMETER_DEFAULTS.offset);
  });
});
