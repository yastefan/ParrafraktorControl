// Abbildung der Spiegelstellungen auf DMX, wie im grandMA3-Fixture "Gobbesso Parrafraktor", Mode Standard:
// 37 Kanäle je Element. Je Spiegel i (0 … 11) ab der Startadresse:
//   3i+1 / 3i+2  Tilt 16 Bit (coarse/fine), −180 … +180°
//   3i+3         TiltRotate 8 Bit, 0x7F = steht, 0 bzw. 255 = volle Drehung in beide Richtungen
//   37           Dimmer, nur für den 3D-Preview der MA
import { ELEMENTE, SPIEGEL_N } from "./aufbau.js";
import type { Stellung } from "./pattern.js";

export const KANAELE_PRO_SPIEGEL = 3;
export const KANAELE_PRO_ELEMENT = SPIEGEL_N * KANAELE_PRO_SPIEGEL + 1;
export const TILT_VON = -180;
export const TILT_BIS = 180;
export const ROTATE_STOP = 0x7f;

export interface PatchElement {
  universe: number;   // 1 … 63999
  adresse: number;    // Startadresse 1 … 512 − 36
}

export const PATCH_VORGABE: readonly PatchElement[] = [
  { universe: 1, adresse: 1 },
  { universe: 1, adresse: 38 },
  { universe: 1, adresse: 75 },
];

export const ADRESSE_MAX = 512 - KANAELE_PRO_ELEMENT + 1;

const begrenze = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

// Tilt in Grad → 16-Bit-Wert. Außerhalb von ±180° bleibt der Spiegel am Anschlag stehen,
// statt einmal ganz herumzufahren.
export const tiltWert = (grad: number): number =>
  Math.round(begrenze((grad - TILT_VON) / (TILT_BIS - TILT_VON), 0, 1) * 65535);

export const tiltGrad = (wert: number): number => TILT_VON + (wert / 65535) * (TILT_BIS - TILT_VON);

// Drehzahl → TiltRotate. maxUpm = Umdrehungen pro Minute bei DMX 0 bzw. 255.
export const rotateWert = (upm: number, maxUpm: number): number =>
  begrenze(Math.round(ROTATE_STOP + (upm / maxUpm) * 128), 0, 255);

export const rotateUpm = (wert: number, maxUpm: number): number => ((wert - ROTATE_STOP) / 128) * maxUpm;

// Alle Universen, die der Patch belegt
export const patchUniversen = (patch: readonly PatchElement[]): number[] =>
  [...new Set(patch.map((e) => e.universe))].sort((a, b) => a - b);

// Stellungen in DMX-Puffer schreiben (je Universe 512 Kanäle).
// Kanäle außerhalb des Patches bleiben 0.
export function schreibeUniversen(
  stellungen: readonly Stellung[],
  patch: readonly PatchElement[],
  maxUpm: number,
): Map<number, Uint8Array> {
  const universen = new Map<number, Uint8Array>();
  for (const u of patchUniversen(patch)) universen.set(u, new Uint8Array(512));
  for (let k = 0; k < ELEMENTE; k++) {
    const e = patch[k]!;
    const dmx = universen.get(e.universe)!;
    const basis = e.adresse - 1;
    for (let i = 0; i < SPIEGEL_N; i++) {
      const s = stellungen[k * SPIEGEL_N + i]!;
      const tilt = tiltWert(s.tilt);
      const c = basis + i * KANAELE_PRO_SPIEGEL;
      dmx[c] = tilt >> 8;
      dmx[c + 1] = tilt & 0xff;
      dmx[c + 2] = rotateWert(s.upm, maxUpm);
    }
    dmx[basis + KANAELE_PRO_ELEMENT - 1] = 255;   // Dimmer voll, nur für den 3D-Preview
  }
  return universen;
}

// Umkehrung: Stellungen aus empfangenen DMX-Daten (z. B. von der MA) lesen.
// null, wenn ein Universe des Patches fehlt.
export function leseStellungen(
  universen: ReadonlyMap<number, Uint8Array>,
  patch: readonly PatchElement[],
  maxUpm: number,
): Stellung[] | null {
  const stellungen: Stellung[] = [];
  for (let k = 0; k < ELEMENTE; k++) {
    const e = patch[k]!;
    const dmx = universen.get(e.universe);
    if (!dmx) return null;
    for (let i = 0; i < SPIEGEL_N; i++) {
      const c = e.adresse - 1 + i * KANAELE_PRO_SPIEGEL;
      stellungen.push({
        tilt: tiltGrad(((dmx[c] ?? 0) << 8) | (dmx[c + 1] ?? 0)),
        upm: rotateUpm(dmx[c + 2] ?? ROTATE_STOP, maxUpm),
      });
    }
  }
  return stellungen;
}
