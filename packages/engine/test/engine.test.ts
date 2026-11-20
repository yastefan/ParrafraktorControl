import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Engine, MODES, PARAMETER_DEFAULTS, PATCH_DEFAULTS, ROTATE_STOP, readPositions, writeUniverses,
  selection, tiltDegrees, tiltValue, type Parameter,
} from "@parrafraktor/engine";

// One case of test/referenz.json (keys as written by scripts/referenz-erzeugen.mjs)
interface Case {
  parameter: Parameter;
  umlaufVon: number;
  umlauf: number[];
  tilt: number[];
}

// Reference values from the website simulation, generated with scripts/referenz-erzeugen.mjs
const cases: Case[] = JSON.parse(readFileSync(new URL("./referenz.json", import.meta.url), "utf8"));

describe("pattern engine", () => {
  it("computes the same angles as the simulation", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      const engine = new Engine();
      engine.referenceCycles = c.umlaufVon;
      engine.cycles.set(c.umlauf);
      // the simulation does not know the width: always 100 %
      const tilt = engine.all({ ...c.parameter, breite: 100 }).map((s) => s.tilt);
      tilt.forEach((w, g) => expect(w, `${c.parameter.modus} ${c.parameter.ordnung} mirror ${g}`).toBeCloseTo(c.tilt[g]!, 5));
    }
  });

  it("rotation turns via TiltRotate and leaves tilt on offset", () => {
    const p: Parameter = { ...PARAMETER_DEFAULTS, modus: "rotation", offset: 20, speedVon: 2, speedBis: 6 };
    const q = { ...p, phase: 0 };
    const e = new Engine();
    for (let n = 0; n < 40; n++) e.advance(q, 0.025);
    const s = e.all(q);
    expect(s[0]!.tilt).toBe(20);
    expect(s[0]!.upm).toBeCloseTo(2, 6);
    expect(s[35]!.upm).toBeCloseTo(6, 6);
    expect(e.mirror({ ...q, laeuft: false }, 0).upm).toBe(0);
  });

  it("the old German names still work (talk)", async () => {
    const old = await import("@parrafraktor/engine");
    const e = new Engine();
    e.weiter(PARAMETER_DEFAULTS, 1);
    expect(e.alle(PARAMETER_DEFAULTS)).toEqual(e.all(PARAMETER_DEFAULTS));
    expect(old.SPIEGEL_N).toBe(12);
    expect(old.PARAMETER_VORGABE).toBe(PARAMETER_DEFAULTS);
    const s = selection(PARAMETER_DEFAULTS, 5), a = old.auswahl(PARAMETER_DEFAULTS, 5);
    expect([a.platz, a.anzahl, a.anteil, a.versatz, a.lage, a.seite]).toEqual([s.slot, s.count, s.fraction, s.phaseOffset, s.place, s.side]);
  });

  describe("rotation", () => {
    const base: Parameter = { ...PARAMETER_DEFAULTS, modus: "rotation", phase: 0, speedVon: 2 };
    // Runs the engine and counts the angles from the speeds, like the preview
    const run = (p: Parameter, seconds: number, each?: (e: Engine, angles: number[]) => void) => {
      const e = new Engine();
      const angles = new Array<number>(36).fill(0);
      for (let n = 0; n < seconds * 40; n++) {
        e.advance(p, 0.025);
        e.all(p).forEach((s, g) => { angles[g]! += s.upm * 6 * 0.025; });
        each?.(e, angles);
      }
      return { e, angles };
    };
    const distance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

    it("phase: the mirrors stand offset and turn equally fast", () => {
      const { e, angles } = run({ ...base, phase: 360, elementFolge: "zusammen" }, 10);
      expect(distance(angles[0]!, angles[3]!)).toBeCloseTo(90, 0);   // 3 of 12 slots
      expect(e.mirror({ ...base, phase: 360, elementFolge: "zusammen" }, 7).upm).toBeCloseTo(2, 3);
    });

    it("width: turns in bursts, on average as fast as speed", () => {
      const p = { ...base, speedVon: 1, breite: 40 };
      let still = 0, total = 0;
      const { angles } = run(p, 60, (e) => { total++; if (Math.abs(e.mirror(p, 0).upm) < 1e-6) still++; });
      expect(still / total).toBeCloseTo(0.6, 1);
      expect(angles[0]).toBeCloseTo(360, 0);   // 1 rpm × 1 minute
    });

    it("width stays as large as TiltRotate max. allows and never turns back", () => {
      const p = { ...base, speedVon: 8, breite: 5 };
      run(p, 30, (e) => {
        const rpm = e.mirror(p, 0).upm;
        expect(rpm).toBeLessThanOrEqual(10);
        expect(rpm).toBeGreaterThanOrEqual(0);
      });
    });

    it("counter-motion: the left half turns the other way, the offset too", () => {
      const p = { ...base, gegenlauf: true, offset: 20 };
      const { e } = run(p, 2);
      expect(e.mirror(p, 0)).toMatchObject({ tilt: -20 });
      expect(e.mirror(p, 0).upm).toBeCloseTo(-2, 3);
      expect(e.mirror(p, 11)).toMatchObject({ tilt: 20 });
      expect(e.mirror(p, 11).upm).toBeCloseTo(2, 3);
    });

    it("fan: faster and faster along the ordering", () => {
      const p = { ...base, faecher: 100, elementFolge: "zusammen" as const };
      const { e } = run(p, 2);
      expect(e.mirror(p, 0).upm).toBeLessThan(e.mirror(p, 11).upm);
    });

    it("group: same slot in the group, same angle", () => {
      const { angles } = run({ ...base, phase: 360, group: 3, elementFolge: "zusammen" }, 10);
      expect(distance(angles[0]!, angles[3]!)).toBeCloseTo(0, 3);
      expect(distance(angles[0]!, angles[1]!)).toBeGreaterThan(30);
    });
  });

  it("after speed to it runs aligned again, so at phase 0 all mirrors stand alike", () => {
    const engine = new Engine();
    const p: Parameter = { ...PARAMETER_DEFAULTS, phase: 0, speedVon: 5, speedBis: 20 };
    for (let i = 0; i < 40 * 60; i++) engine.advance(p, 0.025);   // one minute spread
    const spread = engine.all(p).map((s) => s.tilt);
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(10);
    const off = { ...p, speedBis: 0 };
    let before = engine.all(off);
    for (let i = 0; i < 40 * 3; i++) {
      engine.advance(off, 0.025);
      const now = engine.all(off);
      // smooth: no mirror jumps more per tick than the movement itself gives
      now.forEach((s, g) => expect(Math.abs(s.tilt - before[g]!.tilt)).toBeLessThan(15));
      before = now;
    }
    const aligned = engine.all(off).map((s) => s.tilt);
    expect(Math.max(...aligned) - Math.min(...aligned)).toBeLessThan(0.01);
  });

  it("does not run on when paused", () => {
    const engine = new Engine();
    engine.advance({ ...PARAMETER_DEFAULTS, laeuft: false }, 10);
    expect(engine.referenceCycles).toBe(0);
    engine.advance(PARAMETER_DEFAULTS, 20);
    expect(engine.referenceCycles).toBeCloseTo(1);   // 3 BPM × 20 s
  });
});

describe("DMX", () => {
  it("maps tilt to 16 bit and clamps at ±180°", () => {
    expect(tiltValue(-180)).toBe(0);
    expect(tiltValue(180)).toBe(65535);
    expect(tiltValue(400)).toBe(65535);
    expect(tiltDegrees(tiltValue(33.3))).toBeCloseTo(33.3, 2);
  });

  it("writes the patch and reads it back", () => {
    const positions = Array.from({ length: 36 }, (_, g) => ({ tilt: g * 5 - 90, upm: 0 }));
    const universes = writeUniverses(positions, PATCH_DEFAULTS, 10);
    const dmx = universes.get(1)!;
    // element 2, mirror 0 from address 38: tilt coarse/fine, TiltRotate stopped
    const w = tiltValue(positions[12]!.tilt);
    expect([dmx[37], dmx[38], dmx[39]]).toEqual([w >> 8, w & 0xff, ROTATE_STOP]);
    // dimmer of every element on channel 37
    expect([dmx[36], dmx[73], dmx[110]]).toEqual([255, 255, 255]);
    const back = readPositions(universes, PATCH_DEFAULTS, 10)!;
    back.forEach((s, g) => expect(s.tilt).toBeCloseTo(positions[g]!.tilt, 2));
  });
});

describe("controls", () => {
  const angles = (p: Partial<Parameter>, cycles = 0.3) => {
    const e = new Engine();
    const par = { ...PARAMETER_DEFAULTS, ...p };
    e.setCycles(par, cycles, cycles);
    return e.all(par).map((s) => s.tilt);
  };

  it("elements center → out with counter-motion: the whole installation mirror-symmetric", () => {
    for (const ordnung of ["mitteAussen", "links", "zufall"] as const) {
      const w = angles({ ordnung, elementFolge: "mitteAussen", gegenlauf: true, offset: 25, phase: 270 });
      // first and third element are mirror images
      for (let i = 0; i < 12; i++) expect(w[i]).toBeCloseTo(-w[24 + 11 - i]!, 9);
    }
    // center → out inside too: then the middle one is symmetric as well, so everything
    const w = angles({ ordnung: "mitteAussen", elementFolge: "mitteAussen", gegenlauf: true, offset: 25 });
    for (let g = 0; g < 36; g++) expect(w[g]).toBeCloseTo(-w[35 - g]!, 9);
  });

  it("counter-motion also mirrors the offset (also per element)", () => {
    for (const p of [
      { ordnung: "mitteAussen", gegenlauf: true, offset: 30 },
      { ordnung: "links", gegenlauf: true, offset: -50, phase: 90 },
      { ordnung: "mitteAussen", gegenlauf: true, offsetGetrennt: true, offsetElemente: [10, 40, -20] },
    ] as Partial<Parameter>[]) {
      const w = angles(p);
      for (let k = 0; k < 3; k++) {
        for (let i = 0; i < 6; i++) {
          if (p.ordnung === "mitteAussen") expect(w[k * 12 + i]).toBeCloseTo(-w[k * 12 + 11 - i]!, 9);
        }
      }
    }
    // without deflection: left −offset, right +offset
    expect(angles({ gegenlauf: true, offset: 30, amplitude: 0 }).slice(0, 12)).toEqual([...Array(6).fill(-30), ...Array(6).fill(30)]);
  });

  it("center → out with counter-motion: both halves of every element mirrored", () => {
    const w = angles({ ordnung: "mitteAussen", gegenlauf: true, phase: 180 });
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 6; i++) expect(w[k * 12 + i]).toBeCloseTo(-w[k * 12 + 11 - i]!, 9);
    }
  });

  it("front → back counts on across all 36, back → front the other way", () => {
    const forth = angles({ phase: 360 });
    const back = angles({ phase: 360, ordnung: "rechts", elementFolge: "hintenVorne" });
    // at phase 360 across 36 mirrors: mirror g back = mirror 35 - g forth
    for (let g = 0; g < 36; g++) expect(back[g]).toBeCloseTo(forth[35 - g]!, 9);
  });

  it("together: all elements alike", () => {
    const w = angles({ ordnung: "zufall", elementFolge: "zusammen", phase: 360 });
    for (let i = 0; i < 12; i++) expect(w[i]).toBeCloseTo(w[24 + i]!, 9);
  });

  it("fan 100 % from the center: full amplitude outside, hardly any inside", () => {
    const w = angles({ ordnung: "mitteAussen", phase: 0, faecher: 100 }, 0.25);   // sine at its maximum
    expect(Math.abs(w[0]!)).toBeCloseTo(40 * (5.5 / 6), 6);
    expect(Math.abs(w[5]!)).toBeCloseTo(40 * (0.5 / 6), 6);
  });

  it("offset per element", () => {
    const w = angles({ amplitude: 0, offsetGetrennt: true, offsetElemente: [-30, 0, 45] });
    expect([w[0], w[12], w[35]]).toEqual([-30, 0, 45]);
  });

  it("pendulum wave drifts apart and comes together after the return time", () => {
    // 2 swings of the first mirror at 6 BPM: aligned again after 20 s
    const p: Parameter = { ...PARAMETER_DEFAULTS, modus: "pendelwelle", schwuenge: 2, speedVon: 6 };
    const e = new Engine();
    for (let i = 0; i < 200; i++) e.advance(p, 0.025);   // 5 s: a quarter
    const middle = e.all(p).map((s) => s.tilt);
    expect(Math.max(...middle) - Math.min(...middle)).toBeGreaterThan(40);
    for (let i = 0; i < 600; i++) e.advance(p, 0.025);   // 20 s: the whole return
    const end = e.all(p).map((s) => s.tilt);
    expect(Math.max(...end) - Math.min(...end)).toBeLessThan(0.01);
  });

  it("pendulum wave: double speed shows the same image in half the time", () => {
    const image = (speedVon: number, steps: number) => {
      const p: Parameter = { ...PARAMETER_DEFAULTS, modus: "pendelwelle", speedVon };
      const e = new Engine();
      for (let i = 0; i < steps; i++) e.advance(p, 0.025);
      return e.all(p).map((s) => s.tilt);
    };
    const slow = image(5, 400), fast = image(10, 200);
    slow.forEach((w, g) => expect(fast[g]).toBeCloseTo(w, 6));
  });

  it("width: narrow wave, the other mirrors stand on offset", () => {
    // 10 %: at phase 360° across 36 mirrors at most about 4 move at once
    for (const u of [0.1, 0.37, 0.8]) {
      const w = angles({ breite: 10, offset: 20 }, u);
      expect(w.filter((x) => Math.abs(x - 20) > 1e-9).length).toBeLessThanOrEqual(4);
    }
    // 100 % is the usual sine
    expect(angles({ breite: 100 })).toEqual(angles({}));
  });

  describe("aperture", () => {
    // Light at a point: all three elements open. Mirror of element k from the projection (like the preview)
    const open = (w: number[], x: number, y: number, rotation = [0, 45, 90]) =>
      Math.min(...rotation.map((d, k) => {
        const a = (d * Math.PI) / 180;
        const u = x * Math.cos(a) + y * Math.sin(a);
        const i = Math.min(11, Math.max(0, Math.floor((u + 0.9) / 0.15)));
        return w[k * 12 + i]!;
      }));
    const base: Partial<Parameter> = { modus: "oeffnung", wabern: 0, nachlauf: 0, kante: 0, groesse: 15, weite: 40 };

    it("circle: the hole lies on the path, opposite it is closed", () => {
      for (const u of [0, 0.125, 0.3, 0.77]) {
        const w = angles({ ...base, bahn: "kreis" }, u);
        const t = 2 * Math.PI * u, x = 0.4 * Math.cos(t), y = 0.4 * Math.sin(t);
        expect(open(w, x, y)).toBeGreaterThan(60);
        expect(open(w, -x, -y)).toBeLessThan(1);
      }
    });

    it("iris: opens and stays around the center", () => {
      const closed = angles({ ...base, bahn: "iris", groesse: 5 }, 0);
      const opened = angles({ ...base, bahn: "iris", groesse: 5 }, 0.5);
      const count = (w: number[]) => w.filter((x) => x > 45).length;
      expect(count(opened)).toBeGreaterThan(count(closed));
      expect(open(opened, 0, 0)).toBeGreaterThan(60);
    });

    it("follows the rotation of the elements", () => {
      const e = new Engine();
      e.elementRotation = [0, 90, 45];
      const p = { ...PARAMETER_DEFAULTS, ...base, bahn: "kreis" as const };
      e.setCycles(p, 0.1, 0.1);
      const t = 2 * Math.PI * 0.1;
      expect(open(e.all(p).map((s) => s.tilt), 0.4 * Math.cos(t), 0.4 * Math.sin(t), [0, 90, 45])).toBeGreaterThan(60);
    });

    it("stays between closed and edge-on and does not jerk", () => {
      const e = new Engine();
      const p: Parameter = { ...PARAMETER_DEFAULTS, modus: "oeffnung", speedVon: 10, wabern: 100, nachlauf: 100, kante: 30 };
      let before = e.all(p).map((s) => s.tilt), maxStep = 0;
      for (let n = 0; n < 40 * 60; n++) {
        e.advance(p, 0.025);
        const now = e.all(p).map((s) => s.tilt);
        now.forEach((w, g) => {
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(90);
          maxStep = Math.max(maxStep, Math.abs(w - before[g]!));
        });
        before = now;
      }
      expect(maxStep).toBeLessThan(15);   // per tick (25 ms) at the highest speed
    });
  });

  it("aperture with pulse: size swings twice per cycle and is the same again after one cycle", () => {
    const p: Parameter = { ...PARAMETER_DEFAULTS, modus: "oeffnung", bahn: "kreis", wabern: 0, nachlauf: 0, kante: 0, groesse: 30, weite: 35, puls: 50, speedVon: 6 };
    const openCount = (e: Engine) => e.all(p).filter((s) => s.tilt > 45).length;
    const e = new Engine();
    const start = e.all(p).map((s) => s.tilt);
    const counts: number[] = [];
    for (let i = 0; i < 1000; i++) { e.advance(p, 0.01); counts.push(openCount(e)); }   // 10 s = one cycle at 6 BPM
    e.all(p).forEach((s, g) => expect(s.tilt).toBeCloseTo(start[g]!, 3));
    // sometimes larger, sometimes smaller: clearly different numbers of open mirrors
    expect(Math.max(...counts) - Math.min(...counts)).toBeGreaterThan(4);
    // without pulse the number stays about the same
    const q = { ...p, puls: 0 }, f = new Engine(), without: number[] = [];
    for (let i = 0; i < 1000; i++) { f.advance(q, 0.01); without.push(f.all(q).filter((s) => s.tilt > 45).length); }
    expect(Math.max(...without) - Math.min(...without)).toBeLessThan(Math.max(...counts) - Math.min(...counts));
  });

  it("element phase: phase only within the element, elements offset by rank; off = phase across all", () => {
    const degrees = (p: Parameter, g: number) => Math.round(selection(p, g).phaseOffset * 360 * 1000) / 1000;
    const p: Parameter = { ...PARAMETER_DEFAULTS, modus: "sinus", phase: 120, ordnung: "links", elementFolge: "vorneHinten", group: 0, elementPhase: 15 };
    // within the element: 120° across 12 mirrors, the same in every element
    expect(degrees(p, 11) - degrees(p, 0)).toBeCloseTo(110, 6);
    // 15° from element to element
    expect(degrees(p, 12) - degrees(p, 0)).toBeCloseTo(15, 6);
    expect(degrees(p, 24) - degrees(p, 0)).toBeCloseTo(30, 6);
    // center → out: both outer elements equally far behind the middle one
    const m: Parameter = { ...p, elementFolge: "mitteAussen", ordnung: "mitteAussen", gegenlauf: true };
    expect(degrees(m, 0) - degrees(m, 12 + 11)).toBeCloseTo(15, 6);   // the first element is mirrored
    expect(degrees(m, 24) - degrees(m, 12)).toBeCloseTo(15, 6);
    // together: no rank, no offset
    const z: Parameter = { ...p, elementFolge: "zusammen" };
    expect(degrees(z, 12)).toBe(degrees(z, 0));
    // off: as before, phase runs across all 36
    const a: Parameter = { ...p, elementPhase: 0 };
    expect(degrees(a, 12) - degrees(a, 0)).toBeCloseTo(40, 6);
  });

  it("speed per element: elements equally fast within, staggered, congruent again after (ranks − 1) / (to − from) min", () => {
    const p: Parameter = {
      ...PARAMETER_DEFAULTS, modus: "sinus", amplitude: 90, phase: 90, speedVon: 3, speedBis: 4,
      elementFolge: "vorneHinten", speedJeElement: true,
    };
    const e = new Engine();
    const start = e.all(p).map((s) => s.tilt);
    for (let i = 0; i < 12000; i++) e.advance(p, 0.01);   // 120 s = 2 / (4 − 3) min
    const end = e.all(p).map((s) => s.tilt);
    // phase relation of all mirrors to each other as at the start
    end.forEach((w, g) => expect(w - end[0]!).toBeCloseTo(start[g]! - start[0]!, 6));
    // without the switch (speed across the mirrors) the relation is different after 2 min
    const without = { ...p, speedJeElement: false };
    const f = new Engine();
    for (let i = 0; i < 12000; i++) f.advance(without, 0.01);
    const w = f.all(without).map((s) => s.tilt);
    expect(Math.max(...w.map((x, g) => Math.abs(x - w[0]! - (start[g]! - start[0]!))))).toBeGreaterThan(5);
  });

  it("wind stays within the amplitude and neighbours are similar", () => {
    const e = new Engine();
    const p: Parameter = { ...PARAMETER_DEFAULTS, modus: "wind", wellenlaenge: 12, phase: 0 };
    let maxNeighbour = 0;
    for (let i = 0; i < 2000; i++) {
      e.advance(p, 0.05);
      const w = e.all(p).map((s) => s.tilt);
      w.forEach((x) => expect(Math.abs(x)).toBeLessThanOrEqual(40));
      for (let g = 1; g < 12; g++) maxNeighbour = Math.max(maxNeighbour, Math.abs(w[g]! - w[g - 1]!));
    }
    expect(maxNeighbour).toBeLessThan(15);
  });
});

describe("swarm and flash", () => {
  // Order parameter (Kuramoto) of the cycles: 1 = all in step (you then see the alignment or the wave
  // of the phase), around 0 = scattered
  const order = (e: Engine) => {
    let x = 0, y = 0;
    for (let g = 0; g < 36; g++) {
      const w = 2 * Math.PI * e.cycles[g]!;
      x += Math.cos(w); y += Math.sin(w);
    }
    return Math.hypot(x, y) / 36;
  };
  const run = (p: Parameter, s: number) => {
    const e = new Engine();
    for (let i = 0; i < s * 40; i++) e.advance(p, 0.025);
    return order(e);
  };
  const base = (modus: "schwarm" | "gluehwuermchen"): Parameter =>
    ({ ...PARAMETER_DEFAULTS, modus, speedVon: 3.5, speedBis: 4.5, rauschen: 0, reichweite: 0 });

  it("start scattered", () => {
    for (const modus of ["schwarm", "gluehwuermchen"] as const) expect(run({ ...base(modus), kopplung: 0 }, 2), modus).toBeLessThan(0.4);
  });

  it("swarm: without coupling they stay scattered, with coupling they lock in, also into the wave of the phase", () => {
    expect(run({ ...base("schwarm"), kopplung: 0 }, 60)).toBeLessThan(0.4);
    expect(run({ ...base("schwarm"), kopplung: 60 }, 60)).toBeGreaterThan(0.95);
    expect(run({ ...base("schwarm"), kopplung: 60, phase: 360 }, 60)).toBeGreaterThan(0.95);
  });

  it("swarm with phase: the wave of the phase stays visible", () => {
    const p: Parameter = { ...base("schwarm"), kopplung: 60, phase: 360 };
    const e = new Engine();
    for (let i = 0; i < 60 * 40; i++) e.advance(p, 0.025);
    const w = e.all(p).map((s) => s.tilt);
    // one whole wave across the 36: neighbours close together, but not all alike
    expect(Math.max(...w) - Math.min(...w)).toBeGreaterThan(p.amplitude);
    for (let g = 0; g < 35; g++) expect(Math.abs(w[g + 1]! - w[g]!)).toBeLessThan(p.amplitude * 0.4);
  });

  it("no mirror runs backwards, stands or races", () => {
    for (const modus of ["schwarm", "gluehwuermchen"] as const) {
      const p: Parameter = { ...base(modus), kopplung: 100, rauschen: 100, breite: 30 };
      const e = new Engine();
      e.advance(p, 0);
      // measured over 0.25 s each (the engine computes in fixed steps of 5 ms)
      let min = Infinity, max = 0;
      for (let i = 0; i < 120 * 4; i++) {
        const before = Float64Array.from(e.cycles);
        for (let k = 0; k < 10; k++) e.advance(p, 0.025);
        e.cycles.forEach((u, g) => {
          const tempo = ((u - before[g]!) / 0.25) * 60;   // BPM
          min = Math.min(min, tempo); max = Math.max(max, tempo);
        });
      }
      expect(min, modus).toBeGreaterThanOrEqual(0.5 * 3.5 * 0.97);
      // flash mirrors jump while resting (invisible), so only the swarm is limited upwards
      if (modus === "schwarm") expect(max, modus).toBeLessThanOrEqual(1.5 * 4.5 * 1.03);
    }
  });

  it("swarm: much noise breaks the alignment", () => {
    expect(run({ ...base("schwarm"), kopplung: 30, rauschen: 100 }, 120)).toBeLessThan(0.7);
  });

  it("preview and server run alike: nothing jumps when syncing", () => {
    // Server at 40 Hz, preview at its own frame rate and started later; every second it takes over
    // cycles, tempo and kicks like client/src/vorschau.ts (large deviations at once, small ones smoothly)
    const follow = (l: number, s: number) => (Math.abs(s - l) > 0.05 ? s : l + (s - l) * 0.2);
    for (const modus of ["schwarm", "gluehwuermchen"] as const) {
      const p: Parameter = { ...base(modus), kopplung: 50, rauschen: 40, phase: 360, breite: modus === "gluehwuermchen" ? 30 : 100 };
      const server = new Engine(), preview = new Engine();
      for (let i = 0; i < 300; i++) server.advance(p, 0.025);
      let ts = 0, tv = 0, next = 1, step = 0;
      let before = preview.all(p).map((s) => s.tilt);
      for (let n = 0; tv < 60; n++) {
        const dt = 0.012 + 0.008 * ((n * 7) % 11) / 10;
        tv += dt;
        preview.advance(p, dt);
        while (ts < tv) { server.advance(p, 0.025); ts += 0.025; }
        if (tv >= next) {
          next++;
          preview.referenceCycles = follow(preview.referenceCycles, server.referenceCycles);
          server.cycles.forEach((u, g) => { preview.cycles[g] = follow(preview.cycles[g]!, u); });
          preview.tempo.set(server.tempo);
          preview.kick.set(server.kick);
        }
        const now = preview.all(p).map((s) => s.tilt);
        if (tv > 1.5) now.forEach((w, g) => { step = Math.max(step, Math.abs(w - before[g]!)); });
        before = now;
      }
      expect(step, modus).toBeLessThan(3);   // a jump would be in double digits
    }
  });

  it("flash: the kicks pull them into step", () => {
    expect(run({ ...base("gluehwuermchen"), kopplung: 0 }, 120)).toBeLessThan(0.4);
    expect(run({ ...base("gluehwuermchen"), kopplung: 60 }, 120)).toBeGreaterThan(0.8);
  });

  it("flash: a flash lasts at most 40 % of the cycle", () => {
    const p: Parameter = { ...base("gluehwuermchen"), breite: 100 };
    const e = new Engine();
    e.advance(p, 0);
    e.all(p).forEach((s, g) => {
      const x = e.cycles[g]! - selection(p, g).phaseOffset;
      if (x - Math.floor(x) > 0.4) expect(s.tilt).toBeCloseTo(p.offset, 9);
    });
  });

  it("flash: deflection to one side only, on offset outside the width", () => {
    const p: Parameter = { ...base("gluehwuermchen"), offset: 10, amplitude: 30, breite: 30 };
    const e = new Engine();
    for (let i = 0; i < 400; i++) {
      e.advance(p, 0.025);
      e.all(p).forEach((s, g) => {
        expect(s.tilt).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(s.tilt).toBeLessThanOrEqual(40 + 1e-9);
        const x = e.cycles[g]! - selection(p, g).phaseOffset;
        if (x - Math.floor(x) > 0.3) expect(s.tilt).toBeCloseTo(10, 9);
      });
    }
  });
});

describe("smooth shapes", () => {
  // Largest change of the angle per small time step, relative to the amplitude:
  // without jumps it stays small, a jump (e.g. the old square wave) would be ~2
  it("never jump", () => {
    for (const modus of MODES.filter((m) => m !== "rotation" && m !== "oeffnung")) {
      const p: Parameter = { ...PARAMETER_DEFAULTS, modus, amplitude: 1, speedVon: 60, phase: 360 };
      const e = new Engine();
      // selecting the shape: swarm and flash scatter (cross-faded in control and preview)
      e.advance(p, 0);
      let before = e.all(p);
      let maxStep = 0;
      for (let i = 0; i < 4000; i++) {
        e.advance(p, 0.001);
        const now = e.all(p);
        now.forEach((s, g) => { maxStep = Math.max(maxStep, Math.abs(s.tilt - before[g]!.tilt)); });
        before = now;
      }
      expect(maxStep, modus).toBeLessThan(0.05);
    }
  });
});
