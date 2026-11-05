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
      // die Simulation kennt die Breite nicht: immer 100 %
      const tilt = engine.alle({ ...f.parameter, breite: 100 }).map((s) => s.tilt);
      tilt.forEach((w, g) => expect(w, `${f.parameter.modus} ${f.parameter.ordnung} Spiegel ${g}`).toBeCloseTo(f.tilt[g]!, 5));
    }
  });

  it("dreht bei Rotation über TiltRotate und lässt Tilt auf Offset", () => {
    const p: Parameter = { ...PARAMETER_VORGABE, modus: "rotation", offset: 20, speedVon: 2, speedBis: 6 };
    const q = { ...p, phase: 0 };
    const e = new Engine();
    for (let n = 0; n < 40; n++) e.weiter(q, 0.025);
    const s = e.alle(q);
    expect(s[0]!.tilt).toBe(20);
    expect(s[0]!.upm).toBeCloseTo(2, 6);
    expect(s[35]!.upm).toBeCloseTo(6, 6);
    expect(e.spiegel({ ...q, laeuft: false }, 0).upm).toBe(0);
  });

  describe("Rotation", () => {
    const basis: Parameter = { ...PARAMETER_VORGABE, modus: "rotation", phase: 0, speedVon: 2 };
    // Lässt die Engine laufen und zählt wie die Vorschau die Winkel aus den Drehzahlen mit
    const lauf = (p: Parameter, sekunden: number, je?: (e: Engine, winkel: number[]) => void) => {
      const e = new Engine();
      const winkel = new Array<number>(36).fill(0);
      for (let n = 0; n < sekunden * 40; n++) {
        e.weiter(p, 0.025);
        e.alle(p).forEach((s, g) => { winkel[g]! += s.upm * 6 * 0.025; });
        je?.(e, winkel);
      }
      return { e, winkel };
    };
    const abstand = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

    it("Phase: die Spiegel stehen versetzt und drehen gleich schnell", () => {
      const { e, winkel } = lauf({ ...basis, phase: 360, elementFolge: "zusammen" }, 10);
      expect(abstand(winkel[0]!, winkel[3]!)).toBeCloseTo(90, 0);   // 3 von 12 Plätzen
      expect(e.spiegel({ ...basis, phase: 360, elementFolge: "zusammen" }, 7).upm).toBeCloseTo(2, 3);
    });

    it("Breite: dreht in Schüben, im Schnitt so schnell wie Speed", () => {
      const p = { ...basis, speedVon: 1, breite: 40 };
      let steht = 0, gesamt = 0;
      const { winkel } = lauf(p, 60, (e) => { gesamt++; if (Math.abs(e.spiegel(p, 0).upm) < 1e-6) steht++; });
      expect(steht / gesamt).toBeCloseTo(0.6, 1);
      expect(winkel[0]).toBeCloseTo(360, 0);   // 1 U/min × 1 Minute
    });

    it("Breite bleibt so groß, wie TiltRotate max. es zulässt, und dreht nie zurück", () => {
      const p = { ...basis, speedVon: 8, breite: 5 };
      lauf(p, 30, (e) => {
        const upm = e.spiegel(p, 0).upm;
        expect(upm).toBeLessThanOrEqual(10);
        expect(upm).toBeGreaterThanOrEqual(0);
      });
    });

    it("Gegenlauf: linke Hälfte dreht andersherum, auch der Offset", () => {
      const p = { ...basis, gegenlauf: true, offset: 20 };
      const { e } = lauf(p, 2);
      expect(e.spiegel(p, 0)).toMatchObject({ tilt: -20 });
      expect(e.spiegel(p, 0).upm).toBeCloseTo(-2, 3);
      expect(e.spiegel(p, 11)).toMatchObject({ tilt: 20 });
      expect(e.spiegel(p, 11).upm).toBeCloseTo(2, 3);
    });

    it("Fächer: entlang der Ordnung immer schneller", () => {
      const p = { ...basis, faecher: 100, elementFolge: "zusammen" as const };
      const { e } = lauf(p, 2);
      expect(e.spiegel(p, 0).upm).toBeLessThan(e.spiegel(p, 11).upm);
    });

    it("Group: gleicher Platz in der Gruppe, gleicher Winkel", () => {
      const { winkel } = lauf({ ...basis, phase: 360, group: 3, elementFolge: "zusammen" }, 10);
      expect(abstand(winkel[0]!, winkel[3]!)).toBeCloseTo(0, 3);
      expect(abstand(winkel[0]!, winkel[1]!)).toBeGreaterThan(30);
    });
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

  it("Elemente Mitte → außen mit Gegenlauf: die ganze Installation spiegelbildlich", () => {
    for (const ordnung of ["mitteAussen", "links", "zufall"] as const) {
      const w = winkel({ ordnung, elementFolge: "mitteAussen", gegenlauf: true, offset: 25, phase: 270 });
      // erstes und drittes Element sind Spiegelbilder
      for (let i = 0; i < 12; i++) expect(w[i]).toBeCloseTo(-w[24 + 11 - i]!, 9);
    }
    // Mitte → außen innen: dann ist auch das mittlere symmetrisch, also alles
    const w = winkel({ ordnung: "mitteAussen", elementFolge: "mitteAussen", gegenlauf: true, offset: 25 });
    for (let g = 0; g < 36; g++) expect(w[g]).toBeCloseTo(-w[35 - g]!, 9);
  });

  it("Gegenlauf spiegelt auch den Offset (auch je Element)", () => {
    for (const p of [
      { ordnung: "mitteAussen", gegenlauf: true, offset: 30 },
      { ordnung: "links", gegenlauf: true, offset: -50, phase: 90 },
      { ordnung: "mitteAussen", gegenlauf: true, offsetGetrennt: true, offsetElemente: [10, 40, -20] },
    ] as Partial<Parameter>[]) {
      const w = winkel(p);
      for (let k = 0; k < 3; k++) {
        for (let i = 0; i < 6; i++) {
          if (p.ordnung === "mitteAussen") expect(w[k * 12 + i]).toBeCloseTo(-w[k * 12 + 11 - i]!, 9);
        }
      }
    }
    // ohne Ausschlag: links −Offset, rechts +Offset
    expect(winkel({ gegenlauf: true, offset: 30, amplitude: 0 }).slice(0, 12)).toEqual([...Array(6).fill(-30), ...Array(6).fill(30)]);
  });

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

  it("Breite: schmale Welle, die übrigen Spiegel stehen auf Offset", () => {
    // 10 %: bei Phase 360° über 36 Spiegel bewegen sich höchstens etwa 4 zugleich
    for (const u of [0.1, 0.37, 0.8]) {
      const w = winkel({ breite: 10, offset: 20 }, u);
      expect(w.filter((x) => Math.abs(x - 20) > 1e-9).length).toBeLessThanOrEqual(4);
    }
    // 100 % ist der gewohnte Sinus
    expect(winkel({ breite: 100 })).toEqual(winkel({}));
  });

  describe("Öffnung", () => {
    // Licht an einem Punkt: alle drei Elemente offen. Mirror k, Lage aus der Projektion (wie die Vorschau)
    const offen = (w: number[], x: number, y: number, drehung = [0, 45, 90]) =>
      Math.min(...drehung.map((d, k) => {
        const a = (d * Math.PI) / 180;
        const u = x * Math.cos(a) + y * Math.sin(a);
        const i = Math.min(11, Math.max(0, Math.floor((u + 0.9) / 0.15)));
        return w[k * 12 + i]!;
      }));
    const basis: Partial<Parameter> = { modus: "oeffnung", wabern: 0, nachlauf: 0, kante: 0, groesse: 15, weite: 40 };

    it("Kreis: das Loch liegt auf der Bahn, gegenüber ist es zu", () => {
      for (const u of [0, 0.125, 0.3, 0.77]) {
        const w = winkel({ ...basis, bahn: "kreis" }, u);
        const t = 2 * Math.PI * u, x = 0.4 * Math.cos(t), y = 0.4 * Math.sin(t);
        expect(offen(w, x, y)).toBeGreaterThan(60);
        expect(offen(w, -x, -y)).toBeLessThan(1);
      }
    });

    it("Iris: geht auf und bleibt um die Mitte", () => {
      const zu = winkel({ ...basis, bahn: "iris", groesse: 5 }, 0);
      const auf = winkel({ ...basis, bahn: "iris", groesse: 5 }, 0.5);
      const zahl = (w: number[]) => w.filter((x) => x > 45).length;
      expect(zahl(auf)).toBeGreaterThan(zahl(zu));
      expect(offen(auf, 0, 0)).toBeGreaterThan(60);
    });

    it("folgt der Drehung der Elemente", () => {
      const e = new Engine();
      e.drehung = [0, 90, 45];
      const p = { ...PARAMETER_VORGABE, ...basis, bahn: "kreis" as const };
      e.setzeUmlauf(p, 0.1, 0.1);
      const t = 2 * Math.PI * 0.1;
      expect(offen(e.alle(p).map((s) => s.tilt), 0.4 * Math.cos(t), 0.4 * Math.sin(t), [0, 90, 45])).toBeGreaterThan(60);
    });

    it("bleibt zwischen zu und hochkant und ruckt nicht", () => {
      const e = new Engine();
      const p: Parameter = { ...PARAMETER_VORGABE, modus: "oeffnung", speedVon: 10, wabern: 100, nachlauf: 100, kante: 30 };
      let vorher = e.alle(p).map((s) => s.tilt), maxSchritt = 0;
      for (let n = 0; n < 40 * 60; n++) {
        e.weiter(p, 0.025);
        const jetzt = e.alle(p).map((s) => s.tilt);
        jetzt.forEach((w, g) => {
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(90);
          maxSchritt = Math.max(maxSchritt, Math.abs(w - vorher[g]!));
        });
        vorher = jetzt;
      }
      expect(maxSchritt).toBeLessThan(15);   // je Takt (25 ms) bei höchstem Speed
    });
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
    for (const modus of MODI.filter((m) => m !== "rotation" && m !== "oeffnung")) {
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
