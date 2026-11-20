// Gemeinsame Schnittstelle aller Bedienungen, die am Server-Rechner hängen
// (Stream Deck+, später MIDI-Controller, OSC). Ein Modul bedient nur die Steuerung
// und zeigt deren Zustand an; es weiß nichts von Ausgaben oder Clients.
import type { ModuleStatus } from "@parrafraktor/protocol";

export interface Eingabemodul {
  readonly name: string;
  starte(): Promise<void>;
  schliesse(): Promise<void>;
  status(): ModuleStatus;
}
