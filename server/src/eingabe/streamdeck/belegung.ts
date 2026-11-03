// Belegung des Stream Deck+: Menüs auf den Tasten, Drehregler und Touchstreifen.
//
// Hauptmenü:
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │Pattern › │Presets › │ Regler   │ Elemente │   Regler: Reglerseite umschalten
//   ├──────────┼──────────┼──────────┼──────────┤
//   │Impulse › │ Ordnung  │  Pause   │  Output  │   Elemente/Ordnung: Stufe weiterschalten
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
//   │Flash auf │Flash zu  │El.-Folge │Streifen  │   Pads wie Flash-Tasten: drücken, halten, loslassen
//   ├──────────┼──────────┼──────────┼──────────┤   Streifen: welcher Flash beim Tippen auf den Touchstreifen
//   │‹ Zurück  │ Regler   │          │          │   Regler: Seite 1 Attack/Release/Stärke/Versatz, 2 Ausbreitung
//   └──────────┴──────────┴──────────┴──────────┘
// Touchstreifen im Impulse-Menü: Tippen = Flash von dort aus (ohne Halten), Wischen = Flash läuft
// in Wischrichtung durch. Wie schnell er durchläuft, sagt die Ausbreitung.
//
// Drehregler: Seite 1 Offset/Amplitude/Speed/Phase, Seite 2 Speed bis/Group/Fächer/Ordnung,
// Seite 3 Wiederkehr/Wellenlänge/Gegenlauf/Ping-Pong (Schalter: Drehen schaltet).
// Drücken setzt den Vorgabewert. Wischen auf dem Touchstreifen wechselt die Reglerseite
// (außer im Impulse-Menü).
import type { ImpulsZiel } from "@parrafraktor/engine";
import type { ImpulsRegler, SchalterParameter, StufenParameter, ZahlParameter } from "@parrafraktor/protokoll";

export type Menue = "haupt" | "pattern" | "presets" | "impulse";

export type Regler =
  | { art: "zahl"; name: ZahlParameter }
  | { art: "stufe"; name: StufenParameter }
  | { art: "schalter"; name: SchalterParameter };

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
    { art: "stufe", name: "ordnung" },
  ],
  [
    { art: "zahl", name: "schwuenge" },
    { art: "zahl", name: "wellenlaenge" },
    { art: "schalter", name: "gegenlauf" },
    { art: "schalter", name: "pingpong" },
  ],
];

// Hauptmenü
export const HAUPT = {
  pattern: 0,
  presets: 1,
  regler: 2,
  elemente: 3,
  impulse: 4,
  ordnung: 5,
  pause: 6,
  output: 7,
} as const;

// Impulse
export const IMPULS_PADS: Partial<Record<number, ImpulsZiel>> = { 0: "auf", 1: "zu" };
export const TASTE_ELEMENT_FOLGE = 2;
export const TASTE_STREIFEN = 3;
export const TASTE_IMPULS_REGLER = 5;
export const IMPULS_REGLER_SEITEN: ImpulsRegler[][] = [["attackS", "releaseS", "staerke", "elementVersatzS"], ["ausbreitungS"]];

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
