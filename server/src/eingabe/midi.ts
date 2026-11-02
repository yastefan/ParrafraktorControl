// MIDI-Controller – Platzhalter.
//
// Geplant: Controller per USB-MIDI (z. B. mit dem Paket "@julusian/midi"), Zuordnung aus einer
// Datei im Datenverzeichnis: CC → verstelle(name, …) bzw. absolute Werte über BEREICHE,
// Noten → waehlePattern / schalteLauf / setzeUebernahme. Rückmeldung (LEDs, Motorfader) über
// das Ereignis "aenderung" der Steuerung.
import type { ModulStatus } from "@parrafraktor/protokoll";
import type { Steuerung } from "../steuerung.js";
import type { Eingabemodul } from "./eingabe.js";

export class MidiModul implements Eingabemodul {
  readonly name = "MIDI";

  constructor(readonly steuerung: Steuerung) {}

  async starte(): Promise<void> {}

  async schliesse(): Promise<void> {}

  status(): ModulStatus {
    return { name: this.name, art: "eingabe", zustand: "aus", text: "noch nicht umgesetzt" };
  }
}
