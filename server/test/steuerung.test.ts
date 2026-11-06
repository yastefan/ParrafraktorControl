import { describe, expect, it } from "vitest";
import { PARAMETER_VORGABE } from "@parrafraktor/engine";
import { EINSTELLUNGEN_VORGABE, leseClientNachricht, pruefePresets } from "@parrafraktor/protokoll";
import { Steuerung } from "../src/steuerung.js";

const neu = (ueberblendungS = 2) =>
  new Steuerung({ ...PARAMETER_VORGABE }, { ...structuredClone(EINSTELLUNGEN_VORGABE), ueberblendungS }, pruefePresets([]));

describe("Auto", () => {
  const mitPresets = (...nr: number[]) => {
    const s = neu();
    nr.forEach((n, i) => { s.setze({ amplitude: 10 + i }); s.speicherePreset(n); });
    return s;
  };

  it("fährt die ausgewählten Presets der Reihe nach ab, mit eigener Überblendung", () => {
    const s = mitPresets(0, 2, 5);
    s.stelleAuto({ auswahl: [true, false, true, false, false, true], halteS: 10, blendeS: 5 });
    s.setzeAuto(true);
    expect(s.autoAn).toBe(true);
    expect(s.letztesPreset).toBe(0);    // nach 5 geht es von vorn los
    expect(s.blendeDauerS).toBe(5);
    s.autoWeiter(14.9);
    expect(s.letztesPreset).toBe(0);    // Überblenden und Halten zusammen
    s.autoWeiter(0.2);
    expect(s.letztesPreset).toBe(2);
    s.autoWeiter(15.1);
    expect(s.letztesPreset).toBe(5);
    s.autoWeiter(15.1);
    expect(s.letztesPreset).toBe(0);
  });

  it("überspringt nicht Ausgewählte und leere Plätze", () => {
    const s = mitPresets(0, 1, 2);
    s.stelleAuto({ auswahl: [true, false, true], halteS: 5, blendeS: 0 });
    s.setzeAuto(true);
    expect(s.letztesPreset).toBe(0);
    s.autoWeiter(5.1);
    expect(s.letztesPreset).toBe(2);
    s.autoWeiter(5.1);
    expect(s.letztesPreset).toBe(0);
  });

  it("startet nicht mit weniger als zwei Presets", () => {
    const s = mitPresets(3);
    s.setzeAuto(true);
    expect(s.autoAn).toBe(false);
  });

  it("endet, sobald jemand den Look verändert oder ein Preset abruft", () => {
    const s = mitPresets(0, 1);
    s.setzeAuto(true);
    s.setze({ amplitude: 55 });
    expect(s.autoAn).toBe(false);
    s.setzeAuto(true);
    s.rufePresetAuf(1);
    expect(s.autoAn).toBe(false);
    expect(s.blendeDauerS).toBe(2);     // Abruf von Hand: Überblendung aus den Einstellungen
  });

  it("wartet in der Pause, läuft danach weiter und fasst den Output nicht an", () => {
    const s = mitPresets(0, 1);
    s.stelleAuto({ halteS: 5, blendeS: 0 });
    s.setzeAuto(true);
    s.schalteLauf();
    expect(s.autoAn).toBe(true);
    const nr = s.letztesPreset;
    s.autoWeiter(100);
    expect(s.letztesPreset).toBe(nr);
    s.schalteLauf();
    s.autoWeiter(5.1);
    expect(s.letztesPreset).not.toBe(nr);
    expect(s.uebernahme.soll).toBe(false);
  });

  it("endet, wenn durch Löschen oder Abwählen zu wenig bleibt, und begrenzt die Zeiten", () => {
    const s = mitPresets(0, 1, 2);
    s.setzeAuto(true);
    s.loeschePreset(2);
    expect(s.autoAn).toBe(true);
    s.loeschePreset(1);
    expect(s.autoAn).toBe(false);
    s.stelleAuto({ halteS: 9999, blendeS: -3 });
    expect(s.auto).toMatchObject({ halteS: 300, blendeS: 0 });
    expect(leseClientNachricht('{"typ":"auto","an":true}')).toEqual({ typ: "auto", an: true });
    expect(leseClientNachricht('{"typ":"auto","an":1}')).toBeNull();
  });
});

describe("Auto am Stream Deck", () => {
  it("Taste startet und stoppt, ist ohne genug Presets gedämpft und zeigt den Look", async () => {
    const { StreamDeckModul } = await import("../src/eingabe/streamdeck/index.js");
    const { HAUPT } = await import("../src/eingabe/streamdeck/belegung.js");
    const s = neu();
    const m = new StreamDeckModul(s) as unknown as {
      tastenInhalt(t: number): { titel: string; unter?: string; leise?: boolean };
      aktion(t: number): { tippen?: () => void } | undefined;
    };
    expect(m.tastenInhalt(HAUPT.auto).leise).toBe(true);
    s.speicherePreset(0);
    s.setze({ amplitude: 50 });
    s.speicherePreset(1);
    s.benennePreset(1, "Zwei");
    expect(m.tastenInhalt(HAUPT.auto)).toMatchObject({ titel: "Auto", unter: "aus" });
    m.aktion(HAUPT.auto)!.tippen!();
    expect(s.autoAn).toBe(true);
    s.rufePresetAuf(1);
    s.setzeAuto(true);
    expect(m.tastenInhalt(HAUPT.auto).titel).toBe("AUTO");
    m.aktion(HAUPT.auto)!.tippen!();
    expect(s.autoAn).toBe(false);
  });
});

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
    s.setzeImpuls({ art: "loch" });
    s.tippeImpuls(1.7);
    expect(s.impulse()).toEqual([{ id: 1, art: "loch", alterS: 0, ursprung: 1, breite: 0, wischt: false }]);
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
