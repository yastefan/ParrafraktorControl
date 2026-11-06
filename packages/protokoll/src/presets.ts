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

// ---------- Auto: fährt die ausgewählten Presets der Reihe nach ab ----------

export const AUTO_BEREICHE = {
  halteS: { min: 5, max: 300, schritt: 5, vorgabe: 30 },    // so lange steht ein Look, nach der Überblendung
  blendeS: { min: 0, max: 120, schritt: 1, vorgabe: 20 },   // so lange dauert der Übergang
} as const;

export interface AutoEinstellung {
  auswahl: boolean[];   // je Preset-Platz, ob er mitläuft
  halteS: number;
  blendeS: number;
}

export const AUTO_VORGABE: Readonly<AutoEinstellung> = {
  auswahl: Array.from({ length: PRESET_ANZAHL }, () => true),
  halteS: AUTO_BEREICHE.halteS.vorgabe,
  blendeS: AUTO_BEREICHE.blendeS.vorgabe,
};

const autoZeit = (x: unknown, b: { min: number; max: number; schritt: number }, alt: number): number =>
  typeof x === "number" && Number.isFinite(x) ? Math.min(b.max, Math.max(b.min, Math.round(x / b.schritt) * b.schritt)) : alt;

// Gespeicherte Datei oder Nachricht prüfen; Fehlendes bleibt wie in `basis`
export function pruefeAuto(roh: unknown, basis: Readonly<AutoEinstellung> = AUTO_VORGABE): AutoEinstellung {
  const r = typeof roh === "object" && roh !== null ? (roh as Record<string, unknown>) : {};
  const auswahl = Array.isArray(r.auswahl) ? r.auswahl : [];
  return {
    auswahl: basis.auswahl.map((alt, i) => (typeof auswahl[i] === "boolean" ? auswahl[i] : alt)),
    halteS: autoZeit(r.halteS, AUTO_BEREICHE.halteS, basis.halteS),
    blendeS: autoZeit(r.blendeS, AUTO_BEREICHE.blendeS, basis.blendeS),
  };
}
