import { describe, expect, it } from "vitest";
import { artDmx } from "../src/output/artnet.js";
import { multicastAddress, sacnPacket } from "../src/output/sacn.js";
import { takeoverStep } from "../src/ticker.js";

describe("takeover", () => {
  it("switches at once without cross-fade", () => {
    expect(takeoverStep("aus", 0, true, 0.025, 0, true)).toEqual({ zustand: "an", anteil: 1 });
    expect(takeoverStep("an", 1, false, 0.025, 0, true)).toEqual({ zustand: "aus", anteil: 0 });
  });

  it("jumps when the MA position is unknown", () => {
    expect(takeoverStep("aus", 0, true, 0.025, 2, false)).toEqual({ zustand: "an", anteil: 1 });
  });

  it("fades in and out over the set time", () => {
    let z: ReturnType<typeof takeoverStep> = { zustand: "aus", anteil: 0 };
    for (let i = 0; i < 39; i++) z = takeoverStep(z.zustand, z.anteil, true, 0.025, 1, true);
    expect(z.zustand).toBe("blendetEin");
    expect(z.anteil).toBeCloseTo(0.975);
    z = takeoverStep(z.zustand, z.anteil, true, 0.025, 1, true);
    expect(z).toEqual({ zustand: "an", anteil: 1 });
    // take over again in the middle of releasing: runs back from the current fraction
    z = takeoverStep(z.zustand, z.anteil, false, 0.5, 1, true);
    expect(z).toEqual({ zustand: "blendetAus", anteil: 0.5 });
    z = takeoverStep(z.zustand, z.anteil, true, 0.25, 1, true);
    expect(z).toEqual({ zustand: "blendetEin", anteil: 0.75 });
  });
});

describe("packets", () => {
  it("builds ArtDmx per Art-Net 4", () => {
    const data = new Uint8Array(512).fill(7);
    const p = artDmx(0x0123, 9, data);
    expect(p.toString("latin1", 0, 8)).toBe("Art-Net\0");
    expect(p.readUInt16LE(8)).toBe(0x5000);
    expect([p[12], p[14], p[15]]).toEqual([9, 0x23, 0x01]);
    expect(p.readUInt16BE(16)).toBe(512);
    expect(p.length).toBe(530);
    expect(p[18]).toBe(7);
  });

  it("builds sACN like the ESP32 remote", () => {
    const p = sacnPacket(3, 150, Buffer.alloc(16, 0xab));
    expect(p.length).toBe(638);
    expect(p.toString("latin1", 4, 13)).toBe("ASC-E1.17");
    expect(p.readUInt16BE(16)).toBe(0x7000 | 622);
    expect(p.readUInt16BE(38)).toBe(0x7000 | 600);
    expect(p.readUInt16BE(115)).toBe(0x7000 | 523);
    expect(p[108]).toBe(150);
    expect(p.readUInt16BE(113)).toBe(3);
    expect(p.readUInt16BE(123)).toBe(513);
    expect(multicastAddress(258)).toBe("239.255.1.2");
  });
});
