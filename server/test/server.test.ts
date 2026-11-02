import { describe, expect, it } from "vitest";
import { artDmx } from "../src/ausgabe/artnet.js";
import { multicastAdresse, sacnPaket } from "../src/ausgabe/sacn.js";
import { uebernahmeSchritt } from "../src/takt.js";

describe("Übernahme", () => {
  it("schaltet ohne Überblendung sofort", () => {
    expect(uebernahmeSchritt("aus", 0, true, 0.025, 0, true)).toEqual({ zustand: "an", anteil: 1 });
    expect(uebernahmeSchritt("an", 1, false, 0.025, 0, true)).toEqual({ zustand: "aus", anteil: 0 });
  });

  it("springt, wenn die Stellung der MA unbekannt ist", () => {
    expect(uebernahmeSchritt("aus", 0, true, 0.025, 2, false)).toEqual({ zustand: "an", anteil: 1 });
  });

  it("blendet über die eingestellte Zeit ein und aus", () => {
    let z: ReturnType<typeof uebernahmeSchritt> = { zustand: "aus", anteil: 0 };
    for (let i = 0; i < 39; i++) z = uebernahmeSchritt(z.zustand, z.anteil, true, 0.025, 1, true);
    expect(z.zustand).toBe("blendetEin");
    expect(z.anteil).toBeCloseTo(0.975);
    z = uebernahmeSchritt(z.zustand, z.anteil, true, 0.025, 1, true);
    expect(z).toEqual({ zustand: "an", anteil: 1 });
    // Mitten im Abgeben wieder übernehmen: läuft vom aktuellen Anteil zurück
    z = uebernahmeSchritt(z.zustand, z.anteil, false, 0.5, 1, true);
    expect(z).toEqual({ zustand: "blendetAus", anteil: 0.5 });
    z = uebernahmeSchritt(z.zustand, z.anteil, true, 0.25, 1, true);
    expect(z).toEqual({ zustand: "blendetEin", anteil: 0.75 });
  });
});

describe("Pakete", () => {
  it("baut ArtDmx nach Art-Net 4", () => {
    const daten = new Uint8Array(512).fill(7);
    const p = artDmx(0x0123, 9, daten);
    expect(p.toString("latin1", 0, 8)).toBe("Art-Net\0");
    expect(p.readUInt16LE(8)).toBe(0x5000);
    expect([p[12], p[14], p[15]]).toEqual([9, 0x23, 0x01]);
    expect(p.readUInt16BE(16)).toBe(512);
    expect(p.length).toBe(530);
    expect(p[18]).toBe(7);
  });

  it("baut sACN wie die ESP32-Remote", () => {
    const p = sacnPaket(3, 150, Buffer.alloc(16, 0xab));
    expect(p.length).toBe(638);
    expect(p.toString("latin1", 4, 13)).toBe("ASC-E1.17");
    expect(p.readUInt16BE(16)).toBe(0x7000 | 622);
    expect(p.readUInt16BE(38)).toBe(0x7000 | 600);
    expect(p.readUInt16BE(115)).toBe(0x7000 | 523);
    expect(p[108]).toBe(150);
    expect(p.readUInt16BE(113)).toBe(3);
    expect(p.readUInt16BE(123)).toBe(513);
    expect(multicastAdresse(258)).toBe("239.255.1.2");
  });
});
