import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Engine, MODI, PARAMETER_VORGABE, PATCH_VORGABE, ROTATE_STOP, leseStellungen, schreibeUniversen,
  tiltGrad, tiltWert, type Parameter,
} from "@parrafraktor/engine";

interface Fall {
  parameter: Parameter;
  umlaufVon: number;
  umlaufBis: number;
  tilt: number[];
}

// Referenzwerte aus der Website-Simulation, erzeugt mit scripts/referenz-erzeugen.mjs
const faelle: Fall[] = JSON.parse(readFileSync(new URL("./referenz.json", import.meta.url), "utf8"));

describe("Pattern-Engine", () => {
  it("rechnet dieselben Winkel wie die Simulation", () => {
    expect(faelle.length).toBeGreaterThan(0);
    for (const f of faelle) {
      const engine = new Engine();
      engine.setzeUmlauf(f.parameter, f.umlaufVon, f.umlaufBis);
      const tilt = engine.alle(f.parameter).map((s) => s.tilt);
      tilt.forEach((w, g) => expect(w, `${f.parameter.modus} Spiegel ${g}`).toBeCloseTo(f.tilt[g]!, 5));
    }
  });

  it("dreht bei Rotation über TiltRotate und lässt Tilt auf Offset", () => {
    const p: Parameter = { ...PARAMETER_VORGABE, modus: "rotation", offset: 20, speedVon: 2, speedBis: 6 };
    const s = new Engine().alle(p);
    expect(s[0]).toEqual({ tilt: 20, upm: 2 });
    expect(s[35]).toEqual({ tilt: 20, upm: 6 });
    expect(new Engine().spiegel({ ...p, laeuft: false }, 0).upm).toBe(0);
  });

  it("läuft nach Speed bis wieder gleich, sodass bei Phase 0 alle Spiegel gleich stehen", () => {
    const engine = new Engine();
    const p: Parameter = { ...PARAMETER_VORGABE, phase: 0, speedVon: 5, speedBis: 20 };
    for (let i = 0; i < 40 * 60; i++) engine.weiter(p, 0.025);   // eine Minute gespreizt
    const gespreizt = engine.alle(p).map((s) => s.tilt);
    expect(Math.max(...gespreizt) - Math.min(...gespreizt)).toBeGreaterThan(10);
    const aus = { ...p, speedBis: 0 };
    let vorher = engine.alle(aus);
    for (let i = 0; i < 40 * 3; i++) {
      engine.weiter(aus, 0.025);
      const jetzt = engine.alle(aus);
      // weich: kein Spiegel springt pro Takt mehr als die Bewegung selbst hergibt
      jetzt.forEach((s, g) => expect(Math.abs(s.tilt - vorher[g]!.tilt)).toBeLessThan(15));
      vorher = jetzt;
    }
    const gleich = engine.alle(aus).map((s) => s.tilt);
    expect(Math.max(...gleich) - Math.min(...gleich)).toBeLessThan(0.01);
  });

  it("läuft nicht weiter, wenn pausiert", () => {
    const engine = new Engine();
    engine.weiter({ ...PARAMETER_VORGABE, laeuft: false }, 10);
    expect(engine.umlaufVon).toBe(0);
    engine.weiter(PARAMETER_VORGABE, 20);
    expect(engine.umlaufVon).toBeCloseTo(1);   // 3 BPM × 20 s
  });
});

describe("DMX", () => {
  it("bildet Tilt auf 16 Bit ab und begrenzt auf ±180°", () => {
    expect(tiltWert(-180)).toBe(0);
    expect(tiltWert(180)).toBe(65535);
    expect(tiltWert(400)).toBe(65535);
    expect(tiltGrad(tiltWert(33.3))).toBeCloseTo(33.3, 2);
  });

  it("schreibt den Patch und liest ihn zurück", () => {
    const stellungen = Array.from({ length: 36 }, (_, g) => ({ tilt: g * 5 - 90, upm: 0 }));
    const universen = schreibeUniversen(stellungen, PATCH_VORGABE, 10);
    const dmx = universen.get(1)!;
    // Element 2, Spiegel 0 ab Adresse 38: Tilt coarse/fine, TiltRotate steht
    const w = tiltWert(stellungen[12]!.tilt);
    expect([dmx[37], dmx[38], dmx[39]]).toEqual([w >> 8, w & 0xff, ROTATE_STOP]);
    // Dimmer jedes Elements auf Kanal 37
    expect([dmx[36], dmx[73], dmx[110]]).toEqual([255, 255, 255]);
    const zurueck = leseStellungen(universen, PATCH_VORGABE, 10)!;
    zurueck.forEach((s, g) => expect(s.tilt).toBeCloseTo(stellungen[g]!.tilt, 2));
  });
});

describe("Regler", () => {
  const winkel = (p: Partial<Parameter>, umlauf = 0.3) => {
    const e = new Engine();
    const par = { ...PARAMETER_VORGABE, ...p };
    e.setzeUmlauf(par, umlauf, umlauf);
    return e.alle(par).map((s) => s.tilt);
  };

  it("Symmetrie von innen: beide Hälften gespiegelt", () => {
    const w = winkel({ symmetrie: "innen", phase: 180 });
    for (let g = 0; g < 18; g++) expect(w[g]).toBeCloseTo(-w[35 - g]!, 9);
  });

  it("Richtung zurück spiegelt die Reihenfolge", () => {
    const vor = winkel({ phase: 360 });
    const zurueck = winkel({ phase: 360, richtung: "zurueck" });
    // bei Phase 360 über 36 Spiegel: Spiegel g zurück = Spiegel 35 - g vor
    for (let g = 0; g < 36; g++) expect(zurueck[g]).toBeCloseTo(vor[35 - g]!, 9);
  });

  it("Fächer 100 %: außen volle, innen kaum Amplitude", () => {
    const w = winkel({ symmetrie: "innen", phase: 0, faecher: 100 }, 0.25);   // Sinus auf dem Maximum
    expect(Math.abs(w[0]!)).toBeCloseTo(40 * (17.5 / 18), 6);
    expect(Math.abs(w[17]!)).toBeCloseTo(40 * (0.5 / 18), 6);
  });
});

describe("weiche Formen", () => {
  // Höchste Änderung des Winkels pro kleinem Zeitschritt, bezogen auf die Amplitude:
  // ohne Sprünge bleibt sie klein, ein Sprung (z. B. altes Rechteck) wäre ~2
  it("springen nirgends", () => {
    for (const modus of MODI.filter((m) => m !== "rotation" && m !== "funkeln")) {
      const p: Parameter = { ...PARAMETER_VORGABE, modus, amplitude: 1, speedVon: 60, phase: 360 };
      const e = new Engine();
      let vorher = e.alle(p);
      let maxSchritt = 0;
      for (let i = 0; i < 4000; i++) {
        e.weiter(p, 0.001);
        const jetzt = e.alle(p);
        jetzt.forEach((s, g) => { maxSchritt = Math.max(maxSchritt, Math.abs(s.tilt - vorher[g]!.tilt)); });
        vorher = jetzt;
      }
      expect(maxSchritt, modus).toBeLessThan(0.05);
    }
  });
});
