// Impulse settings (kind, envelope, element order, spread): ranges and checking.
// Saved in daten/impuls.json, edited in the client and on the encoders of the Stream Deck.
// The field names are saved data and protocol: they stay German.
import {
  ELEMENT_ORDERS, IMPULSE_DEFAULTS, isImpulseKind, type ElementOrder, type ImpulseSettings,
} from "@parrafraktor/engine";
import type { Range } from "./parameter.js";

export type ImpulseControl =
  | "attackS" | "sustainS" | "releaseS" | "staerke" | "elementVersatzS" | "ausbreitungS" | "breite" | "groesse";

export const IMPULSE_RANGES: Record<ImpulseControl, Range> = {
  attackS: { name: "Attack", short: "Attack", min: 0, max: 5, step: 0.05, unit: " s" },
  sustainS: { name: "Sustain", short: "Sustain", min: 0, max: 10, step: 0.05, unit: " s" },
  releaseS: { name: "Release", short: "Release", min: 0, max: 10, step: 0.05, unit: " s" },
  staerke: { name: "Strength", short: "Strength", min: 0, max: 100, step: 1, unit: " %" },
  elementVersatzS: { name: "Element delay", short: "Delay", min: 0, max: 2, step: 0.05, unit: " s" },
  ausbreitungS: { name: "Spread", short: "Spread", min: 0, max: 3, step: 0.05, unit: " s", zeroText: "off" },
  breite: { name: "Width", short: "Width", min: 0, max: 12, step: 1, unit: " mir.", zeroText: "all" },
  groesse: { name: "Size", short: "Size", min: 5, max: 90, step: 1, unit: " cm" },
};

export const IMPULSE_CONTROLS = Object.keys(IMPULSE_RANGES) as ImpulseControl[];

export const isImpulseControl = (x: unknown): x is ImpulseControl => typeof x === "string" && x in IMPULSE_RANGES;

export function clampImpulse(name: ImpulseControl, value: number): number {
  const b = IMPULSE_RANGES[name];
  const rounded = Math.round(value / b.step) * b.step;
  return +Math.min(b.max, Math.max(b.min, rounded)).toFixed(3);
}

export function formatImpulse(name: ImpulseControl, value: number): string {
  const b = IMPULSE_RANGES[name];
  if (value === 0 && b.zeroText) return b.zeroText;
  return (b.step < 1 ? value.toFixed(2) : String(Math.round(value))) + b.unit;
}

// Read or set the value of a control (the envelope is one level deeper)
type InEnvelope = "attackS" | "sustainS" | "releaseS" | "staerke";
const inEnvelope = (name: ImpulseControl): name is InEnvelope =>
  name === "attackS" || name === "sustainS" || name === "releaseS" || name === "staerke";

export const impulseValue = (e: ImpulseSettings, name: ImpulseControl): number =>
  inEnvelope(name) ? e.huelle[name] : e[name];

export function withImpulseValue(e: ImpulseSettings, name: ImpulseControl, value: number): ImpulseSettings {
  const w = clampImpulse(name, value);
  return inEnvelope(name) ? { ...e, huelle: { ...e.huelle, [name]: w } } : { ...e, [name]: w };
}

const isOrder = (x: unknown): x is ElementOrder => (ELEMENT_ORDERS as readonly unknown[]).includes(x);

// Lay a part (message, file) over the current settings; anything invalid is ignored
export function checkImpulse(raw: unknown, basis: ImpulseSettings = IMPULSE_DEFAULTS): ImpulseSettings {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const h = typeof r.huelle === "object" && r.huelle !== null ? (r.huelle as Record<string, unknown>) : {};
  let e: ImpulseSettings = { ...basis, huelle: { ...basis.huelle } };
  for (const name of IMPULSE_CONTROLS) {
    const x = inEnvelope(name) ? h[name] : r[name];
    if (typeof x === "number" && Number.isFinite(x)) e = withImpulseValue(e, name, x);
  }
  if (isOrder(r.elementFolge)) e.elementFolge = r.elementFolge;
  if (isImpulseKind(r.art)) e.art = r.art;
  if (typeof r.symmetrisch === "boolean") e.symmetrisch = r.symmetrisch;
  return e;
}
