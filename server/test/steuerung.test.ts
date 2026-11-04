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

  it("Streifen startet die gewählte Art vom Ursprung aus und räumt nach dem Release auf", () => {
    const { s, vor } = mitUhr();
    s.setzeImpuls({ art: "stoss" });
    s.tippeImpuls(1.7);
    expect(s.impulse()).toEqual([{ id: 1, art: "stoss", alterS: 0, ursprung: 1, breite: 0 }]);
    s.setzeImpuls({ breite: 4 });
    s.tippeImpuls(0.5);
    s.tippeImpuls(0, true);   // gewischt: durch das ganze Element
    expect(s.impulse().map((i) => i.breite)).toEqual([0, 4, 0]);
    const h = s.impuls.huelle;
    vor(h.attackS + h.sustainS + h.releaseS + 0.01);
    s.raeumeImpulse();
    expect(s.impulse()).toEqual([]);
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
    s.setzeImpuls({ art: "seitlich" });
    expect(s.impuls.art).toBe("auf");
    expect(leseClientNachricht('{"typ":"impulsTippen","ursprung":3}')).toEqual({ typ: "impulsTippen", ursprung: 1, wischen: false });
    expect(leseClientNachricht('{"typ":"impulsTippen"}')).toBeNull();
  });
});

describe("Stream Deck: Reglerseiten", () => {
  it("zeigen nur Regler, die die Grundbewegung benutzt", async () => {
    const { reglerSeiten } = await import("../src/eingabe/streamdeck/belegung.js");
    const namen = (m: Parameters<typeof reglerSeiten>[0]) => reglerSeiten(m).map((s) => [s.name, s.regler.map((r) => r.name)]);
    expect(namen("ruhe")).toEqual([["Bewegung", ["offset"]]]);
    expect(namen("pendelwelle")[0]).toEqual(["Bewegung", ["offset", "amplitude", "speedVon", "schwuenge"]]);
    expect(namen("wind").map(([n]) => n)).toEqual(["Bewegung", "Verteilung", "Fein"]);
    expect(reglerSeiten("sinus").every((s) => s.regler.length <= 4)).toBe(true);
    // Sinus: die Breite gleich auf der zweiten Bewegungsseite
    expect(namen("sinus")[1]).toEqual(["Bewegung 2", ["breite", "speedBis"]]);
  });
});
