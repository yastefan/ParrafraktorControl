// Belegung des Stream Deck+: Menüs auf den Tasten, Drehregler und Touchstreifen.
// Jedes Menü hat eine Farbe (bilder.ts, TON): Pattern blau, Presets grün, Impulse violett;
// die Reglergruppen Bewegung bernstein, Verteilung koralle, Fein grau.
//
// Hauptmenü:
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │Pattern › │Presets › │Impulse › │ Seite ›  │   Seite: nächste Reglerseite (Name darunter)
//   ├──────────┼──────────┼──────────┼──────────┤
//   │ Ordnung  │ Elemente │  Pause   │  Output  │   Ordnung/Elemente: Stufe weiterschalten
//   └──────────┴──────────┴──────────┴──────────┘   Output: gedrückt halten (Schutz vor Versehen)
// Untermenü (Pattern, Presets): sechs Plätze, unten links Zurück, unten rechts nächste Seite.
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │  Platz   │  Platz   │  Platz   │  Platz   │
//   ├──────────┼──────────┼──────────┼──────────┤
//   │‹ Zurück  │  Platz   │  Platz   │ Seite ›  │
//   └──────────┴──────────┴──────────┴──────────┘
// Presets: Tippen ruft ab, Halten speichert den aktuellen Look.
//
// Impulse (Live-Seite):
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │Flash auf │Flash zu  │  Stoß    │ Glitzern │   obere Reihe: Art wählen (löst nichts aus)
//   ├──────────┼──────────┼──────────┼──────────┤
//   │‹ Zurück  │ Elemente │ Regler   │Symmetr.  │   Regler: Seite Hülle (Attack/Sustain/Release/Stärke)
//   └──────────┴──────────┴──────────┴──────────┘           oder Lauf (Ausbreitung/Breite/Versatz)
// Touchstreifen im Impulse-Menü: Tippen = gewählte Art von dort aus, Wischen = sie läuft in
// Wischrichtung durch. Wie schnell, sagt die Ausbreitung.
//
// Drehregler: Die Seiten richten sich nach der Grundbewegung – nur Regler, die sie benutzt,
// leere Seiten fallen weg (bei Ruhe bleibt nur Offset). Schalter: Drehen schaltet.
// Drücken setzt den Vorgabewert. Wischen auf dem Touchstreifen wechselt die Reglerseite
// (außer im Impulse-Menü).
import type { ImpulsArt, Modus } from "@parrafraktor/engine";
import { benutzt, type ImpulsRegler, type SchalterParameter, type StufenParameter, type ZahlParameter } from "@parrafraktor/protokoll";
import type { Ton } from "./bilder.js";

export type Menue = "haupt" | "pattern" | "presets" | "impulse";

export type Regler =
  | { art: "zahl"; name: ZahlParameter }
  | { art: "stufe"; name: StufenParameter }
  | { art: "schalter"; name: SchalterParameter };

export interface ReglerSeite {
  name: string;
  ton: Ton;
  regler: Regler[];
}

const zahl = (name: ZahlParameter): Regler => ({ art: "zahl", name });
const stufe = (name: StufenParameter): Regler => ({ art: "stufe", name });
const schalter = (name: SchalterParameter): Regler => ({ art: "schalter", name });

// Alle Regler nach Gruppe; je Grundbewegung bleiben die benutzten übrig. Bei der Bewegung kommt
// als vierter, was zur Form gehört (Sinus: Phase, Pendelwelle: Wiederkehr, Wind: Wellenlänge).
const GRUPPEN: ReglerSeite[] = [
  { name: "Bewegung", ton: "bewegung", regler: [stufe("bahn"), zahl("groesse"), zahl("weite"), zahl("offset"), zahl("amplitude"), zahl("speedVon"), zahl("phase"), zahl("breite"), zahl("speedBis"), zahl("schwuenge"), zahl("wellenlaenge"), zahl("kante"), zahl("wabern"), zahl("nachlauf")] },
  { name: "Verteilung", ton: "verteilung", regler: [stufe("ordnung"), stufe("elementFolge"), zahl("faecher"), schalter("gegenlauf")] },
  { name: "Fein", ton: "fein", regler: [zahl("group"), schalter("pingpong")] },
];

// Reglerseiten für eine Grundbewegung: höchstens vier Regler je Seite, leere fallen weg
export function reglerSeiten(modus: Modus): ReglerSeite[] {
  const seiten: ReglerSeite[] = [];
  for (const g of GRUPPEN) {
    const regler = g.regler.filter((r) => benutzt(modus, r.name));
    for (let n = 0; n < regler.length; n += 4) {
      seiten.push({ ...g, name: n ? `${g.name} 2` : g.name, regler: regler.slice(n, n + 4) });
    }
  }
  return seiten;
}

// Hauptmenü
export const HAUPT = {
  pattern: 0,
  presets: 1,
  impulse: 2,
  seite: 3,
  ordnung: 4,
  elemente: 5,
  pause: 6,
  output: 7,
} as const;

// Impulse
export const IMPULS_ARTEN_TASTEN: Partial<Record<number, ImpulsArt>> = { 0: "auf", 1: "zu", 2: "stoss", 3: "glitzern" };
export const TASTE_ELEMENT_FOLGE = 5;
export const TASTE_IMPULS_REGLER = 6;
export const TASTE_SYMMETRISCH = 7;
export const IMPULS_REGLER_SEITEN: { name: string; regler: ImpulsRegler[] }[] = [
  { name: "Hülle", regler: ["attackS", "sustainS", "releaseS", "staerke"] },
  { name: "Lauf", regler: ["ausbreitungS", "breite", "elementVersatzS"] },
];

// Untermenüs
export const TASTE_ZURUECK = 4;
export const TASTE_SEITE = 7;
export const PLAETZE = [0, 1, 2, 3, 5, 6] as const;

export const HALTEN_MS = { output: 600, presetSpeichern: 800 } as const;

// Platz (0 … 5) einer Taste im Untermenü, sonst undefined
export const platzVon = (taste: number): number | undefined => {
  const i = (PLAETZE as readonly number[]).indexOf(taste);
  return i < 0 ? undefined : i;
};

export const seitenAnzahl = (eintraege: number): number => Math.ceil(eintraege / PLAETZE.length);

// Index des Eintrags auf einer Taste, wenn es ihn gibt
export const eintragAuf = (seite: number, taste: number, eintraege: number): number | undefined => {
  const platz = platzVon(taste);
  if (platz === undefined) return undefined;
  const i = seite * PLAETZE.length + platz;
  return i < eintraege ? i : undefined;
};
