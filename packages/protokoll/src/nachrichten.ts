// WebSocket-Nachrichten zwischen Server und Client (JSON, Pfad /ws).
//
// Der Server schickt immer den ganzen Stand – bei jeder Änderung und sonst jede Sekunde.
// Der Client braucht dadurch nach einem Verbindungsabbruch nichts nachzuholen: Die erste
// Nachricht nach dem Wiederverbinden ist wieder der vollständige Stand.
import { istModus, type Modus, type Parameter } from "@parrafraktor/engine";
import type { Einstellungen } from "./einstellungen.js";
import { istZahlParameter, pruefeParameter, type ZahlParameter } from "./parameter.js";
import { istPresetNr, presetName, type Presets } from "./presets.js";

export const PROTOKOLL_VERSION = 3;
export const WS_PFAD = "/ws";
export const STAND_INTERVALL_MS = 1000;   // spätestens so oft kommt ein Stand, auch ohne Änderung

// aus: die MA fährt · blendetEin/blendetAus: Überblendung läuft · an: die App fährt
export type UebernahmeZustand = "aus" | "blendetEin" | "an" | "blendetAus";

export interface Uebernahme {
  soll: boolean;
  zustand: UebernahmeZustand;
  anteil: number;   // 0 = MA, 1 = App
}

export type ModulArt = "ausgabe" | "eingabe" | "mitlesen";
// aus: abgeschaltet · bereit: läuft, wartet · aktiv: sendet bzw. Gerät verbunden · fehler: Problem
export type ModulZustand = "aus" | "bereit" | "aktiv" | "fehler";

export interface ModulStatus {
  name: string;
  art: ModulArt;
  zustand: ModulZustand;
  text: string;
}

export interface Netzwerkschnittstelle {
  name: string;
  adresse: string;
}

export interface Takt {
  umlaufVon: number;
  umlauf: number[];
}

export interface Stand {
  typ: "stand";
  version: number;
  rev: number;          // zählt bei jeder Änderung hoch
  parameter: Parameter;
  uebernahme: Uebernahme;
  einstellungen: Einstellungen;
  module: ModulStatus[];
  netzwerk: Netzwerkschnittstelle[];
  // Umlauf der Engine (Bezug und je Spiegel), damit die Vorschau im Client synchron läuft
  takt: Takt;
  presets: Presets;
  letztesPreset: number | null;   // zuletzt abgerufen, solange der Look nicht verändert wurde
  // läuft gerade eine Überblendung zu einem Preset: Nummer der Überblendung (zählt hoch) und wie weit (0 … 1).
  // Überblendet wird von der Stellung im Moment des Abrufens zum neuen Look.
  blende: { id: number; anteil: number } | null;
  warnungen: string[];
}

export interface Pong {
  typ: "pong";
  t: number;
}

export type ServerNachricht = Stand | Pong;

export type ClientNachricht =
  | { typ: "setze"; parameter: Partial<Parameter> }
  | { typ: "pattern"; modus: Modus }
  | { typ: "vorgabe"; name: ZahlParameter }
  | { typ: "uebernahme"; an: boolean }
  | { typ: "einstellungen"; einstellungen: unknown }   // prüft der Server mit pruefeEinstellungen
  | { typ: "preset"; aktion: "abrufen" | "speichern" | "loeschen"; nr: number }
  | { typ: "preset"; aktion: "umbenennen"; nr: number; name: string }
  | { typ: "ping"; t: number };

// Nachricht vom Client prüfen; null bei allem Unbekannten
export function leseClientNachricht(text: string): ClientNachricht | null {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof roh !== "object" || roh === null) return null;
  const r = roh as Record<string, unknown>;
  switch (r.typ) {
    case "setze": return { typ: "setze", parameter: pruefeParameter(r.parameter) };
    case "pattern": return istModus(r.modus) ? { typ: "pattern", modus: r.modus } : null;
    case "vorgabe": return istZahlParameter(r.name) ? { typ: "vorgabe", name: r.name } : null;
    case "uebernahme": return typeof r.an === "boolean" ? { typ: "uebernahme", an: r.an } : null;
    case "einstellungen": return { typ: "einstellungen", einstellungen: r.einstellungen };
    case "preset": {
      if (!istPresetNr(r.nr)) return null;
      if (r.aktion === "umbenennen") {
        const name = presetName(r.name, "");
        return name ? { typ: "preset", aktion: "umbenennen", nr: r.nr, name } : null;
      }
      if (r.aktion === "abrufen" || r.aktion === "speichern" || r.aktion === "loeschen") {
        return { typ: "preset", aktion: r.aktion, nr: r.nr };
      }
      return null;
    }
    case "ping": return typeof r.t === "number" ? { typ: "ping", t: r.t } : null;
    default: return null;
  }
}
