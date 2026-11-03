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
