// Wertebereiche der Pattern-Parameter. Eine Quelle für alle Bedienungen:
// Regler im Client, Drehregler am Stream Deck, später MIDI und OSC.
import {
  ELEMENTE, ELEMENT_FOLGEN, ELEMENT_FOLGE_NAME, ORDNUNGEN, ORDNUNG_NAME, PARAMETER_VORGABE,
  istElementFolge, istModus, istOrdnung, type Modus, type Parameter,
} from "@parrafraktor/engine";

export type ZahlParameter =
  | "offset" | "amplitude" | "speedVon" | "speedBis" | "phase" | "breite" | "group" | "faecher" | "schwuenge" | "wellenlaenge";

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
  speedVon: { name: "Speed von", kurz: "Speed von", min: 0, max: 10, schritt: 0.1, einheit: " BPM", nullText: "aus" },
  speedBis: { name: "Speed bis", kurz: "Speed bis", min: 0, max: 10, schritt: 0.1, einheit: " BPM", nullText: "aus" },
  phase: { name: "Phase", kurz: "Phase", min: 0, max: 720, schritt: 1, einheit: "°" },
  breite: { name: "Breite", kurz: "Breite", min: 5, max: 100, schritt: 1, einheit: " %" },
  group: { name: "Group", kurz: "Group", min: 0, max: 18, schritt: 1, einheit: "", nullText: "aus" },
  faecher: { name: "Fächer", kurz: "Fächer", min: 0, max: 100, schritt: 1, einheit: " %", nullText: "aus" },
  schwuenge: { name: "Wiederkehr", kurz: "Wiederk.", min: 4, max: 100, schritt: 1, einheit: " Schw." },
  wellenlaenge: { name: "Wellenlänge", kurz: "Wellenl.", min: 1, max: 36, schritt: 1, einheit: " Sp." },
};

// Regler mit festen Stufen (Umschalter im Client, Durchschalten am Stream Deck)
export type StufenParameter = "ordnung" | "elementFolge";

export const STUFEN = {
  ordnung: { name: "Ordnung", werte: ORDNUNGEN, text: ORDNUNG_NAME },
  elementFolge: { name: "Elemente", werte: ELEMENT_FOLGEN, text: ELEMENT_FOLGE_NAME },
} as const;

// Schalter (an/aus)
export type SchalterParameter = "gegenlauf" | "pingpong";
export const SCHALTER: Record<SchalterParameter, string> = { gegenlauf: "Gegenlauf", pingpong: "Ping-Pong" };

// Welche Regler eine Grundbewegung nicht benutzt: werden im Client ausgeblendet
type Regler = ZahlParameter | StufenParameter | SchalterParameter;
const UNBENUTZT: Partial<Record<Modus, Regler[]>> = {
  sinus: ["schwuenge", "wellenlaenge"],
  pendelwelle: ["speedBis", "phase", "breite", "wellenlaenge", "pingpong"],
  wind: ["speedBis", "phase", "breite", "schwuenge", "pingpong"],
  rotation: ["amplitude", "phase", "breite", "faecher", "schwuenge", "wellenlaenge", "gegenlauf", "pingpong"],
  ruhe: ["ordnung", "elementFolge", "amplitude", "speedVon", "speedBis", "phase", "breite", "group", "faecher", "schwuenge", "wellenlaenge", "gegenlauf", "pingpong"],
};
export const benutzt = (modus: Modus, name: Regler): boolean => !UNBENUTZT[modus]?.includes(name);

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
  if (istOrdnung(r.ordnung)) teil.ordnung = r.ordnung;
  if (istElementFolge(r.elementFolge)) teil.elementFolge = r.elementFolge;
  for (const name of ["gegenlauf", "pingpong", "offsetGetrennt", "laeuft"] as const) {
    if (typeof r[name] === "boolean") teil[name] = r[name];
  }
  if (Array.isArray(r.offsetElemente) && r.offsetElemente.length === ELEMENTE
    && r.offsetElemente.every((w) => typeof w === "number" && Number.isFinite(w))) {
    teil.offsetElemente = (r.offsetElemente as number[]).map((w) => begrenze("offset", w));
  }
  return teil;
}

export const vorgabeWert = (name: ZahlParameter): number => PARAMETER_VORGABE[name];

// ---------- Alte Dateien ----------
// Gespeicherte Parameter und Presets in die heutige Form bringen. Nur für Dateien, nicht für Nachrichten.
//  1. Pattern aus der Zeit vor Symmetrie/Richtung/Fächer (damals eigene Pattern)
//  2. Dreieck und Rechteck gibt es nicht mehr (zu harte Bewegungen): werden zum Sinus
//  3. Symmetrie, Richtung und Reihenfolge sind in Ordnung, Element-Folge, Gegenlauf und Ping-Pong aufgegangen
//  4. Sägezahn, Puls, Flyout, Blinder und Funkeln sind keine Grundbewegung mehr: werden zum Sinus
const ALTE_PATTERN: Record<string, Record<string, unknown>> = {
  "sinus-innen": { modus: "sinus", symmetrie: "innen" },
  "sinus-aussen": { modus: "sinus", symmetrie: "aussen" },
  faecher: { modus: "sinus", symmetrie: "innen", faecher: 100 },
  chase: { modus: "puls" },
  pingpong: { modus: "puls", richtung: "pingpong" },
  flyout: { modus: "flyout", symmetrie: "innen" },
  blinder: { modus: "blinder", symmetrie: "innen" },
  dreieck: { modus: "sinus" },
  rechteck: { modus: "sinus" },
};

const ENTFALLEN: Record<string, Record<string, unknown>> = { dreieck: { modus: "sinus" }, rechteck: { modus: "sinus" } };

const ALS_IMPULS = ["saegezahn", "puls", "flyout", "blinder", "funkeln"];

export function migriereParameter(roh: unknown): unknown {
  if (typeof roh !== "object" || roh === null) return roh;
  const r = migriereVerteilung(roh as Record<string, unknown>);
  return ALS_IMPULS.includes(r.modus as string) ? { ...r, modus: "sinus" } : r;
}

function migriereVerteilung(r: Record<string, unknown>): Record<string, unknown> {
  if ("ordnung" in r) return r;
  if (typeof r.modus === "string") {
    const neu = ("symmetrie" in r ? ENTFALLEN : ALTE_PATTERN)[r.modus];
    if (neu) r = { ...r, ...neu };
  }
  const { symmetrie, richtung, jeElement, ...rest } = r;
  const mitte = symmetrie === "innen" ? "mitteAussen" : symmetrie === "aussen" ? "aussenMitte" : null;
  return {
    ...rest,
    ordnung: mitte ?? (richtung === "zurueck" ? "rechts" : "links"),
    gegenlauf: mitte !== null,
    pingpong: richtung === "pingpong",
    elementFolge: jeElement === true ? "zusammen" : "vorneHinten",
  };
}
