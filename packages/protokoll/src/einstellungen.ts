// Einstellungen des Servers: Patch, Ausgaben, Überblendung. Werden im Einstellungsmenü des Clients
// bearbeitet und auf dem Server als JSON gespeichert.
import { ADRESSE_MAX, ELEMENTE, PATCH_VORGABE, type FlashZiele, type PatchElement } from "@parrafraktor/engine";

export interface ArtnetEinstellungen {
  an: boolean;
  ziel: string;        // Broadcast oder IP des Nodes
  quelle: string;      // lokale IP, über die gesendet wird; "" = automatisch
  versatz: number;     // Art-Net-Universe = Universe + versatz (Art-Net zählt ab 0)
}

export interface SacnEinstellungen {
  an: boolean;
  priority: number;    // muss über der MA liegen (die sendet mit 100)
  multicast: boolean;
  ziel: string;        // nur bei Unicast: IP des Nodes
  quelle: string;      // lokale IP für Multicast; "" = automatisch
}

export interface Rs485Einstellungen {
  an: boolean;
  geraet: string;      // serielle Schnittstelle, z. B. /dev/serial0 am Raspberry Pi
}

// Wie die Elemente im Raum stehen. Betrifft nur die Vorschau, nicht die Ausgabe.
//   reihe:           nebeneinander, Vorschau von oben
//   hintereinander:  hintereinander, jedes in seiner Ebene gedreht (wie "Classic"), Vorschau von vorn
export type Anordnung = "reihe" | "hintereinander";
export const ANORDNUNGEN: readonly Anordnung[] = ["reihe", "hintereinander"];

export interface Aufbau {
  anordnung: Anordnung;
  drehung: number[];   // je Element Drehung in seiner Ebene, Grad (Element 1 = vorn)
}

export interface Einstellungen {
  aufbau: Aufbau;
  patch: PatchElement[];   // je Element Universe und Startadresse
  rotateMaxUpm: number;    // Umdrehungen pro Minute bei TiltRotate 0 bzw. 255
  ueberblendungS: number;  // Überblendung beim Übernehmen und Abgeben, 0 = springen
  flash: FlashZiele;       // Tilt in Grad für Flash auf (Licht von hinten) und Flash zu (Licht von außen)
  artnet: ArtnetEinstellungen;
  sacn: SacnEinstellungen;
  rs485: Rs485Einstellungen;
}

export const EINSTELLUNGEN_VORGABE: Readonly<Einstellungen> = {
  // vorn senkrecht, Mitte diagonal, hinten waagerecht
  aufbau: { anordnung: "reihe", drehung: [0, 45, 90] },
  patch: PATCH_VORGABE.map((e) => ({ ...e })),
  // Platzhalter, bis die Drehzahl der Spiegel-Firmware bekannt ist – bewusst langsam
  rotateMaxUpm: 10,
  ueberblendungS: 2,
  // Platzhalter, bis die Winkel am echten Aufbau bestimmt sind
  flash: { auf: 90, zu: 0 },
  artnet: { an: true, ziel: "2.255.255.255", quelle: "", versatz: -1 },
  sacn: { an: false, priority: 150, multicast: true, ziel: "", quelle: "" },
  rs485: { an: false, geraet: "/dev/serial0" },
};

export const GRENZEN = {
  universe: { min: 1, max: 63999 },
  adresse: { min: 1, max: ADRESSE_MAX },
  rotateMaxUpm: { min: 1, max: 60 },
  ueberblendungS: { min: 0, max: 10 },
  priority: { min: 1, max: 200 },
  versatz: { min: -1, max: 0 },
  drehung: { min: -180, max: 180 },
  tilt: { min: -180, max: 180 },
} as const;

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
export const istIpv4 = (x: string): boolean => IPV4.test(x);

type Roh = Record<string, unknown>;
const objekt = (x: unknown): Roh => (typeof x === "object" && x !== null ? (x as Roh) : {});
const zahl = (x: unknown, alt: number, g: { min: number; max: number }, ganz = true): number => {
  if (typeof x !== "number" || !Number.isFinite(x)) return alt;
  const w = Math.min(g.max, Math.max(g.min, x));
  return ganz ? Math.round(w) : +w.toFixed(2);
};
const wahr = (x: unknown, alt: boolean): boolean => (typeof x === "boolean" ? x : alt);
const ip = (x: unknown, alt: string, leerErlaubt: boolean): string =>
  typeof x === "string" && (istIpv4(x.trim()) || (leerErlaubt && x.trim() === "")) ? x.trim() : alt;
const text = (x: unknown, alt: string): string => (typeof x === "string" && x.trim() ? x.trim() : alt);

// Teilstück (z. B. aus dem Client oder der gespeicherten Datei) über die bisherigen Einstellungen legen.
// Ungültige Felder werden ignoriert.
export function pruefeEinstellungen(roh: unknown, basis: Einstellungen = EINSTELLUNGEN_VORGABE): Einstellungen {
  const r = objekt(roh);
  const rohPatch = Array.isArray(r.patch) ? r.patch : [];
  const patch = Array.from({ length: ELEMENTE }, (_, k) => {
    const alt = basis.patch[k] ?? PATCH_VORGABE[k]!;
    const e = objekt(rohPatch[k]);
    return { universe: zahl(e.universe, alt.universe, GRENZEN.universe), adresse: zahl(e.adresse, alt.adresse, GRENZEN.adresse) };
  });
  const a = objekt(r.artnet), s = objekt(r.sacn), rs = objekt(r.rs485), au = objekt(r.aufbau), f = objekt(r.flash);
  const rohDrehung = Array.isArray(au.drehung) ? au.drehung : [];
  const aufbau: Aufbau = {
    anordnung: ANORDNUNGEN.includes(au.anordnung as Anordnung) ? (au.anordnung as Anordnung) : basis.aufbau.anordnung,
    drehung: Array.from({ length: ELEMENTE }, (_, k) =>
      zahl(rohDrehung[k], basis.aufbau.drehung[k] ?? 0, GRENZEN.drehung)),
  };
  return {
    aufbau,
    patch,
    rotateMaxUpm: zahl(r.rotateMaxUpm, basis.rotateMaxUpm, GRENZEN.rotateMaxUpm, false),
    ueberblendungS: zahl(r.ueberblendungS, basis.ueberblendungS, GRENZEN.ueberblendungS, false),
    flash: { auf: zahl(f.auf, basis.flash.auf, GRENZEN.tilt), zu: zahl(f.zu, basis.flash.zu, GRENZEN.tilt) },
    artnet: {
      an: wahr(a.an, basis.artnet.an),
      ziel: ip(a.ziel, basis.artnet.ziel, false),
      quelle: ip(a.quelle, basis.artnet.quelle, true),
      versatz: zahl(a.versatz, basis.artnet.versatz, GRENZEN.versatz),
    },
    sacn: {
      an: wahr(s.an, basis.sacn.an),
      priority: zahl(s.priority, basis.sacn.priority, GRENZEN.priority),
      multicast: wahr(s.multicast, basis.sacn.multicast),
      ziel: ip(s.ziel, basis.sacn.ziel, true),
      quelle: ip(s.quelle, basis.sacn.quelle, true),
    },
    rs485: { an: wahr(rs.an, basis.rs485.an), geraet: text(rs.geraet, basis.rs485.geraet) },
  };
}

// Überschneiden sich zwei Elemente im selben Universe? Liefert eine Warnung oder null.
export function patchWarnung(patch: readonly PatchElement[], kanaeleProElement: number): string | null {
  for (let a = 0; a < patch.length; a++) {
    for (let b = a + 1; b < patch.length; b++) {
      const x = patch[a]!, y = patch[b]!;
      if (x.universe === y.universe && Math.abs(x.adresse - y.adresse) < kanaeleProElement) {
        return `Element ${a + 1} und ${b + 1} überschneiden sich in Universe ${x.universe}`;
      }
    }
  }
  return null;
}
