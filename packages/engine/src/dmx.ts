// Mirror positions to DMX, as in the grandMA3 fixture "Gobbesso Parrafraktor", mode Standard:
// 37 channels per element. Per mirror i (0 … 11) from the start address:
//   3i+1 / 3i+2  Tilt 16 bit (coarse/fine), −180 … +180°
//   3i+3         TiltRotate 8 bit, 0x7F = stopped, 0 or 255 = full speed in either direction
//   37           Dimmer, only for the MA's 3D preview
import { ELEMENTS, MIRRORS_PER_ELEMENT } from "./layout.js";
import type { Position } from "./pattern.js";

export const CHANNELS_PER_MIRROR = 3;
export const CHANNELS_PER_ELEMENT = MIRRORS_PER_ELEMENT * CHANNELS_PER_MIRROR + 1;
export const TILT_MIN = -180;
export const TILT_MAX = 180;
export const ROTATE_STOP = 0x7f;

// Saved in the settings: field names stay German
export interface PatchElement {
  universe: number;   // 1 … 63999
  adresse: number;    // start address 1 … 512 − 36
}

export const PATCH_DEFAULTS: readonly PatchElement[] = [
  { universe: 1, adresse: 1 },
  { universe: 1, adresse: 38 },
  { universe: 1, adresse: 75 },
];

export const ADDRESS_MAX = 512 - CHANNELS_PER_ELEMENT + 1;

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

// Tilt in degrees → 16-bit value. Beyond ±180° the mirror stays at the end stop instead of
// going all the way round.
export const tiltValue = (degrees: number): number =>
  Math.round(clamp((degrees - TILT_MIN) / (TILT_MAX - TILT_MIN), 0, 1) * 65535);

export const tiltDegrees = (value: number): number => TILT_MIN + (value / 65535) * (TILT_MAX - TILT_MIN);

// Speed → TiltRotate. maxRpm = revolutions per minute at DMX 0 or 255.
export const rotateValue = (rpm: number, maxRpm: number): number =>
  clamp(Math.round(ROTATE_STOP + (rpm / maxRpm) * 128), 0, 255);

export const rotateRpm = (value: number, maxRpm: number): number => ((value - ROTATE_STOP) / 128) * maxRpm;

// All universes the patch uses
export const patchUniverses = (patch: readonly PatchElement[]): number[] =>
  [...new Set(patch.map((e) => e.universe))].sort((a, b) => a - b);

// Write positions into DMX buffers (512 channels per universe).
// Channels outside the patch stay 0.
export function writeUniverses(
  positions: readonly Position[],
  patch: readonly PatchElement[],
  maxRpm: number,
): Map<number, Uint8Array> {
  const universes = new Map<number, Uint8Array>();
  for (const u of patchUniverses(patch)) universes.set(u, new Uint8Array(512));
  for (let k = 0; k < ELEMENTS; k++) {
    const e = patch[k]!;
    const dmx = universes.get(e.universe)!;
    const base = e.adresse - 1;
    for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
      const s = positions[k * MIRRORS_PER_ELEMENT + i]!;
      const tilt = tiltValue(s.tilt);
      const c = base + i * CHANNELS_PER_MIRROR;
      dmx[c] = tilt >> 8;
      dmx[c + 1] = tilt & 0xff;
      dmx[c + 2] = rotateValue(s.upm, maxRpm);
    }
    dmx[base + CHANNELS_PER_ELEMENT - 1] = 255;   // dimmer full, only for the 3D preview
  }
  return universes;
}

// The other way: read positions from received DMX (e.g. from the MA).
// null if a universe of the patch is missing.
export function readPositions(
  universes: ReadonlyMap<number, Uint8Array>,
  patch: readonly PatchElement[],
  maxRpm: number,
): Position[] | null {
  const positions: Position[] = [];
  for (let k = 0; k < ELEMENTS; k++) {
    const e = patch[k]!;
    const dmx = universes.get(e.universe);
    if (!dmx) return null;
    for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
      const c = e.adresse - 1 + i * CHANNELS_PER_MIRROR;
      positions.push({
        tilt: tiltDegrees(((dmx[c] ?? 0) << 8) | (dmx[c + 1] ?? 0)),
        upm: rotateRpm(dmx[c + 2] ?? ROTATE_STOP, maxRpm),
      });
    }
  }
  return positions;
}
