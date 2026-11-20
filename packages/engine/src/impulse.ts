// Impulses: events played live on top of the base movement, like flash keys on a lighting desk.
// You pick the kind and trigger it on the touch strip: a tap starts it at that spot (origin 0 = left
// … 1 = right), a swipe from the edge in the direction of the swipe. Then the envelope runs:
// attack (there), sustain (stay), release (back) – the strip knows no holding.
//
//   Open/Close    all mirrors to a target position (angle from the settings)
//   Hole          everything closes except for a hole (like the base movement Aperture): each element
//                 opens a slit, the slits cross at the origin. Swiped, the hole travels across the image.
//   Iris          like Hole, but it grows out of a point with the envelope
//
// Spread: Flash: time until the impulse has crossed an element (0 = all mirrors at once);
// Aperture: time the swiped hole needs to cross the image (0 = the whole envelope).
// Width (Flash): on a tap the impulse only acts on that many mirrors around the origin (0 = all);
// a swipe always runs through the whole element. Size (Aperture): radius of the hole.
// Symmetric: the impulse also starts at the mirrored point, the left half is mirrored (like
// counter-motion): target with the opposite sign. Apertures become two holes.
// Element order: the elements one after another, with element delay.
// Server (Takt) and client (preview) compute the same with this.
//
// The kinds ("auf", "zu", "loch", "iris") and the fields of ImpulseSettings, Envelope and
// RunningImpulse are saved data and protocol: they stay German.
import { ELEMENTS, MIRRORS_PER_ELEMENT, elementRank, type ElementOrder } from "./layout.js";
import { slitOpen, smooth, type Position } from "./pattern.js";

export const IMPULSE_KINDS = ["auf", "zu", "loch", "iris"] as const;
export type ImpulseKind = (typeof IMPULSE_KINDS)[number];
// Names on the desk; "Flash" is the base movement Glühwürmchen since 2026-11-19
export const IMPULSE_NAME: Record<ImpulseKind, string> = { auf: "Open", zu: "Close", loch: "Hole", iris: "Iris" };
export const isImpulseKind = (x: unknown): x is ImpulseKind => (IMPULSE_KINDS as readonly unknown[]).includes(x);
export const isApertureKind = (kind: ImpulseKind): boolean => kind === "loch" || kind === "iris";

export interface Envelope {
  attackS: number;    // time to full deflection
  sustainS: number;   // how long full deflection stays
  releaseS: number;   // time back
  staerke: number;    // strength %, how far towards the target or how much of the deflection (100 = all)
}

export interface ImpulseSettings {
  art: ImpulseKind;          // what the touch strip triggers
  huelle: Envelope;
  elementFolge: ElementOrder;
  elementVersatzS: number;   // time between two elements
  ausbreitungS: number;      // spread: time until the impulse has crossed an element (0 = all mirrors at once)
  breite: number;            // width, Flash: mirrors around the origin on a tap, 0 = all
  groesse: number;           // size, Hole and Iris: radius in cm
  symmetrisch: boolean;      // also from the mirrored point, left half mirrored
}

export const IMPULSE_DEFAULTS: Readonly<ImpulseSettings> = {
  art: "auf",
  huelle: { attackS: 0.4, sustainS: 0.5, releaseS: 1.5, staerke: 100 },
  elementFolge: "zusammen",
  elementVersatzS: 0.3,
  ausbreitungS: 0,
  breite: 0,
  groesse: 30,
  symmetrisch: false,
};

// A running impulse, times in seconds since the start
export interface RunningImpulse {
  id: number;
  art: ImpulseKind;
  alterS: number;     // age
  ursprung: number;   // origin 0 … 1 across the element
  breite: number;     // mirrors around the origin, 0 = all (kept from the start)
  wischt: boolean;    // swiped: Hole and Iris travel from the origin to the other side
}

// Angles from the settings: targets of the flashes (degrees)
export interface ImpulseAngles {
  auf: number;
  zu: number;
}

// Envelope deflection 0 … 1, t: seconds since the start (at this mirror)
export function envelopeValue(h: Envelope, t: number): number {
  if (t <= 0) return 0;
  if (t < h.attackS) return smooth(t / h.attackS);
  const r = t - h.attackS - h.sustainS;
  if (r <= 0) return 1;
  return h.releaseS > 0 ? 1 - smooth(r / h.releaseS) : 0;
}

export const envelopeDuration = (h: Envelope): number => h.attackS + h.sustainS + h.releaseS;

// Delay of element k (seconds) according to the element order
export function elementDelay(e: ImpulseSettings, k: number): number {
  return (elementRank(e.elementFolge, k) ?? 0) * e.elementVersatzS;
}

// Place of mirror i (0 … 11) across the element, 0 = left … 1 = right
const placeOf = (i: number): number => i / (MIRRORS_PER_ELEMENT - 1);

// Start points: the origin, when symmetric also its mirror image
const origins = (e: ImpulseSettings, u: number): number[] => (e.symmetrisch ? [u, 1 - u] : [u]);

// Distance of mirror i to the nearest start point (fraction of the element width)
const distance = (e: ImpulseSettings, u: number, i: number): number =>
  Math.min(...origins(e, u).map((x) => Math.abs(placeOf(i) - x)));

// Delay of mirror i: distance to the start point times spread
export const mirrorDelay = (e: ImpulseSettings, origin: number, i: number): number =>
  distance(e, origin, i) * e.ausbreitungS;

// How much mirror s takes part (0 … 1): fully within the width, one mirror of transition at the edge
export function widthFactor(e: ImpulseSettings, i: Pick<RunningImpulse, "ursprung" | "breite">, s: number): number {
  if (i.breite <= 0) return 1;
  const mirrors = distance(e, i.ursprung, s) * (MIRRORS_PER_ELEMENT - 1);
  return smooth(i.breite / 2 + 0.5 - mirrors);
}

// Mirrored half when symmetric: the left one, as with counter-motion
const side = (e: ImpulseSettings, s: number): number => (e.symmetrisch && s < MIRRORS_PER_ELEMENT / 2 ? -1 : 1);

// ---------- Apertures ----------

const EDGE_M = 0.12;         // soft edge, so the hole glides between the rows of mirrors
const HALF_IMAGE_M = 0.6;    // this far from the center lie the ends of the strip in the image

// Horizontal position of the hole (metres), t seconds after the start at the element. Tapped it stays
// at its point, swiped it travels to the other side (spread, otherwise the whole envelope).
function holeX(e: ImpulseSettings, i: RunningImpulse, t: number): number {
  let x = i.ursprung;
  if (i.wischt) {
    const duration = e.ausbreitungS || envelopeDuration(e.huelle);
    const f = duration > 0 ? Math.min(1, t / duration) : 1;
    x = i.ursprung + (1 - 2 * i.ursprung) * f;
  }
  return (x - 0.5) * 2 * HALF_IMAGE_M;
}

// How far mirror s of element k is open for the aperture (0 … 1). When symmetric, each element
// opens two slits, which make two holes at mirrored spots.
function apertureValue(e: ImpulseSettings, i: RunningImpulse, t: number, rotation: number, s: number): number {
  const r = (e.groesse / 100) * (i.art === "iris" ? envelopeValue(e.huelle, t) : 1);
  const a = (rotation * Math.PI) / 180;
  const center = holeX(e, i, t) * Math.cos(a);
  const open = slitOpen(s, center, r, EDGE_M);
  return e.symmetrisch ? Math.max(open, slitOpen(s, -center, r, EDGE_M)) : open;
}

// ---------- Run ----------

// How long an impulse lasts from its start until the last mirror is back
export function impulseDuration(e: ImpulseSettings, kind: ImpulseKind): number {
  const elements = Math.max(...Array.from({ length: ELEMENTS }, (_, k) => elementDelay(e, k)));
  // Aperture: the spread is the hole's travel here, it runs within the envelope
  return elements + (isApertureKind(kind) ? 0 : e.ausbreitungS) + envelopeDuration(e.huelle);
}

export const impulseDone = (e: ImpulseSettings, i: Pick<RunningImpulse, "alterS" | "art">): boolean =>
  i.alterS >= impulseDuration(e, i.art);

// Lay impulses over the positions, in the order they started (the last one on top).
// TiltRotate is stopped meanwhile, so the mirror really stands at the target.
// rotation: rotation of the elements in their plane, Hole and Iris use it.
export function applyImpulses(
  positions: readonly Position[],
  impulses: readonly RunningImpulse[],
  e: ImpulseSettings,
  angles: ImpulseAngles,
  rotation: readonly number[] = [0, 45, 90],
): Position[] {
  const out = positions.map((s) => ({ ...s }));
  const strength = e.huelle.staerke / 100;
  for (const i of impulses) {
    for (let k = 0; k < ELEMENTS; k++) {
      const tElement = i.alterS - elementDelay(e, k);
      if (tElement <= 0) continue;
      for (let s = 0; s < MIRRORS_PER_ELEMENT; s++) {
        const st = out[k * MIRRORS_PER_ELEMENT + s]!;
        if (i.art === "loch" || i.art === "iris") {
          // Everything moves to the image with the hole: hole mirrors edge-on, the others closed
          const f = envelopeValue(e.huelle, tElement) * strength;
          if (f <= 0) continue;
          const target = side(e, s) * 90 * apertureValue(e, i, tElement, rotation[k] ?? 0, s);
          st.tilt += (target - st.tilt) * f;
          st.upm *= 1 - f;
          continue;
        }
        const f = envelopeValue(e.huelle, tElement - mirrorDelay(e, i.ursprung, s)) * strength * widthFactor(e, i, s);
        if (f <= 0) continue;
        st.tilt += (side(e, s) * angles[i.art] - st.tilt) * f;
        st.upm *= 1 - f;
      }
    }
  }
  return out;
}
