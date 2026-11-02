// Wertebereiche der Pattern-Parameter. Eine Quelle für alle Bedienungen:
// Regler im Client, Drehregler am Stream Deck, später MIDI und OSC.
import { PARAMETER_VORGABE, istModus, type Parameter } from "@parrafraktor/engine";

export type ZahlParameter = "offset" | "amplitude" | "speedVon" | "speedBis" | "phase" | "group";

export interface Bereich {
  name: string;
  kurz: string;        // für schmale Anzeigen (Stream-Deck-Streifen)
  min: number;
  max: number;
  schritt: number;     // kleinster Schritt, auch pro Rastung am Drehregler
  einheit: string;
  nullText?: string;   // Anzeige für 0, z. B. "aus"
}

export const BEREICHE: Record<ZahlParameter, Bereich> = {
  offset: { name: "Offset", kurz: "Offset", min: -180, max: 180, schritt: 1, einheit: "°" },
  amplitude: { name: "Amplitude", kurz: "Ampl.", min: 0, max: 180, schritt: 1, einheit: "°" },
  speedVon: { name: "Speed von", kurz: "Speed", min: 0, max: 60, schritt: 0.1, einheit: " BPM", nullText: "aus" },
  speedBis: { name: "Speed bis", kurz: "bis", min: 0, max: 60, schritt: 0.1, einheit: " BPM", nullText: "aus" },
  phase: { name: "Phase", kurz: "Phase", min: 0, max: 720, schritt: 1, einheit: "°" },
  group: { name: "Group", kurz: "Group", min: 0, max: 18, schritt: 1, einheit: "", nullText: "aus" },
};

export const ZAHL_PARAMETER = Object.keys(BEREICHE) as ZahlParameter[];

export const istZahlParameter = (x: unknown): x is ZahlParameter =>
  typeof x === "string" && x in BEREICHE;

// Wert in den Bereich bringen und auf den Schritt runden
export function begrenze(name: ZahlParameter, wert: number): number {
  const b = BEREICHE[name];
  const gerundet = Math.round(wert / b.schritt) * b.schritt;
  return +Math.min(b.max, Math.max(b.min, gerundet)).toFixed(3);
}

export function zeigeWert(name: ZahlParameter, wert: number): string {
  const b = BEREICHE[name];
  if (wert === 0 && b.nullText) return b.nullText;
  const text = b.schritt < 1 ? wert.toFixed(1) : String(Math.round(wert));
  return text + b.einheit;
}

// Unbekannte Eingabe (z. B. aus einer Nachricht) in ein geprüftes Teilstück der Parameter wandeln
export function pruefeParameter(roh: unknown): Partial<Parameter> {
  if (typeof roh !== "object" || roh === null) return {};
  const r = roh as Record<string, unknown>;
  const teil: Partial<Parameter> = {};
  if (istModus(r.modus)) teil.modus = r.modus;
  for (const name of ZAHL_PARAMETER) {
    const w = r[name];
    if (typeof w === "number" && Number.isFinite(w)) teil[name] = begrenze(name, w);
  }
  if (typeof r.jeElement === "boolean") teil.jeElement = r.jeElement;
  if (typeof r.laeuft === "boolean") teil.laeuft = r.laeuft;
  return teil;
}

export const vorgabeWert = (name: ZahlParameter): number => PARAMETER_VORGABE[name];
