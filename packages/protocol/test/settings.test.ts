import { describe, expect, it } from "vitest";
import { SETTINGS_DEFAULTS, checkSettings } from "@parrafraktor/protocol";

describe("settings", () => {
  it("takes valid values and drops invalid ones", () => {
    const e = checkSettings({
      aufbau: { anordnung: "hintereinander", drehung: [0, 45, 500] },
      artnet: { ziel: "kein.ip" },
      ueberblendungS: 3.456,
    });
    expect(e.aufbau).toEqual({ anordnung: "hintereinander", drehung: [0, 45, 180] });
    expect(e.artnet.ziel).toBe(SETTINGS_DEFAULTS.artnet.ziel);
    expect(e.ueberblendungS).toBe(3.46);
  });

  it("fills missing parts from the defaults (old settings file)", () => {
    const e = checkSettings({ patch: [{ universe: 2, adresse: 1 }] });
    expect(e.aufbau).toEqual(SETTINGS_DEFAULTS.aufbau);
    expect(e.patch[0]).toEqual({ universe: 2, adresse: 1 });
    expect(e.patch[1]).toEqual(SETTINGS_DEFAULTS.patch[1]);
  });

  it("drops an unknown arrangement", () => {
    expect(checkSettings({ aufbau: { anordnung: "kreis" } }).aufbau.anordnung).toBe("reihe");
  });

  it("autostart is off, also with old files and invalid values", () => {
    expect(checkSettings({}).autostart).toEqual({ output: false, auto: false });
    expect(checkSettings({ autostart: { output: "ja", auto: 1 } }).autostart).toEqual({ output: false, auto: false });
    const on = checkSettings({ autostart: { output: true } });
    expect(on.autostart).toEqual({ output: true, auto: false });
    expect(checkSettings({ autostart: { auto: true } }, on).autostart).toEqual({ output: true, auto: true });
  });
});

describe("old files", () => {
  it("old patterns become shape and controls", async () => {
    const { migrateParameter, checkParameter, checkPreset } = await import("@parrafraktor/protocol");
    expect(checkParameter(migrateParameter({ modus: "sinus-innen", phase: 180 })))
      .toMatchObject({ modus: "sinus", ordnung: "mitteAussen", gegenlauf: true, phase: 180 });
    expect(checkParameter(migrateParameter({ modus: "pingpong" }))).toMatchObject({ modus: "sinus", pingpong: true, ordnung: "links" });
    expect(checkParameter(migrateParameter({ modus: "faecher" }))).toMatchObject({ ordnung: "mitteAussen", faecher: 100 });
    expect(checkPreset({ name: "Alt", look: { modus: "chase" } })?.look).toMatchObject({ modus: "sinus", ordnung: "links" });
  });

  it("symmetry, direction and sequence go into ordering and element order", async () => {
    const { migrateParameter, checkParameter } = await import("@parrafraktor/protocol");
    expect(checkParameter(migrateParameter({ modus: "flyout", symmetrie: "aussen", richtung: "vor", jeElement: true })))
      .toMatchObject({ modus: "sinus", ordnung: "aussenMitte", gegenlauf: true, elementFolge: "zusammen", pingpong: false });
    expect(checkParameter(migrateParameter({ modus: "sinus", symmetrie: "aus", richtung: "zurueck", jeElement: false })))
      .toMatchObject({ ordnung: "rechts", gegenlauf: false, elementFolge: "vorneHinten" });
    expect(checkParameter(migrateParameter({ modus: "rechteck", symmetrie: "innen" }))).toMatchObject({ modus: "sinus", ordnung: "mitteAussen" });
    // new data stays as it is
    expect(migrateParameter({ modus: "wind", ordnung: "zufall" })).toEqual({ modus: "wind", ordnung: "zufall" });
  });
});
