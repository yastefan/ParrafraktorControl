import { describe, expect, it } from "vitest";
import { PARAMETER_DEFAULTS } from "@parrafraktor/engine";
import { SETTINGS_DEFAULTS, parseClientMessage, checkPresets } from "@parrafraktor/protocol";
import { Controller } from "../src/controller.js";

const fresh = (ueberblendungS = 2) =>
  new Controller({ ...PARAMETER_DEFAULTS }, { ...structuredClone(SETTINGS_DEFAULTS), ueberblendungS }, checkPresets([]));

describe("Auto", () => {
  const withPresets = (...nr: number[]) => {
    const s = fresh();
    nr.forEach((n, i) => { s.set({ amplitude: 10 + i }); s.storePreset(n); });
    return s;
  };

  it("plays the selected presets one after another, with its own cross-fade", () => {
    const s = withPresets(0, 2, 5);
    s.configureAuto({ auswahl: [true, false, true, false, false, true], halteS: 10, blendeS: 5 });
    s.setAuto(true);
    expect(s.autoOn).toBe(true);
    expect(s.lastPreset).toBe(0);    // after 5 it starts from the beginning
    expect(s.fadeDurationS).toBe(5);
    s.autoAdvance(14.9);
    expect(s.lastPreset).toBe(0);    // fade and hold together
    s.autoAdvance(0.2);
    expect(s.lastPreset).toBe(2);
    s.autoAdvance(15.1);
    expect(s.lastPreset).toBe(5);
    s.autoAdvance(15.1);
    expect(s.lastPreset).toBe(0);
  });

  it("skips unselected and empty slots", () => {
    const s = withPresets(0, 1, 2);
    s.configureAuto({ auswahl: [true, false, true], halteS: 5, blendeS: 0 });
    s.setAuto(true);
    expect(s.lastPreset).toBe(0);
    s.autoAdvance(5.1);
    expect(s.lastPreset).toBe(2);
    s.autoAdvance(5.1);
    expect(s.lastPreset).toBe(0);
  });

  it("does not start with fewer than two presets", () => {
    const s = withPresets(3);
    s.setAuto(true);
    expect(s.autoOn).toBe(false);
  });

  it("ends as soon as someone changes the look or recalls a preset", () => {
    const s = withPresets(0, 1);
    s.setAuto(true);
    s.set({ amplitude: 55 });
    expect(s.autoOn).toBe(false);
    s.setAuto(true);
    s.recallPreset(1);
    expect(s.autoOn).toBe(false);
    expect(s.fadeDurationS).toBe(2);     // recall by hand: cross-fade from the settings
  });

  it("waits during pause, continues afterwards and does not touch the output", () => {
    const s = withPresets(0, 1);
    s.configureAuto({ halteS: 5, blendeS: 0 });
    s.setAuto(true);
    s.togglePause();
    expect(s.autoOn).toBe(true);
    const nr = s.lastPreset;
    s.autoAdvance(100);
    expect(s.lastPreset).toBe(nr);
    s.togglePause();
    s.autoAdvance(5.1);
    expect(s.lastPreset).not.toBe(nr);
    expect(s.takeover.soll).toBe(false);
  });

  it("ends when deleting or deselecting leaves too few, and limits the times", () => {
    const s = withPresets(0, 1, 2);
    s.setAuto(true);
    s.deletePreset(2);
    expect(s.autoOn).toBe(true);
    s.deletePreset(1);
    expect(s.autoOn).toBe(false);
    s.configureAuto({ halteS: 9999, blendeS: -3 });
    expect(s.auto).toMatchObject({ halteS: 300, blendeS: 0 });
    expect(parseClientMessage('{"typ":"auto","an":true}')).toEqual({ typ: "auto", an: true });
    expect(parseClientMessage('{"typ":"auto","an":1}')).toBeNull();
  });
});

describe("Auto on the Stream Deck", () => {
  it("the key starts and stops, is dimmed without enough presets and shows the look", async () => {
    const { StreamDeckModule } = await import("../src/input/streamdeck/index.js");
    const { MAIN } = await import("../src/input/streamdeck/layout.js");
    const s = fresh();
    const m = new StreamDeckModule(s) as unknown as {
      keyContent(k: number): { title: string; below?: string; muted?: boolean };
      action(k: number): { tap?: () => void } | undefined;
    };
    expect(m.keyContent(MAIN.auto).muted).toBe(true);
    s.storePreset(0);
    s.set({ amplitude: 50 });
    s.storePreset(1);
    s.renamePreset(1, "Two");
    expect(m.keyContent(MAIN.auto)).toMatchObject({ title: "Auto", below: "off" });
    m.action(MAIN.auto)!.tap!();
    expect(s.autoOn).toBe(true);
    s.recallPreset(1);
    s.setAuto(true);
    expect(m.keyContent(MAIN.auto).title).toBe("AUTO");
    m.action(MAIN.auto)!.tap!();
    expect(s.autoOn).toBe(false);
  });
});

describe("Presets", () => {
  it("stores the look and recalls it with cross-fade", () => {
    const s = fresh();
    s.set({ amplitude: 77, phase: 90 });
    s.storePreset(3);
    expect(s.presets[3]).toMatchObject({ name: "Sine", look: { amplitude: 77, phase: 90 } });
    expect(s.presets[3]!.look).not.toHaveProperty("laeuft");

    s.selectPattern("wind");
    expect(s.lastPreset).toBeNull();
    let fades = 0;
    s.on("fade", () => fades++);
    s.recallPreset(3);
    expect(s.parameter).toMatchObject({ modus: "sinus", amplitude: 77, phase: 90 });
    expect(s.lastPreset).toBe(3);
    expect(fades).toBe(1);
    expect(s.fade).toEqual({ id: 2, anteil: 0 });   // 1 was the change to wind
  });

  it("also cross-fades when the shape changes", () => {
    const s = fresh();
    s.selectPattern("wind");
    expect(s.fade).toEqual({ id: 1, anteil: 0 });
    s.selectPattern("wind");   // same shape: no new cross-fade
    expect(s.fade?.id).toBe(1);
  });

  it("jumps without fade time and leaves pause untouched", () => {
    const s = fresh(0);
    s.storePreset(0);
    s.togglePause();
    s.recallPreset(0);
    expect(s.fade).toBeNull();
    expect(s.parameter.laeuft).toBe(false);
    expect(s.lastPreset).toBe(0);   // pause does not count as a change of the look
  });

  it("renames, keeps the name when overwriting, and deletes", () => {
    const s = fresh();
    s.storePreset(1);
    s.renamePreset(1, "Wave");
    s.set({ offset: 10 });
    s.storePreset(1);
    expect(s.presets[1]).toMatchObject({ name: "Wave", look: { offset: 10 } });
    s.deletePreset(1);
    expect(s.presets[1]).toBeNull();
    expect(s.lastPreset).toBeNull();
  });

  it("checks preset messages", () => {
    expect(parseClientMessage('{"typ":"preset","aktion":"abrufen","nr":2}')).toEqual({ typ: "preset", aktion: "abrufen", nr: 2 });
    expect(parseClientMessage('{"typ":"preset","aktion":"abrufen","nr":12}')).toBeNull();
    expect(parseClientMessage('{"typ":"preset","aktion":"umbenennen","nr":0,"name":"  "}')).toBeNull();
  });
});

describe("impulses", () => {
  const withClock = () => {
    let t = 0;
    const s = new Controller(
      { ...PARAMETER_DEFAULTS }, structuredClone(SETTINGS_DEFAULTS), checkPresets([]), undefined, () => t,
    );
    return { s, advance: (dt: number) => { t += dt; } };
  };

  it("the strip starts the chosen kind from the origin and clears up after the release", () => {
    const { s, advance } = withClock();
    s.setImpulse({ art: "loch" });
    s.tapImpulse(1.7);
    expect(s.impulses()).toEqual([{ id: 1, art: "loch", alterS: 0, ursprung: 1, breite: 0, wischt: false }]);
    s.setImpulse({ breite: 4 });
    s.tapImpulse(0.5);
    s.tapImpulse(0, true);   // swiped: through the whole element
    expect(s.impulses().map((i) => i.breite)).toEqual([0, 4, 0]);
    const h = s.impulse.huelle;
    advance(h.attackS + h.sustainS + h.releaseS + 0.01);
    s.pruneImpulses();
    expect(s.impulses()).toEqual([]);
  });

  it("checks envelope and messages", () => {
    const { s } = withClock();
    s.setImpulse({ huelle: { attackS: 99, staerke: "x" }, elementFolge: "vorneHinten" });
    expect(s.impulse.huelle).toMatchObject({ attackS: 5, staerke: 100 });
    expect(s.impulse.elementFolge).toBe("vorneHinten");
    s.adjustImpulse("elementVersatzS", 2);
    expect(s.impulse.elementVersatzS).toBe(0.4);
    s.resetImpulse("attackS");
    expect(s.impulse.huelle.attackS).toBe(0.4);
    s.setImpulse({ art: "seitlich" });
    expect(s.impulse.art).toBe("auf");
    expect(parseClientMessage('{"typ":"impulsTippen","ursprung":3}')).toEqual({ typ: "impulsTippen", ursprung: 1, wischen: false });
    expect(parseClientMessage('{"typ":"impulsTippen"}')).toBeNull();
  });
});

describe("Stream Deck: encoder pages", () => {
  it("show only encoders the base movement uses", async () => {
    const { encoderPages } = await import("../src/input/streamdeck/layout.js");
    const names = (m: Parameters<typeof encoderPages>[0]) => encoderPages(m).map((s) => [s.name, s.encoders.map((r) => r.name)]);
    expect(names("ruhe")).toEqual([["Motion", ["offset"]]]);
    expect(names("pendelwelle")[0]).toEqual(["Motion", ["offset", "amplitude", "speedVon", "schwuenge"]]);
    expect(names("wind").map(([n]) => n)).toEqual(["Motion", "Distribution", "Fine"]);
    expect(encoderPages("sinus").every((s) => s.encoders.length <= 4)).toBe(true);
    // sine: the width right on the second motion page
    expect(names("sinus")[1]).toEqual(["Motion 2", ["breite", "speedBis"]]);
  });
});

describe("Autostart", () => {
  const withAutostart = (autostart: { output: boolean; auto: boolean }) => {
    const e = { ...structuredClone(SETTINGS_DEFAULTS), autostart };
    const s = new Controller({ ...PARAMETER_DEFAULTS }, e, checkPresets([]));
    return s;
  };

  it("leaves everything off after the start without the setting", () => {
    const s = withAutostart({ output: false, auto: false });
    expect(s.autostart()).toEqual([]);
    expect(s.takeover.soll).toBe(false);
    expect(s.autoOn).toBe(false);
  });

  it("turns on output and Auto, Auto only with two presets", () => {
    const s = withAutostart({ output: true, auto: true });
    s.storePreset(0);
    expect(s.autostart()).toEqual(["output on", "Auto not started: fewer than two presets selected"]);
    expect(s.takeover.soll).toBe(true);
    expect(s.autoOn).toBe(false);

    const t = withAutostart({ output: false, auto: true });
    t.storePreset(0);
    t.set({ amplitude: 50 });
    t.storePreset(1);
    expect(t.autostart()).toEqual(["Auto on"]);
    expect(t.autoOn).toBe(true);
    expect(t.takeover.soll).toBe(false);
  });
});
