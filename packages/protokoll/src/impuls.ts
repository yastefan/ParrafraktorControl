// Einstellung der Impulse (Hüllkurve, Element-Folge): Wertebereiche und Prüfung.
// Gespeichert in daten/impuls.json, bearbeitet im Client und an den Drehreglern des Stream Decks.
import { ELEMENT_FOLGEN, IMPULS_VORGABE, type ElementFolge, type ImpulsEinstellung } from "@parrafraktor/engine";
import type { Bereich } from "./parameter.js";

export type ImpulsRegler = "attackS" | "releaseS" | "staerke" | "elementVersatzS" | "ausbreitungS";

export const IMPULS_BEREICHE: Record<ImpulsRegler, Bereich> = {
  attackS: { name: "Attack", kurz: "Attack", min: 0, max: 5, schritt: 0.05, einheit: " s" },
  releaseS: { name: "Release", kurz: "Release", min: 0, max: 10, schritt: 0.05, einheit: " s" },
  staerke: { name: "Stärke", kurz: "Stärke", min: 0, max: 100, schritt: 1, einheit: " %" },
  elementVersatzS: { name: "Element-Versatz", kurz: "Versatz", min: 0, max: 2, schritt: 0.05, einheit: " s" },
  ausbreitungS: { name: "Ausbreitung", kurz: "Ausbr.", min: 0, max: 3, schritt: 0.05, einheit: " s", nullText: "aus" },
};

export const IMPULS_REGLER = Object.keys(IMPULS_BEREICHE) as ImpulsRegler[];

export const istImpulsRegler = (x: unknown): x is ImpulsRegler => typeof x === "string" && x in IMPULS_BEREICHE;

export function begrenzeImpuls(name: ImpulsRegler, wert: number): number {
  const b = IMPULS_BEREICHE[name];
  const gerundet = Math.round(wert / b.schritt) * b.schritt;
  return +Math.min(b.max, Math.max(b.min, gerundet)).toFixed(3);
}

export function zeigeImpuls(name: ImpulsRegler, wert: number): string {
  const b = IMPULS_BEREICHE[name];
  if (wert === 0 && b.nullText) return b.nullText;
  return (b.schritt < 1 ? wert.toFixed(2) : String(Math.round(wert))) + b.einheit;
}

// Wert eines Reglers lesen bzw. setzen (Hüllkurve liegt eine Ebene tiefer)
const obenAuf = (name: ImpulsRegler): name is "elementVersatzS" | "ausbreitungS" =>
  name === "elementVersatzS" || name === "ausbreitungS";

export const impulsWert = (e: ImpulsEinstellung, name: ImpulsRegler): number =>
  obenAuf(name) ? e[name] : e.huelle[name];

export function mitImpulsWert(e: ImpulsEinstellung, name: ImpulsRegler, wert: number): ImpulsEinstellung {
  const w = begrenzeImpuls(name, wert);
  return obenAuf(name) ? { ...e, [name]: w } : { ...e, huelle: { ...e.huelle, [name]: w } };
}

const istFolge = (x: unknown): x is ElementFolge => (ELEMENT_FOLGEN as readonly unknown[]).includes(x);

// Teilstück (Nachricht, Datei) über die bisherige Einstellung legen; Ungültiges wird ignoriert
export function pruefeImpuls(roh: unknown, basis: ImpulsEinstellung = IMPULS_VORGABE): ImpulsEinstellung {
  const r = typeof roh === "object" && roh !== null ? (roh as Record<string, unknown>) : {};
  const h = typeof r.huelle === "object" && r.huelle !== null ? (r.huelle as Record<string, unknown>) : {};
  let e: ImpulsEinstellung = { ...basis, huelle: { ...basis.huelle } };
  for (const name of IMPULS_REGLER) {
    const x = obenAuf(name) ? r[name] : h[name];
    if (typeof x === "number" && Number.isFinite(x)) e = mitImpulsWert(e, name, x);
  }
  if (istFolge(r.elementFolge)) e.elementFolge = r.elementFolge;
  return e;
}
