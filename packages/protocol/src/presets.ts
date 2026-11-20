// Look presets: saved pattern settings, like cues. Recalling cross-fades smoothly
// (duration like the output cross-fade). Pause is not part of the look.
// Field names ("look", "auswahl", "halteS", …) are saved data and protocol: they stay German.
import { MODE_NAME, PARAMETER_DEFAULTS, type Parameter } from "@parrafraktor/engine";
import { migrateParameter, checkParameter } from "./parameter.js";

export const PRESET_COUNT = 12;
export const PRESET_NAME_MAX = 24;

export type Look = Omit<Parameter, "laeuft">;

export interface Preset {
  name: string;
  look: Look;
}

// empty slots are null
export type Presets = (Preset | null)[];

export const lookOf = ({ laeuft: _, ...look }: Parameter): Look => look;

export const defaultName = (look: Look): string => MODE_NAME[look.modus];

const checkName = (x: unknown, fallback: string): string =>
  typeof x === "string" && x.trim() ? x.trim().slice(0, PRESET_NAME_MAX) : fallback;

export function checkPreset(raw: unknown): Preset | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { laeuft: _, ...look } = { ...PARAMETER_DEFAULTS, ...checkParameter(migrateParameter(r.look)) };
  return { name: checkName(r.name, defaultName(look)), look };
}

// Turn a saved file or message into exactly PRESET_COUNT slots
export function checkPresets(raw: unknown): Presets {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: PRESET_COUNT }, (_, i) => checkPreset(list[i]));
}

export const isPresetNumber = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x < PRESET_COUNT;

export const presetName = checkName;

// ---------- Auto: plays the selected presets one after another ----------

export const AUTO_RANGES = {
  halteS: { min: 5, max: 300, step: 5, default: 30 },    // hold: how long a look stands, after the cross-fade
  blendeS: { min: 0, max: 120, step: 1, default: 20 },   // fade: how long the transition takes
} as const;

export interface AutoSettings {
  auswahl: boolean[];   // selection: per preset slot, whether it takes part
  halteS: number;
  blendeS: number;
}

export const AUTO_DEFAULTS: Readonly<AutoSettings> = {
  auswahl: Array.from({ length: PRESET_COUNT }, () => true),
  halteS: AUTO_RANGES.halteS.default,
  blendeS: AUTO_RANGES.blendeS.default,
};

const autoTime = (x: unknown, r: { min: number; max: number; step: number }, fallback: number): number =>
  typeof x === "number" && Number.isFinite(x) ? Math.min(r.max, Math.max(r.min, Math.round(x / r.step) * r.step)) : fallback;

// Check a saved file or message; anything missing stays as in `basis`
export function checkAuto(raw: unknown, basis: Readonly<AutoSettings> = AUTO_DEFAULTS): AutoSettings {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const selected = Array.isArray(r.auswahl) ? r.auswahl : [];
  return {
    auswahl: basis.auswahl.map((old, i) => (typeof selected[i] === "boolean" ? selected[i] : old)),
    halteS: autoTime(r.halteS, AUTO_RANGES.halteS, basis.halteS),
    blendeS: autoTime(r.blendeS, AUTO_RANGES.blendeS, basis.blendeS),
  };
}
