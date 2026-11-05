import { describe, expect, it } from "vitest";
import {
  IMPULS_VORGABE, SPIEGEL_GESAMT, SPIEGEL_N, huellenWert, impulsFertig, wendeImpulseAn,
  type ImpulsEinstellung, type LaufenderImpuls,
} from "../src/index.js";

const h = { attackS: 1, sustainS: 2, releaseS: 2, staerke: 100 };
const e: ImpulsEinstellung = { ...IMPULS_VORGABE, huelle: h };
const basis = Array.from({ length: SPIEGEL_GESAMT }, () => ({ tilt: 10, upm: 4 }));
const winkel = { auf: 90, zu: -90 };
const impuls = (teil: Partial<LaufenderImpuls>): LaufenderImpuls => ({ id: 1, art: "auf", alterS: 0, ursprung: 0.5, breite: 0, wischt: false, ...teil });
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

  it("Breite: getippt wirkt der Impuls nur um den Startpunkt", () => {
    const t = tilts(e, { alterS: 2, ursprung: 0, breite: 3 });
    expect(t.slice(0, 3)).toEqual([90, 90, 10]);   // Spiegel 0 und 1 voll, ab Spiegel 2 nicht mehr
    const halb = tilts(e, { alterS: 2, ursprung: 0, breite: 2 });
    expect(halb[1]).toBe(50);                     // Rand: halb
  });

  it("Symmetrisch: startet auch am gespiegelten Punkt, rechts gespiegelt", () => {
    const ee: ImpulsEinstellung = { ...e, symmetrisch: true, ausbreitungS: 4.4 };
    const t = tilts(ee, { alterS: 1, ursprung: 0 });
    expect(t[0]).toBe(-90);   // links gespiegelt wie beim Gegenlauf
    expect(t[11]).toBe(90);
    expect(t[5]).toBe(10);
  });

  it("der zuletzt gestartete Impuls liegt oben", () => {
    expect(tilts(e, { alterS: 2 }, { id: 2, art: "zu", alterS: 2 })[0]).toBe(-90);
  });

  describe("Loch und Iris", () => {
    // Offen in allen drei Elementen an einem Punkt (x, y), Drehung 0°/45°/90°
    const offen = (w: number[], x: number, y: number) =>
      Math.min(...[0, 45, 90].map((d, k) => {
        const a = (d * Math.PI) / 180, u = x * Math.cos(a) + y * Math.sin(a);
        return Math.abs(w[k * 12 + Math.min(11, Math.max(0, Math.floor((u + 0.9) / 0.15)))]!);
      }));
    const loch: ImpulsEinstellung = { ...e, groesse: 20 };

    it("Loch: am Ursprung offen, sonst zu, nach der Hülle wieder wie vorher", () => {
      const w = tilts(loch, { art: "loch", alterS: 2, ursprung: 0.25 });
      expect(offen(w, -0.3, 0)).toBeGreaterThan(80);
      expect(offen(w, 0.3, 0)).toBeLessThan(1);
      expect(tilts(loch, { art: "loch", alterS: 5, ursprung: 0.25 })[0]).toBe(10);
    });

    it("Iris: wächst mit der Hülle aus einem Punkt", () => {
      const anzahl = (a: number) => tilts(loch, { art: "iris", alterS: a }).filter((x) => x > 45).length;
      expect(anzahl(0.5)).toBeLessThan(anzahl(2));
    });

    it("gewischt fährt das Loch quer durchs Bild", () => {
      const ee: ImpulsEinstellung = { ...loch, ausbreitungS: 2 };
      const anfang = tilts(ee, { art: "loch", alterS: 1, ursprung: 0, wischt: true });   // Mitte der Fahrt
      expect(offen(anfang, 0, 0)).toBeGreaterThan(80);
      const ende = tilts(ee, { art: "loch", alterS: 2.5, ursprung: 0, wischt: true });
      expect(offen(ende, 0.6, 0)).toBeGreaterThan(80);
      expect(offen(ende, -0.6, 0)).toBeLessThan(1);
    });

    it("symmetrisch: zwei gespiegelte Löcher", () => {
      const w = tilts({ ...loch, symmetrisch: true }, { art: "loch", alterS: 2, ursprung: 0.1 });
      expect(offen(w, -0.48, 0)).toBeGreaterThan(80);
      expect(offen(w, 0.48, 0)).toBeGreaterThan(80);
      expect(offen(w, 0, 0)).toBeLessThan(1);
    });

    it("die Fahrt gehört zur Hülle: Ausbreitung verlängert sie nicht", () => {
      expect(impulsFertig({ ...loch, ausbreitungS: 3 }, { alterS: 5, art: "loch" })).toBe(true);
    });
  });
});
