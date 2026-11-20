// WebSocket messages between server and client (JSON, path /ws).
//
// The server always sends the whole state – on every change and otherwise every second.
// So after a lost connection the client has nothing to catch up on: the first message after
// reconnecting is the complete state again.
//
// Field names and values of the messages ("typ", "stand", "uebernahme", …) are the protocol
// between server and cached clients: they stay German.
import {
  isMode, type ImpulseSettings, type RunningImpulse, type Mode, type Parameter,
} from "@parrafraktor/engine";
import type { Settings } from "./settings.js";
import { isNumericParameter, checkParameter, type NumericParameter } from "./parameter.js";
import { isPresetNumber, presetName, type AutoSettings, type Presets } from "./presets.js";

export const PROTOCOL_VERSION = 12;
export const WS_PATH = "/ws";
export const STATE_INTERVAL_MS = 1000;   // a state comes at least this often, even without a change

// aus: the MA drives · blendetEin/blendetAus: cross-fade running · an: the app drives
export type TakeoverState = "aus" | "blendetEin" | "an" | "blendetAus";

export interface Takeover {
  soll: boolean;
  zustand: TakeoverState;
  anteil: number;   // 0 = MA, 1 = app
}

export type ModuleKind = "ausgabe" | "eingabe" | "mitlesen";
// aus: switched off · bereit: running, waiting · aktiv: sending or device connected · fehler: problem
export type ModuleState = "aus" | "bereit" | "aktiv" | "fehler";

export interface ModuleStatus {
  name: string;
  art: ModuleKind;
  zustand: ModuleState;
  text: string;
}

export interface NetworkInterface {
  name: string;
  adresse: string;
}

export interface Tick {
  umlaufVon: number;
  umlauf: number[];
  // Flash: adapted tempo and pending kicks per mirror (missing with older servers)
  tempo?: number[];
  schub?: number[];
}

export interface State {
  typ: "stand";
  version: number;
  rev: number;          // counts up on every change
  parameter: Parameter;
  uebernahme: Takeover;
  einstellungen: Settings;
  module: ModuleStatus[];
  netzwerk: NetworkInterface[];
  // cycles of the engine (reference and per mirror), so the preview in the client runs in sync
  takt: Tick;
  presets: Presets;
  letztesPreset: number | null;   // last recalled, as long as the look was not changed
  // while a cross-fade to a preset runs: number of the cross-fade (counts up) and how far (0 … 1).
  // It fades from the positions at the moment of recalling to the new look.
  blende: { id: number; anteil: number } | null;
  blendeDauerS: number;           // duration of the running cross-fade: with Auto its own time
  // Auto: settings, whether it runs, and how long the current look has left
  auto: AutoSettings & { an: boolean; restS: number };
  // impulse settings, plus the ones running right now (times when sending)
  impuls: ImpulseSettings;
  impulse: RunningImpulse[];
  warnungen: string[];
}

export interface Pong {
  typ: "pong";
  t: number;
}

export type ServerMessage = State | Pong;

export type ClientMessage =
  | { typ: "setze"; parameter: Partial<Parameter> }
  | { typ: "pattern"; modus: Mode }
  | { typ: "vorgabe"; name: NumericParameter }
  | { typ: "uebernahme"; an: boolean }
  | { typ: "einstellungen"; einstellungen: unknown }   // the server checks it with checkSettings
  | { typ: "preset"; aktion: "abrufen" | "speichern" | "loeschen"; nr: number }
  | { typ: "preset"; aktion: "umbenennen"; nr: number; name: string }
  // Strip: start the selected impulse kind from the origin (0 = left … 1 = right).
  // wischen (swipe): runs through the whole element (width only applies to a tap)
  | { typ: "auto"; an: boolean }
  | { typ: "autoEinstellung"; einstellung: unknown }   // the server checks it with checkAuto
  | { typ: "impulsTippen"; ursprung: number; wischen: boolean }
  | { typ: "impulsEinstellung"; einstellung: unknown }   // the server checks it with checkImpulse
  | { typ: "ping"; t: number };

// Check a message from the client; null for anything unknown
export function parseClientMessage(text: string): ClientMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  switch (r.typ) {
    case "setze": return { typ: "setze", parameter: checkParameter(r.parameter) };
    case "pattern": return isMode(r.modus) ? { typ: "pattern", modus: r.modus } : null;
    case "vorgabe": return isNumericParameter(r.name) ? { typ: "vorgabe", name: r.name } : null;
    case "uebernahme": return typeof r.an === "boolean" ? { typ: "uebernahme", an: r.an } : null;
    case "einstellungen": return { typ: "einstellungen", einstellungen: r.einstellungen };
    case "preset": {
      if (!isPresetNumber(r.nr)) return null;
      if (r.aktion === "umbenennen") {
        const name = presetName(r.name, "");
        return name ? { typ: "preset", aktion: "umbenennen", nr: r.nr, name } : null;
      }
      if (r.aktion === "abrufen" || r.aktion === "speichern" || r.aktion === "loeschen") {
        return { typ: "preset", aktion: r.aktion, nr: r.nr };
      }
      return null;
    }
    case "auto": return typeof r.an === "boolean" ? { typ: "auto", an: r.an } : null;
    case "autoEinstellung": return { typ: "autoEinstellung", einstellung: r.einstellung };
    case "impulsTippen":
      return typeof r.ursprung === "number" && Number.isFinite(r.ursprung)
        ? { typ: "impulsTippen", ursprung: Math.min(1, Math.max(0, r.ursprung)), wischen: r.wischen === true }
        : null;
    case "impulsEinstellung": return { typ: "impulsEinstellung", einstellung: r.einstellung };
    case "ping": return typeof r.t === "number" ? { typ: "ping", t: r.t } : null;
    default: return null;
  }
}
