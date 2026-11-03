import { describe, expect, it } from "vitest";
import {
  IMPULS_VORGABE, SPIEGEL_GESAMT, SPIEGEL_N, huellenWert, impulsFertig, rasterStart, stossWert, wendeImpulseAn,
  type ImpulsEinstellung, type LaufenderImpuls,
} from "../src/index.js";

const h = { attackS: 1, sustainS: 2, releaseS: 2, staerke: 100 };
const e: ImpulsEinstellung = { ...IMPULS_VORGABE, huelle: h };
const basis = Array.from({ length: SPIEGEL_GESAMT }, () => ({ tilt: 10, upm: 4 }));
const winkel = { auf: 90, zu: -90, ausschlag: 30 };
const impuls = (teil: Partial<LaufenderImpuls>): LaufenderImpuls => ({ id: 1, art: "auf", alterS: 0, ursprung: 0.5, ...teil });
const tilts = (ee: ImpulsEinstellung, ...i: Partial<LaufenderImpuls>[]) =>
  wendeImpulseAn(basis, i.map(impuls), ee, winkel).map((s) => s.tilt);

describe("Hüllkurve", () => {
  it("fährt weich hin, bleibt für den Sustain und fährt zurück", () => {
    expect(huellenWert(h, 0)).toBe(0);
    expect(huellenWert(h, 0.5)).toBeCloseTo(0.5);
    expect(huellenWert(h, 2.9)).toBe(1);          // Sustain
    expect(huellenWert(h, 4)).toBeCloseTo(0.5);   // Mitte des Release
    expect(huellenWert(h, 5)).toBe(0);
  });
});

describe("Impulse anwenden", () => {
  it("Flash fährt zum Ziel und hält TiltRotate an", () => {
    const s = wendeImpulseAn(basis, [impuls({ alterS: 2 })], e, winkel);
    expect(s.every((x) => x.tilt === 90 && x.upm === 0)).toBe(true);
    expect(tilts({ ...e, huelle: { ...h, staerke: 50 } }, { alterS: 2 })[0]).toBe(50);
  });

  it("vor dem Start (Warten auf den Schlag) passiert nichts", () => {
    expect(tilts(e, { alterS: -0.3 })).toEqual(basis.map((x) => x.tilt));
  });

  it("Element-Folge: erst vorn, dann die anderen – Release in derselben Folge", () => {
    const ee: ImpulsEinstellung = { ...e, elementFolge: "vorneHinten", elementVersatzS: 1 };
    const t = tilts(ee, { alterS: 1.5 });
    expect(t[0]).toBe(90);                     // Element 1 ganz auf
    expect(t[SPIEGEL_N]!).toBeGreaterThan(10); // Element 2 unterwegs
    expect(t[2 * SPIEGEL_N]).toBe(10);         // Element 3 noch nicht
    const r = tilts(ee, { alterS: 4.5 });
    expect(r[0]).toBeLessThan(90);             // Element 1 fährt schon zurück
    expect(r[2 * SPIEGEL_N]).toBe(90);         // Element 3 hält noch
    expect(impulsFertig(ee, { alterS: 6.9, art: "auf" })).toBe(false);
    expect(impulsFertig(ee, { alterS: 7, art: "auf" })).toBe(true);
  });

  it("läuft mit Ausbreitung vom Ursprung nach außen", () => {
    const ee: ImpulsEinstellung = { ...e, ausbreitungS: 1.1 };
    const r = tilts(ee, { alterS: 1, ursprung: 1 });
    expect(r[11]).toBe(90);
    expect(r[0]).toBe(10);
    expect(r[12 + 11]).toBe(90);   // gilt für jedes Element
  });

  it("der zuletzt gestartete Impuls liegt oben", () => {
    expect(tilts(e, { alterS: 2 }, { id: 2, art: "zu", alterS: 2 })[0]).toBe(-90);
  });

  it("Stoß: läuft vom Ursprung los, kommt an den Enden zurück und schwingt aus", () => {
    const ee: ImpulsEinstellung = { ...e, huelle: { ...h, attackS: 0.1 }, ausbreitungS: 1 };
    // kurz nach dem Stoß bewegt sich nur die Nähe des Ursprungs
    expect(Math.abs(stossWert(ee, 0, 0, 0.1))).toBeGreaterThan(0.3);
    expect(stossWert(ee, 1, 0, 0.1)).toBe(0);
    // nach 1 s ist er am anderen Ende angekommen
    expect(Math.abs(stossWert(ee, 1, 0, 1.1))).toBeGreaterThan(0.1);
    // nach Sustain + Release ist alles still
    expect(stossWert(ee, 0.5, 0, 4.1)).toBe(0);
    const t = tilts(ee, { art: "stoss", alterS: 0.1, ursprung: 0 });
    expect(Math.abs(t[0]! - 10)).toBeLessThanOrEqual(30 * 1.09);
    expect(t[11]).toBe(10);
  });

  it("Glitzern: einzelne Spiegel zucken, nicht alle, und nur im Ausschlag", () => {
    const zuckt = new Set<number>();
    for (let a = 0.5; a < 3; a += 0.05) {
      tilts(e, { art: "glitzern", alterS: a }).forEach((x, g) => {
        expect(Math.abs(x - 10)).toBeLessThanOrEqual(30 + 1e-9);
        if (Math.abs(x - 10) > 1) zuckt.add(g);
      });
      const jetzt = tilts(e, { art: "glitzern", alterS: a }).filter((x) => Math.abs(x - 10) > 1).length;
      expect(jetzt).toBeLessThan(SPIEGEL_GESAMT * 0.7);
    }
    expect(zuckt.size).toBeGreaterThan(SPIEGEL_GESAMT / 2);
  });
});

describe("Raster", () => {
  it("startet auf dem nächsten Schlag oder Takt, knapp danach noch auf dem letzten", () => {
    const ee: ImpulsEinstellung = { ...e, bpm: 120, raster: "schlag" };
    expect(rasterStart(ee, 10, 10.2)).toBeCloseTo(10.5);
    expect(rasterStart(ee, 10, 10.55)).toBeCloseTo(10.5);
    expect(rasterStart({ ...ee, raster: "takt" }, 10, 10.2)).toBeCloseTo(12);
    expect(rasterStart({ ...ee, raster: "aus" }, 10, 10.2)).toBe(10.2);
  });
});
