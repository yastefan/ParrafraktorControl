import { describe, expect, it } from "vitest";
import { PARAMETER_VORGABE } from "@parrafraktor/engine";
import { EINSTELLUNGEN_VORGABE, leseClientNachricht, pruefePresets } from "@parrafraktor/protokoll";
import { Steuerung } from "../src/steuerung.js";

const neu = (ueberblendungS = 2) =>
  new Steuerung({ ...PARAMETER_VORGABE }, { ...structuredClone(EINSTELLUNGEN_VORGABE), ueberblendungS }, pruefePresets([]));

describe("Presets", () => {
  it("speichert den Look und ruft ihn mit Überblendung ab", () => {
    const s = neu();
    s.setze({ amplitude: 77, phase: 90 });
    s.speicherePreset(3);
    expect(s.presets[3]).toMatchObject({ name: "Sinus", look: { amplitude: 77, phase: 90 } });
    expect(s.presets[3]!.look).not.toHaveProperty("laeuft");

    s.waehlePattern("chase");
    expect(s.letztesPreset).toBeNull();
    let blenden = 0;
    s.on("blende", () => blenden++);
    s.rufePresetAuf(3);
    expect(s.parameter).toMatchObject({ modus: "sinus", amplitude: 77, phase: 90 });
    expect(s.letztesPreset).toBe(3);
    expect(blenden).toBe(1);
    expect(s.blende).toEqual({ id: 1, anteil: 0 });
  });

  it("springt ohne Überblendzeit und lässt Pause unberührt", () => {
    const s = neu(0);
    s.speicherePreset(0);
    s.schalteLauf();
    s.rufePresetAuf(0);
    expect(s.blende).toBeNull();
    expect(s.parameter.laeuft).toBe(false);
    expect(s.letztesPreset).toBe(0);   // Pause zählt nicht als Änderung des Looks
  });

  it("benennt um, behält den Namen beim Überschreiben und löscht", () => {
    const s = neu();
    s.speicherePreset(1);
    s.benennePreset(1, "Welle");
    s.setze({ offset: 10 });
    s.speicherePreset(1);
    expect(s.presets[1]).toMatchObject({ name: "Welle", look: { offset: 10 } });
    s.loeschePreset(1);
    expect(s.presets[1]).toBeNull();
    expect(s.letztesPreset).toBeNull();
  });

  it("prüft Preset-Nachrichten", () => {
    expect(leseClientNachricht('{"typ":"preset","aktion":"abrufen","nr":2}')).toEqual({ typ: "preset", aktion: "abrufen", nr: 2 });
    expect(leseClientNachricht('{"typ":"preset","aktion":"abrufen","nr":12}')).toBeNull();
    expect(leseClientNachricht('{"typ":"preset","aktion":"umbenennen","nr":0,"name":"  "}')).toBeNull();
  });
});
