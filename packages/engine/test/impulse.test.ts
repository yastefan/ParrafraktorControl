import { describe, expect, it } from "vitest";
import {
  IMPULSE_DEFAULTS, MIRRORS_TOTAL, MIRRORS_PER_ELEMENT, envelopeValue, impulseDone, applyImpulses,
  type ImpulseSettings, type RunningImpulse,
} from "../src/index.js";

const h = { attackS: 1, sustainS: 2, releaseS: 2, staerke: 100 };
const e: ImpulseSettings = { ...IMPULSE_DEFAULTS, huelle: h };
const base = Array.from({ length: MIRRORS_TOTAL }, () => ({ tilt: 10, upm: 4 }));
const angles = { auf: 90, zu: -90 };
const impulse = (part: Partial<RunningImpulse>): RunningImpulse => ({ id: 1, art: "auf", alterS: 0, ursprung: 0.5, breite: 0, wischt: false, ...part });
const tilts = (ee: ImpulseSettings, ...i: Partial<RunningImpulse>[]) =>
  applyImpulses(base, i.map(impulse), ee, angles).map((s) => s.tilt);

describe("envelope", () => {
  it("moves there smoothly, stays for the sustain and moves back", () => {
    expect(envelopeValue(h, 0)).toBe(0);
    expect(envelopeValue(h, 0.5)).toBeCloseTo(0.5);
    expect(envelopeValue(h, 2.9)).toBe(1);          // sustain
    expect(envelopeValue(h, 4)).toBeCloseTo(0.5);   // middle of the release
    expect(envelopeValue(h, 5)).toBe(0);
  });
});

describe("applying impulses", () => {
  it("flash moves to the target and stops TiltRotate", () => {
    const s = applyImpulses(base, [impulse({ alterS: 2 })], e, angles);
    expect(s.every((x) => x.tilt === 90 && x.upm === 0)).toBe(true);
    expect(tilts({ ...e, huelle: { ...h, staerke: 50 } }, { alterS: 2 })[0]).toBe(50);
  });

  it("element order: first the front, then the others – release in the same order", () => {
    const ee: ImpulseSettings = { ...e, elementFolge: "vorneHinten", elementVersatzS: 1 };
    const t = tilts(ee, { alterS: 1.5 });
    expect(t[0]).toBe(90);                                // element 1 fully there
    expect(t[MIRRORS_PER_ELEMENT]!).toBeGreaterThan(10);  // element 2 on the way
    expect(t[2 * MIRRORS_PER_ELEMENT]).toBe(10);          // element 3 not yet
    const r = tilts(ee, { alterS: 4.5 });
    expect(r[0]).toBeLessThan(90);                        // element 1 already moving back
    expect(r[2 * MIRRORS_PER_ELEMENT]).toBe(90);          // element 3 still holding
    expect(impulseDone(ee, { alterS: 6.9, art: "auf" })).toBe(false);
    expect(impulseDone(ee, { alterS: 7, art: "auf" })).toBe(true);
  });

  it("with spread it runs from the origin outwards", () => {
    const ee: ImpulseSettings = { ...e, ausbreitungS: 1.1 };
    const r = tilts(ee, { alterS: 1, ursprung: 1 });
    expect(r[11]).toBe(90);
    expect(r[0]).toBe(10);
    expect(r[12 + 11]).toBe(90);   // applies to every element
  });

  it("width: tapped, the impulse only acts around the start point", () => {
    const t = tilts(e, { alterS: 2, ursprung: 0, breite: 3 });
    expect(t.slice(0, 3)).toEqual([90, 90, 10]);   // mirrors 0 and 1 fully, from mirror 2 no more
    const half = tilts(e, { alterS: 2, ursprung: 0, breite: 2 });
    expect(half[1]).toBe(50);                      // edge: half
  });

  it("symmetric: also starts at the mirrored point, left mirrored", () => {
    const ee: ImpulseSettings = { ...e, symmetrisch: true, ausbreitungS: 4.4 };
    const t = tilts(ee, { alterS: 1, ursprung: 0 });
    expect(t[0]).toBe(-90);   // left mirrored as with counter-motion
    expect(t[11]).toBe(90);
    expect(t[5]).toBe(10);
  });

  it("the impulse started last is on top", () => {
    expect(tilts(e, { alterS: 2 }, { id: 2, art: "zu", alterS: 2 })[0]).toBe(-90);
  });

  describe("hole and iris", () => {
    // Open in all three elements at a point (x, y), rotation 0°/45°/90°
    const open = (w: number[], x: number, y: number) =>
      Math.min(...[0, 45, 90].map((d, k) => {
        const a = (d * Math.PI) / 180, u = x * Math.cos(a) + y * Math.sin(a);
        return Math.abs(w[k * 12 + Math.min(11, Math.max(0, Math.floor((u + 0.9) / 0.15)))]!);
      }));
    const hole: ImpulseSettings = { ...e, groesse: 20 };

    it("hole: open at the origin, closed elsewhere, as before after the envelope", () => {
      const w = tilts(hole, { art: "loch", alterS: 2, ursprung: 0.25 });
      expect(open(w, -0.3, 0)).toBeGreaterThan(80);
      expect(open(w, 0.3, 0)).toBeLessThan(1);
      expect(tilts(hole, { art: "loch", alterS: 5, ursprung: 0.25 })[0]).toBe(10);
    });

    it("iris: grows out of a point with the envelope", () => {
      const count = (a: number) => tilts(hole, { art: "iris", alterS: a }).filter((x) => x > 45).length;
      expect(count(0.5)).toBeLessThan(count(2));
    });

    it("swiped, the hole travels across the image", () => {
      const ee: ImpulseSettings = { ...hole, ausbreitungS: 2 };
      const middle = tilts(ee, { art: "loch", alterS: 1, ursprung: 0, wischt: true });   // middle of the travel
      expect(open(middle, 0, 0)).toBeGreaterThan(80);
      const end = tilts(ee, { art: "loch", alterS: 2.5, ursprung: 0, wischt: true });
      expect(open(end, 0.6, 0)).toBeGreaterThan(80);
      expect(open(end, -0.6, 0)).toBeLessThan(1);
    });

    it("symmetric: two mirrored holes", () => {
      const w = tilts({ ...hole, symmetrisch: true }, { art: "loch", alterS: 2, ursprung: 0.1 });
      expect(open(w, -0.48, 0)).toBeGreaterThan(80);
      expect(open(w, 0.48, 0)).toBeGreaterThan(80);
      expect(open(w, 0, 0)).toBeLessThan(1);
    });

    it("the travel belongs to the envelope: spread does not lengthen it", () => {
      expect(impulseDone({ ...hole, ausbreitungS: 3 }, { alterS: 5, art: "loch" })).toBe(true);
    });
  });
});
