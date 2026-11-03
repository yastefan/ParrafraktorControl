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

    s.waehlePattern("wind");
    expect(s.letztesPreset).toBeNull();
    let blenden = 0;
    s.on("blende", () => blenden++);
    s.rufePresetAuf(3);
    expect(s.parameter).toMatchObject({ modus: "sinus", amplitude: 77, phase: 90 });
    expect(s.letztesPreset).toBe(3);
    expect(blenden).toBe(1);
    expect(s.blende).toEqual({ id: 2, anteil: 0 });   // 1 war der Wechsel zu Wind
  });

  it("blendet auch beim Wechsel der Form über", () => {
    const s = neu();
    s.waehlePattern("wind");
    expect(s.blende).toEqual({ id: 1, anteil: 0 });
    s.waehlePattern("wind");   // gleiche Form: keine neue Überblendung
    expect(s.blende?.id).toBe(1);
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

describe("Impulse", () => {
  const mitUhr = () => {
    let t = 0;
    const s = new Steuerung(
      { ...PARAMETER_VORGABE }, structuredClone(EINSTELLUNGEN_VORGABE), pruefePresets([]), undefined, () => t,
    );
    return { s, vor: (dt: number) => { t += dt; } };
  };

  it("hält, solange gedrückt, und räumt nach dem Release auf", () => {
    const { s, vor } = mitUhr();
    s.drueckeImpuls("auf", "ws1:auf");
    vor(10);
    s.raeumeImpulse();
    expect(s.impulse()).toEqual([{ id: 1, ziel: "auf", alterS: 10, losS: null, ursprung: null }]);
    s.loeseImpuls("ws1:auf");
    vor(s.impuls.huelle.releaseS + 0.01);
    s.raeumeImpulse();
    expect(s.impulse()).toEqual([]);
  });

  it("Touchstreifen: Impuls ohne Halten, vom Ursprung aus", () => {
    const { s, vor } = mitUhr();
    s.tippeImpuls("auf", 1.7);
    expect(s.impulse()).toEqual([{ id: 1, ziel: "auf", alterS: 0, losS: s.impuls.huelle.attackS, ursprung: 1 }]);
    vor(s.impuls.huelle.attackS + s.impuls.huelle.releaseS + 0.01);
    s.raeumeImpulse();
    expect(s.impulse()).toEqual([]);
  });

  it("lässt alles los, was eine abgebrochene Verbindung hält", () => {
    const { s } = mitUhr();
    s.drueckeImpuls("auf", "ws1:auf");
    s.drueckeImpuls("zu", "ws1:zu");
    s.drueckeImpuls("auf", "ws12:auf");
    s.loeseImpuls("ws1:", true);
    expect(s.impulse().map((i) => i.losS)).toEqual([0, 0, null]);
  });

  it("prüft Hüllkurve und Nachrichten", () => {
    const { s } = mitUhr();
    s.setzeImpuls({ huelle: { attackS: 99, staerke: "x" }, elementFolge: "vorneHinten" });
    expect(s.impuls.huelle).toMatchObject({ attackS: 5, staerke: 100 });
    expect(s.impuls.elementFolge).toBe("vorneHinten");
    s.verstelleImpuls("elementVersatzS", 2);
    expect(s.impuls.elementVersatzS).toBe(0.4);
    s.vorgabeImpuls("attackS");
    expect(s.impuls.huelle.attackS).toBe(0.4);
    expect(leseClientNachricht('{"typ":"impuls","ziel":"auf","gedrueckt":true}')).toEqual({ typ: "impuls", ziel: "auf", gedrueckt: true });
    expect(leseClientNachricht('{"typ":"impuls","ziel":"seitlich","gedrueckt":true}')).toBeNull();
  });
});
