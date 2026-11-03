// Belegung des Stream Deck+: Menüs auf den Tasten, Drehregler und Touchstreifen.
//
// Hauptmenü:
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │Pattern › │Presets › │ Regler   │Reihenf.  │   Regler: Reglerseite umschalten
//   ├──────────┼──────────┼──────────┼──────────┤
//   │Symmetrie │ Richtung │  Pause   │  Output  │   Symmetrie/Richtung: Stufe weiterschalten
//   └──────────┴──────────┴──────────┴──────────┘   Output: gedrückt halten (Schutz vor Versehen)
// Untermenü (Pattern, Presets): sechs Plätze, unten links Zurück, unten rechts nächste Seite.
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │  Platz   │  Platz   │  Platz   │  Platz   │
//   ├──────────┼──────────┼──────────┼──────────┤
//   │‹ Zurück  │  Platz   │  Platz   │ Seite ›  │
//   └──────────┴──────────┴──────────┴──────────┘
// Presets: Tippen ruft ab, Halten speichert den aktuellen Look.
//
// Drehregler: Seite 1 Offset/Amplitude/Speed/Phase, Seite 2 Speed bis/Group/Fächer/Symmetrie.
// Drücken setzt den Vorgabewert. Wischen auf dem Touchstreifen wechselt die Reglerseite.
import type { StufenParameter, ZahlParameter } from "@parrafraktor/protokoll";

export type Menue = "haupt" | "pattern" | "presets";

export type Regler =
  | { art: "zahl"; name: ZahlParameter }
  | { art: "stufe"; name: StufenParameter };

export const REGLER_SEITEN: Regler[][] = [
  [
    { art: "zahl", name: "offset" },
    { art: "zahl", name: "amplitude" },
    { art: "zahl", name: "speedVon" },
    { art: "zahl", name: "phase" },
  ],
  [
    { art: "zahl", name: "speedBis" },
    { art: "zahl", name: "group" },
    { art: "zahl", name: "faecher" },
    { art: "stufe", name: "symmetrie" },
  ],
];

// Hauptmenü
export const HAUPT = {
  pattern: 0,
  presets: 1,
  regler: 2,
  reihenfolge: 3,
  symmetrie: 4,
  richtung: 5,
  pause: 6,
  output: 7,
} as const;

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
