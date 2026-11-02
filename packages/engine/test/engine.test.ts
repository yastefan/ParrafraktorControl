import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Engine, PARAMETER_VORGABE, PATCH_VORGABE, ROTATE_STOP, leseStellungen, schreibeUniversen,
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
      engine.umlaufVon = f.umlaufVon;
      engine.umlaufBis = f.umlaufBis;
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
