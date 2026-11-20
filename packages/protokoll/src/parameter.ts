// Wertebereiche der Pattern-Parameter. Eine Quelle für alle Bedienungen:
// Regler im Client, Drehregler am Stream Deck, später MIDI und OSC.
import {
  HOLE_PATHS, HOLE_PATH_NAME, ELEMENTS, ELEMENT_ORDERS, ELEMENT_ORDER_NAME, ORDERINGS, ORDERING_NAME, PARAMETER_DEFAULTS,
  isHolePath, isElementOrder, isMode, isOrdering, type Mode, type Parameter,
} from "@parrafraktor/engine";

export type ZahlParameter =
  | "offset" | "amplitude" | "speedVon" | "speedBis" | "phase" | "elementPhase" | "breite" | "group" | "faecher" | "schwuenge" | "wellenlaenge"
  | "kopplung" | "rauschen" | "reichweite"
  | "groesse" | "weite" | "kante" | "wabern" | "puls" | "nachlauf";

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
  speedVon: { name: "Speed from", kurz: "Speed from", min: 0, max: 10, schritt: 0.1, einheit: " BPM", nullText: "off" },
  speedBis: { name: "Speed to", kurz: "Speed to", min: 0, max: 10, schritt: 0.1, einheit: " BPM", nullText: "off" },
  phase: { name: "Phase", kurz: "Phase", min: 0, max: 720, schritt: 1, einheit: "°" },
  elementPhase: { name: "Element phase", kurz: "El. phase", min: 0, max: 360, schritt: 1, einheit: "°", nullText: "off" },
  breite: { name: "Width", kurz: "Width", min: 5, max: 100, schritt: 1, einheit: " %" },
  group: { name: "Group", kurz: "Group", min: 0, max: 18, schritt: 1, einheit: "", nullText: "off" },
  faecher: { name: "Fan", kurz: "Fan", min: 0, max: 100, schritt: 1, einheit: " %", nullText: "off" },
  schwuenge: { name: "Return", kurz: "Return", min: 4, max: 100, schritt: 1, einheit: " sw." },
  wellenlaenge: { name: "Wavelength", kurz: "Wavel.", min: 1, max: 36, schritt: 1, einheit: " mir." },
  groesse: { name: "Size", kurz: "Size", min: 5, max: 90, schritt: 1, einheit: " cm" },
  weite: { name: "Travel", kurz: "Travel", min: 0, max: 90, schritt: 1, einheit: " cm" },
  kante: { name: "Edge", kurz: "Edge", min: 0, max: 100, schritt: 1, einheit: " %" },
  wabern: { name: "Wobble", kurz: "Wobble", min: 0, max: 100, schritt: 1, einheit: " %", nullText: "off" },
  puls: { name: "Pulse", kurz: "Pulse", min: 0, max: 100, schritt: 1, einheit: " %", nullText: "off" },
  nachlauf: { name: "Lag", kurz: "Lag", min: 0, max: 100, schritt: 1, einheit: " %", nullText: "off" },
  kopplung: { name: "Coupling", kurz: "Coupling", min: 0, max: 100, schritt: 1, einheit: " %", nullText: "off" },
  rauschen: { name: "Noise", kurz: "Noise", min: 0, max: 100, schritt: 1, einheit: " %", nullText: "off" },
  reichweite: { name: "Range", kurz: "Range", min: 0, max: 35, schritt: 1, einheit: " mir.", nullText: "all" },
};

// Regler mit festen Stufen (Umschalter im Client, Durchschalten am Stream Deck)
export type StufenParameter = "bahn" | "ordnung" | "elementFolge";

export const STUFEN = {
  bahn: { name: "Path", werte: HOLE_PATHS, text: HOLE_PATH_NAME },
  ordnung: { name: "Order", werte: ORDERINGS, text: ORDERING_NAME },
  elementFolge: { name: "Elements", werte: ELEMENT_ORDERS, text: ELEMENT_ORDER_NAME },
} as const;

// Schalter (an/aus)
export type SchalterParameter = "gegenlauf" | "pingpong" | "speedJeElement";
export const SCHALTER: Record<SchalterParameter, string> = { gegenlauf: "Counter-motion", pingpong: "Ping-pong", speedJeElement: "Speed per element" };

// Welche Regler eine Grundbewegung nicht benutzt: werden im Client ausgeblendet
type Regler = ZahlParameter | StufenParameter | SchalterParameter;
const KOPPLUNG: Regler[] = ["kopplung", "rauschen", "reichweite"];
const UNBENUTZT: Partial<Record<Mode, Regler[]>> = {
  sinus: ["schwuenge", "wellenlaenge", ...KOPPLUNG],
  pendelwelle: ["speedBis", "phase", "elementPhase", "breite", "wellenlaenge", "pingpong", "speedJeElement", ...KOPPLUNG],
  wind: ["speedBis", "phase", "elementPhase", "breite", "schwuenge", "pingpong", "speedJeElement", ...KOPPLUNG],
  schwarm: ["schwuenge", "wellenlaenge", "pingpong"],
  gluehwuermchen: ["schwuenge", "wellenlaenge", "pingpong"],
  rotation: ["amplitude", "schwuenge", "wellenlaenge", "pingpong", ...KOPPLUNG],
  ruhe: ["ordnung", "elementFolge", "amplitude", "speedVon", "speedBis", "phase", "elementPhase", "breite", "group", "faecher", "schwuenge", "wellenlaenge", "gegenlauf", "pingpong", "speedJeElement", ...KOPPLUNG],
};
// Die Öffnung hat ihre eigenen Regler, und von den anderen nur Speed
const NUR_OEFFNUNG: readonly Regler[] = ["bahn", "groesse", "weite", "kante", "wabern", "puls", "nachlauf"];
export const benutzt = (modus: Mode, name: Regler): boolean => {
  if (modus === "oeffnung") return NUR_OEFFNUNG.includes(name) || name === "speedVon";
  return !NUR_OEFFNUNG.includes(name) && !UNBENUTZT[modus]?.includes(name);
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
  if (isMode(r.modus)) teil.modus = r.modus;
  for (const name of ZAHL_PARAMETER) {
    const w = r[name];
    if (typeof w === "number" && Number.isFinite(w)) teil[name] = begrenze(name, w);
  }
  if (isHolePath(r.bahn)) teil.bahn = r.bahn;
  if (isOrdering(r.ordnung)) teil.ordnung = r.ordnung;
  if (isElementOrder(r.elementFolge)) teil.elementFolge = r.elementFolge;
  for (const name of ["gegenlauf", "pingpong", "speedJeElement", "offsetGetrennt", "laeuft"] as const) {
    if (typeof r[name] === "boolean") teil[name] = r[name];
  }
  if (Array.isArray(r.offsetElemente) && r.offsetElemente.length === ELEMENTS
    && r.offsetElemente.every((w) => typeof w === "number" && Number.isFinite(w))) {
    teil.offsetElemente = (r.offsetElemente as number[]).map((w) => begrenze("offset", w));
  }
  return teil;
}

export const vorgabeWert = (name: ZahlParameter): number => PARAMETER_DEFAULTS[name];

// ---------- Offset je Element ----------
// Hat jedes Element seinen Offset (offsetGetrennt), verschiebt der gemeinsame Offset alle Elemente um
// denselben Betrag: die Abstände bleiben (wie ein Gruppen-Fader). Am Rand des Bereichs bleibt er stehen,
// statt die Abstände zu stauchen. Gilt für Client, Stream Deck und Server gleich.
export function verschiebeOffset(p: Parameter, neu: number): Partial<Parameter> {
  const ziel = begrenze("offset", neu);
  if (!p.offsetGetrennt) return { offset: ziel };
  const b = BEREICHE.offset;
  const d = Math.min(b.max - Math.max(...p.offsetElemente), Math.max(b.min - Math.min(...p.offsetElemente), ziel - p.offset));
  return { offset: begrenze("offset", p.offset + d), offsetElemente: p.offsetElemente.map((w) => begrenze("offset", w + d)) };
}

// Elemente unterscheiden sich gerade im Offset (sonst ist „je Element“ ohne Wirkung)
export const offsetVerschieden = (p: Parameter): boolean =>
  p.offsetGetrennt && p.offsetElemente.some((w) => w !== p.offsetElemente[0]);

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
