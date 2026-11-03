// Look-Presets: gespeicherte Pattern-Einstellungen, wie Cues. Abrufen blendet weich über
// (Dauer wie die Überblendung des Outputs). Pause gehört nicht zum Look.
import { MODUS_NAME, PARAMETER_VORGABE, type Parameter } from "@parrafraktor/engine";
import { migriereParameter, pruefeParameter } from "./parameter.js";

export const PRESET_ANZAHL = 12;
export const PRESET_NAME_MAX = 24;

export type Look = Omit<Parameter, "laeuft">;

export interface Preset {
  name: string;
  look: Look;
}

// leere Plätze sind null
export type Presets = (Preset | null)[];

export const lookAus = ({ laeuft: _, ...look }: Parameter): Look => look;

export const vorgabeName = (look: Look): string => MODUS_NAME[look.modus];

const pruefeName = (x: unknown, alt: string): string =>
  typeof x === "string" && x.trim() ? x.trim().slice(0, PRESET_NAME_MAX) : alt;

export function pruefePreset(roh: unknown): Preset | null {
  if (typeof roh !== "object" || roh === null) return null;
  const r = roh as Record<string, unknown>;
  const { laeuft: _, ...look } = { ...PARAMETER_VORGABE, ...pruefeParameter(migriereParameter(r.look)) };
  return { name: pruefeName(r.name, vorgabeName(look)), look };
}

// Gespeicherte Datei oder Nachricht in genau PRESET_ANZAHL Plätze wandeln
export function pruefePresets(roh: unknown): Presets {
  const liste = Array.isArray(roh) ? roh : [];
  return Array.from({ length: PRESET_ANZAHL }, (_, i) => pruefePreset(liste[i]));
}

export const istPresetNr = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x < PRESET_ANZAHL;

export const presetName = pruefeName;
