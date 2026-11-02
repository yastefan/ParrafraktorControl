// Gemeinsame Schnittstelle aller DMX-Ausgaben (Art-Net, sACN, später RS485 am Raspberry Pi).
// Der Takt ruft sende() rund 40-mal pro Sekunde auf, solange die App die Spiegel fährt,
// und gibFrei() einmal, wenn sie an die MA zurückgibt.
import type { ModulStatus } from "@parrafraktor/protokoll";

export interface Ausgabe {
  readonly name: string;
  // universen: Universe (1 …) → 512 Kanäle
  sende(universen: ReadonlyMap<number, Uint8Array>): void;
  // Übernahme beendet: die Spiegel wieder der MA überlassen
  gibFrei(): void;
  schliesse(): Promise<void>;
  status(): ModulStatus;
}
