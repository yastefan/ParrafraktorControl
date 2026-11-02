// Belegung des Stream Deck+: was die Tasten, Drehregler und der Touchstreifen tun.
//
// Tasten (2 Reihen à 4):
//   ┌────────┬────────┬────────┬────────┐
//   │Pattern │Pattern │Pattern │Pattern │   Pattern der aktuellen Pattern-Seite
//   ├────────┼────────┼────────┼────────┤
//   │Pattern │Seite › │ Pause  │Übernahme│  Übernahme: gedrückt halten (Schutz vor Versehen)
//   └────────┴────────┴────────┴────────┘
// Drehregler: Seite 1 Offset/Amplitude/Speed/Phase, Seite 2 Speed bis/Group/Reihenfolge/Pattern.
// Drücken setzt den Vorgabewert. Wischen auf dem Touchstreifen wechselt die Reglerseite.
import { MODI, type Modus } from "@parrafraktor/engine";
import type { ZahlParameter } from "@parrafraktor/protokoll";

export type Regler =
  | { art: "zahl"; name: ZahlParameter }
  | { art: "pattern" }
  | { art: "reihenfolge" };

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
    { art: "reihenfolge" },
    { art: "pattern" },
  ],
];

export const PATTERN_PRO_SEITE = 5;
export const PATTERN_SEITEN = Math.ceil(MODI.length / PATTERN_PRO_SEITE);
export const TASTE_SEITE = 5;
export const TASTE_PAUSE = 6;
export const TASTE_UEBERNAHME = 7;
export const UEBERNAHME_HALTEN_MS = 600;

export const patternAufTaste = (seite: number, taste: number): Modus | undefined =>
  taste < PATTERN_PRO_SEITE ? MODI[seite * PATTERN_PRO_SEITE + taste] : undefined;

export const patternSeiteVon = (modus: Modus): number => Math.floor(MODI.indexOf(modus) / PATTERN_PRO_SEITE);
