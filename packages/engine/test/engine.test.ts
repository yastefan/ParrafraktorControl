import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Engine, MODI, PARAMETER_VORGABE, PATCH_VORGABE, ROTATE_STOP, leseStellungen, schreibeUniversen,
  tiltGrad, tiltWert, type Parameter,
} from "@parrafraktor/engine";

interface Fall {
  parameter: Parameter;
  umlaufVon: number;
  umlauf: number[];
  tilt: number[];
}

// Referenzwerte aus der Website-Simulation, erzeugt mit scripts/referenz-erzeugen.mjs
const faelle: Fall[] = JSON.parse(readFileSync(new URL("./referenz.json", import.meta.url), "utf8"));

describe("Pattern-Engine", () => {
  it("rechnet dieselben Winkel wie die Simulation", () => {
    expect(faelle.length).toBeGreaterThan(0);
    for (const f of faelle) {
      const engine = new Engine();
      engine.umlaufVon = f.umlaufVon;
      engine.umlauf.set(f.umlauf);
      const tilt = engine.alle(f.parameter).map((s) => s.tilt);
      tilt.forEach((w, g) => expect(w, `${f.parameter.modus} ${f.parameter.ordnung} Spiegel ${g}`).toBeCloseTo(f.tilt[g]!, 5));
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

  it("Mitte → außen mit Gegenlauf: beide Hälften jedes Elements gespiegelt", () => {
    const w = winkel({ ordnung: "mitteAussen", gegenlauf: true, phase: 180 });
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 6; i++) expect(w[k * 12 + i]).toBeCloseTo(-w[k * 12 + 11 - i]!, 9);
    }
  });

  it("vorn → hinten zählt über alle 36 weiter, hinten → vorn umgekehrt", () => {
    const vor = winkel({ phase: 360 });
    const zurueck = winkel({ phase: 360, ordnung: "rechts", elementFolge: "hintenVorne" });
    // bei Phase 360 über 36 Spiegel: Spiegel g zurück = Spiegel 35 - g vor
    for (let g = 0; g < 36; g++) expect(zurueck[g]).toBeCloseTo(vor[35 - g]!, 9);
  });

  it("zusammen: alle Elemente gleich", () => {
    const w = winkel({ ordnung: "zufall", elementFolge: "zusammen", phase: 360 });
    for (let i = 0; i < 12; i++) expect(w[i]).toBeCloseTo(w[24 + i]!, 9);
  });

  it("Fächer 100 % von der Mitte: außen volle, innen kaum Amplitude", () => {
    const w = winkel({ ordnung: "mitteAussen", phase: 0, faecher: 100 }, 0.25);   // Sinus auf dem Maximum
    expect(Math.abs(w[0]!)).toBeCloseTo(40 * (5.5 / 6), 6);
    expect(Math.abs(w[5]!)).toBeCloseTo(40 * (0.5 / 6), 6);
  });

  it("Offset je Element", () => {
    const w = winkel({ amplitude: 0, offsetGetrennt: true, offsetElemente: [-30, 0, 45] });
    expect([w[0], w[12], w[35]]).toEqual([-30, 0, 45]);
  });

  it("Pendelwelle läuft auseinander und nach der Wiederkehr wieder zusammen", () => {
    // 2 Schwünge des ersten Spiegels bei 6 BPM: nach 20 s wieder gleich
    const p: Parameter = { ...PARAMETER_VORGABE, modus: "pendelwelle", schwuenge: 2, speedVon: 6 };
    const e = new Engine();
    for (let i = 0; i < 200; i++) e.weiter(p, 0.025);   // 5 s: Viertel
    const mitte = e.alle(p).map((s) => s.tilt);
    expect(Math.max(...mitte) - Math.min(...mitte)).toBeGreaterThan(40);
    for (let i = 0; i < 600; i++) e.weiter(p, 0.025);   // 20 s: ganze Wiederkehr
    const ende = e.alle(p).map((s) => s.tilt);
    expect(Math.max(...ende) - Math.min(...ende)).toBeLessThan(0.01);
  });

  it("Pendelwelle: doppelter Speed zeigt dasselbe Bild in der halben Zeit", () => {
    const bild = (speedVon: number, schritte: number) => {
      const p: Parameter = { ...PARAMETER_VORGABE, modus: "pendelwelle", speedVon };
      const e = new Engine();
      for (let i = 0; i < schritte; i++) e.weiter(p, 0.025);
      return e.alle(p).map((s) => s.tilt);
    };
    const langsam = bild(5, 400), schnell = bild(10, 200);
    langsam.forEach((w, g) => expect(schnell[g]).toBeCloseTo(w, 6));
  });

  it("Wind bleibt in der Amplitude und Nachbarn sind sich ähnlich", () => {
    const e = new Engine();
    const p: Parameter = { ...PARAMETER_VORGABE, modus: "wind", wellenlaenge: 12, phase: 0 };
    let maxNachbar = 0;
    for (let i = 0; i < 2000; i++) {
      e.weiter(p, 0.05);
      const w = e.alle(p).map((s) => s.tilt);
      w.forEach((x) => expect(Math.abs(x)).toBeLessThanOrEqual(40));
      for (let g = 1; g < 12; g++) maxNachbar = Math.max(maxNachbar, Math.abs(w[g]! - w[g - 1]!));
    }
    expect(maxNachbar).toBeLessThan(15);
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
