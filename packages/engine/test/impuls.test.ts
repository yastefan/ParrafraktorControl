import { describe, expect, it } from "vitest";
import {
  IMPULS_VORGABE, SPIEGEL_GESAMT, SPIEGEL_N, huellenWert, impulsFertig, wendeImpulseAn, type ImpulsEinstellung,
} from "../src/index.js";

const h = { attackS: 1, releaseS: 2, staerke: 100 };
const basis = Array.from({ length: SPIEGEL_GESAMT }, () => ({ tilt: 10, upm: 4 }));
const ziele = { auf: 90, zu: -90 };

describe("Hüllkurve", () => {
  it("fährt weich hin, hält und fährt nach dem Loslassen zurück", () => {
    expect(huellenWert(h, 0, null)).toBe(0);
    expect(huellenWert(h, 0.5, null)).toBeCloseTo(0.5);
    expect(huellenWert(h, 5, null)).toBe(1);          // gehalten
    expect(huellenWert(h, 5, 4)).toBeCloseTo(0.5);    // Mitte des Release
    expect(huellenWert(h, 6, 4)).toBe(0);
  });

  it("fährt beim Loslassen im Attack von dort zurück, ohne Sprung", () => {
    const vorher = huellenWert(h, 0.3 - 1e-6, null);
    expect(huellenWert(h, 0.3, 0.3)).toBeCloseTo(vorher, 4);
  });
});

describe("Impulse anwenden", () => {
  it("Flash auf fährt alle Spiegel zum Ziel und hält TiltRotate an", () => {
    const s = wendeImpulseAn(basis, [{ id: 1, ziel: "auf", alterS: 3, losS: null, ursprung: null }], IMPULS_VORGABE, ziele, "links");
    expect(s.every((x) => x.tilt === 90 && x.upm === 0)).toBe(true);
  });

  it("Stärke 50 % fährt nur halb", () => {
    const e = { ...IMPULS_VORGABE, huelle: { ...IMPULS_VORGABE.huelle, staerke: 50 } };
    expect(wendeImpulseAn(basis, [{ id: 1, ziel: "auf", alterS: 3, losS: null, ursprung: null }], e, ziele, "links")[0]!.tilt).toBe(50);
  });

  it("Element-Folge: erst vorn, dann die anderen – Release in derselben Folge", () => {
    const e: ImpulsEinstellung = { huelle: h, elementFolge: "vorneHinten", elementVersatzS: 1, ausbreitungS: 0 };
    const bei = (alterS: number, losS: number | null) =>
      wendeImpulseAn(basis, [{ id: 1, ziel: "auf", alterS, losS, ursprung: null }], e, ziele, "links").map((x) => x.tilt);
    const t = bei(1.5, null);
    expect(t[0]).toBe(90);                    // Element 1 ganz auf
    expect(t[SPIEGEL_N]!).toBeGreaterThan(10); // Element 2 unterwegs
    expect(t[2 * SPIEGEL_N]).toBe(10);        // Element 3 noch nicht
    const r = bei(6.5, 5);                     // losgelassen bei 5 s
    expect(r[0]).toBeLessThan(90);            // Element 1 fährt schon zurück
    expect(r[2 * SPIEGEL_N]).toBe(90);        // Element 3 hält noch
    expect(impulsFertig(e, { alterS: 8.9, losS: 5 })).toBe(false);
    expect(impulsFertig(e, { alterS: 9, losS: 5 })).toBe(true);
  });

  it("der zuletzt gedrückte Impuls liegt oben", () => {
    const s = wendeImpulseAn(basis, [
      { id: 1, ziel: "auf", alterS: 5, losS: null, ursprung: null },
      { id: 2, ziel: "zu", alterS: 5, losS: null, ursprung: null },
    ], IMPULS_VORGABE, ziele, "links");
    expect(s[0]!.tilt).toBe(-90);
  });

  it("läuft mit Ausbreitung vom Ursprung des Touchstreifens nach außen", () => {
    const e: ImpulsEinstellung = { ...IMPULS_VORGABE, huelle: h, ausbreitungS: 1.1 };
    // Ursprung rechts: Spiegel 11 startet sofort, Spiegel 0 erst nach 1,1 s
    const r = wendeImpulseAn(basis, [{ id: 1, ziel: "auf", alterS: 1, losS: null, ursprung: 1 }], e, ziele, "links");
    expect(r[11]!.tilt).toBe(90);
    expect(r[0]!.tilt).toBe(10);
    expect(r[12 + 11]!.tilt).toBe(90);   // gilt für jedes Element
    // ohne Ursprung entlang der Ordnung: bei "rechts" ebenso
    const o = wendeImpulseAn(basis, [{ id: 1, ziel: "auf", alterS: 1, losS: null, ursprung: null }], e, ziele, "rechts");
    o.forEach((x, g) => expect(x.tilt).toBeCloseTo(r[g]!.tilt, 9));
    expect(impulsFertig(e, { alterS: 1 + 1.1 + 2 - 0.01, losS: 1 })).toBe(false);
  });
});
