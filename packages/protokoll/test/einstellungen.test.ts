import { describe, expect, it } from "vitest";
import { EINSTELLUNGEN_VORGABE, pruefeEinstellungen } from "@parrafraktor/protokoll";

describe("Einstellungen", () => {
  it("übernimmt gültige Werte und verwirft ungültige", () => {
    const e = pruefeEinstellungen({
      aufbau: { anordnung: "hintereinander", drehung: [0, 45, 500] },
      artnet: { ziel: "kein.ip" },
      ueberblendungS: 3.456,
    });
    expect(e.aufbau).toEqual({ anordnung: "hintereinander", drehung: [0, 45, 180] });
    expect(e.artnet.ziel).toBe(EINSTELLUNGEN_VORGABE.artnet.ziel);
    expect(e.ueberblendungS).toBe(3.46);
  });

  it("ergänzt fehlende Teile aus der Vorgabe (alte Einstellungsdatei)", () => {
    const e = pruefeEinstellungen({ patch: [{ universe: 2, adresse: 1 }] });
    expect(e.aufbau).toEqual(EINSTELLUNGEN_VORGABE.aufbau);
    expect(e.patch[0]).toEqual({ universe: 2, adresse: 1 });
    expect(e.patch[1]).toEqual(EINSTELLUNGEN_VORGABE.patch[1]);
  });

  it("verwirft eine unbekannte Anordnung", () => {
    expect(pruefeEinstellungen({ aufbau: { anordnung: "kreis" } }).aufbau.anordnung).toBe("reihe");
  });
});

describe("alte Pattern", () => {
  it("werden beim Laden in Form und Regler umgewandelt", async () => {
    const { migriereParameter, pruefeParameter, pruefePreset } = await import("@parrafraktor/protokoll");
    expect(pruefeParameter(migriereParameter({ modus: "sinus-innen", phase: 180 })))
      .toMatchObject({ modus: "sinus", symmetrie: "innen", phase: 180 });
    expect(pruefeParameter(migriereParameter({ modus: "pingpong" }))).toMatchObject({ modus: "puls", richtung: "pingpong" });
    expect(pruefeParameter(migriereParameter({ modus: "faecher" }))).toMatchObject({ symmetrie: "innen", faecher: 100 });
    // neue Daten mit Symmetrie bleiben, wie sie sind
    expect(pruefeParameter(migriereParameter({ modus: "flyout", symmetrie: "aus" }))).toMatchObject({ modus: "flyout", symmetrie: "aus" });
    expect(pruefePreset({ name: "Alt", look: { modus: "chase" } })?.look).toMatchObject({ modus: "puls", symmetrie: "aus" });
  });
});
