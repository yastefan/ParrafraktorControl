// Gemeinsame Schnittstelle aller Bedienungen, die am Server-Rechner hängen
// (Stream Deck+, später MIDI-Controller, OSC). Ein Modul bedient nur die Steuerung
// und zeigt deren Zustand an; es weiß nichts von Ausgaben oder Clients.
import type { ModulStatus } from "@parrafraktor/protokoll";

export interface Eingabemodul {
  readonly name: string;
  starte(): Promise<void>;
  schliesse(): Promise<void>;
  status(): ModulStatus;
}
