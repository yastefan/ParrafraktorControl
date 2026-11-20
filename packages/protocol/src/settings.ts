// Server settings: patch, outputs, cross-fade. Edited in the client's settings menu and saved on the
// server as JSON. The field names are saved data and protocol: they stay German.
import { ADDRESS_MAX, ELEMENTS, PATCH_DEFAULTS, type ImpulseAngles, type PatchElement } from "@parrafraktor/engine";

export interface ArtnetSettings {
  an: boolean;
  ziel: string;        // target: broadcast or IP of the node
  quelle: string;      // source: local IP to send from; "" = automatic
  versatz: number;     // offset: Art-Net universe = universe + versatz (Art-Net counts from 0)
}

export interface SacnSettings {
  an: boolean;
  priority: number;    // must be above the MA (which sends with 100)
  multicast: boolean;
  ziel: string;        // only for unicast: IP of the node
  quelle: string;      // local IP for multicast; "" = automatic
}

// What starts by itself after a server restart – for running without an MA (exhibition).
// Safety decision, both off by default: then the MA drives first after a restart.
//   output: the app takes over the mirrors at once (without MA without cross-fade, the mirrors jump)
//   auto:   Auto plays the selected presets (needs at least two)
export interface AutostartSettings {
  output: boolean;
  auto: boolean;
}

export interface Rs485Settings {
  an: boolean;
  geraet: string;      // device: serial port, e.g. /dev/serial0 on the Raspberry Pi
}

// How the elements stand in the room. Only affects the preview, not the output.
//   reihe:           side by side, preview from above
//   hintereinander:  one behind the other, each rotated in its plane (like "Classic"), preview from the front
export type Arrangement = "reihe" | "hintereinander";
export const ARRANGEMENTS: readonly Arrangement[] = ["reihe", "hintereinander"];

export interface Layout {
  anordnung: Arrangement;
  drehung: number[];   // rotation of each element in its plane, degrees (element 1 = front)
}

export interface Settings {
  aufbau: Layout;
  patch: PatchElement[];   // universe and start address per element
  rotateMaxUpm: number;    // revolutions per minute at TiltRotate 0 or 255
  ueberblendungS: number;  // cross-fade when taking over and releasing, 0 = jump
  // Impulses: tilt in degrees for flash open (light from behind) and flash close (light from outside)
  flash: ImpulseAngles;
  artnet: ArtnetSettings;
  sacn: SacnSettings;
  rs485: Rs485Settings;
  autostart: AutostartSettings;
}

export const SETTINGS_DEFAULTS: Readonly<Settings> = {
  // front vertical, middle diagonal, back horizontal
  aufbau: { anordnung: "reihe", drehung: [0, 45, 90] },
  patch: PATCH_DEFAULTS.map((e) => ({ ...e })),
  // placeholder until the speed of the mirror firmware is known – deliberately slow
  rotateMaxUpm: 10,
  ueberblendungS: 2,
  // placeholder until the angles are determined on the real installation
  flash: { auf: 90, zu: 0 },
  artnet: { an: true, ziel: "2.255.255.255", quelle: "", versatz: -1 },
  sacn: { an: false, priority: 150, multicast: true, ziel: "", quelle: "" },
  rs485: { an: false, geraet: "/dev/serial0" },
  autostart: { output: false, auto: false },
};

export const LIMITS = {
  universe: { min: 1, max: 63999 },
  adresse: { min: 1, max: ADDRESS_MAX },
  rotateMaxUpm: { min: 1, max: 60 },
  ueberblendungS: { min: 0, max: 10 },
  priority: { min: 1, max: 200 },
  versatz: { min: -1, max: 0 },
  drehung: { min: -180, max: 180 },
  tilt: { min: -180, max: 180 },
} as const;

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
export const isIpv4 = (x: string): boolean => IPV4.test(x);

type Raw = Record<string, unknown>;
const asObject = (x: unknown): Raw => (typeof x === "object" && x !== null ? (x as Raw) : {});
const num = (x: unknown, fallback: number, limit: { min: number; max: number }, integer = true): number => {
  if (typeof x !== "number" || !Number.isFinite(x)) return fallback;
  const w = Math.min(limit.max, Math.max(limit.min, x));
  return integer ? Math.round(w) : +w.toFixed(2);
};
const bool = (x: unknown, fallback: boolean): boolean => (typeof x === "boolean" ? x : fallback);
const ip = (x: unknown, fallback: string, emptyAllowed: boolean): string =>
  typeof x === "string" && (isIpv4(x.trim()) || (emptyAllowed && x.trim() === "")) ? x.trim() : fallback;
const str = (x: unknown, fallback: string): string => (typeof x === "string" && x.trim() ? x.trim() : fallback);

// Lay a part (e.g. from the client or the saved file) over the current settings.
// Invalid fields are ignored.
export function checkSettings(raw: unknown, basis: Settings = SETTINGS_DEFAULTS): Settings {
  const r = asObject(raw);
  const rawPatch = Array.isArray(r.patch) ? r.patch : [];
  const patch = Array.from({ length: ELEMENTS }, (_, k) => {
    const old = basis.patch[k] ?? PATCH_DEFAULTS[k]!;
    const e = asObject(rawPatch[k]);
    return { universe: num(e.universe, old.universe, LIMITS.universe), adresse: num(e.adresse, old.adresse, LIMITS.adresse) };
  });
  const a = asObject(r.artnet), s = asObject(r.sacn), rs = asObject(r.rs485), au = asObject(r.aufbau), f = asObject(r.flash);
  const st = asObject(r.autostart);
  const rawRotation = Array.isArray(au.drehung) ? au.drehung : [];
  const aufbau: Layout = {
    anordnung: ARRANGEMENTS.includes(au.anordnung as Arrangement) ? (au.anordnung as Arrangement) : basis.aufbau.anordnung,
    drehung: Array.from({ length: ELEMENTS }, (_, k) =>
      num(rawRotation[k], basis.aufbau.drehung[k] ?? 0, LIMITS.drehung)),
  };
  return {
    aufbau,
    patch,
    rotateMaxUpm: num(r.rotateMaxUpm, basis.rotateMaxUpm, LIMITS.rotateMaxUpm, false),
    ueberblendungS: num(r.ueberblendungS, basis.ueberblendungS, LIMITS.ueberblendungS, false),
    flash: {
      auf: num(f.auf, basis.flash.auf, LIMITS.tilt),
      zu: num(f.zu, basis.flash.zu, LIMITS.tilt),
    },
    artnet: {
      an: bool(a.an, basis.artnet.an),
      ziel: ip(a.ziel, basis.artnet.ziel, false),
      quelle: ip(a.quelle, basis.artnet.quelle, true),
      versatz: num(a.versatz, basis.artnet.versatz, LIMITS.versatz),
    },
    sacn: {
      an: bool(s.an, basis.sacn.an),
      priority: num(s.priority, basis.sacn.priority, LIMITS.priority),
      multicast: bool(s.multicast, basis.sacn.multicast),
      ziel: ip(s.ziel, basis.sacn.ziel, true),
      quelle: ip(s.quelle, basis.sacn.quelle, true),
    },
    rs485: { an: bool(rs.an, basis.rs485.an), geraet: str(rs.geraet, basis.rs485.geraet) },
    autostart: { output: bool(st.output, basis.autostart.output), auto: bool(st.auto, basis.autostart.auto) },
  };
}

// Do two elements overlap in the same universe? Returns a warning or null.
export function patchWarning(patch: readonly PatchElement[], channelsPerElement: number): string | null {
  for (let a = 0; a < patch.length; a++) {
    for (let b = a + 1; b < patch.length; b++) {
      const x = patch[a]!, y = patch[b]!;
      if (x.universe === y.universe && Math.abs(x.adresse - y.adresse) < channelsPerElement) {
        return `Element ${a + 1} and ${b + 1} overlap in universe ${x.universe}`;
      }
    }
  }
  return null;
}
