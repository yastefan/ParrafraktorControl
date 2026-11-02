// OSC – Platzhalter.
//
// Geplant: UDP-Port (z. B. 8000) mit Adressen wie /parrafraktor/pattern <name>,
// /parrafraktor/offset <grad>, /parrafraktor/uebernahme <0|1>. Werte laufen über
// pruefeParameter bzw. die Aktionen der Steuerung, damit dieselben Grenzen gelten wie überall.
import type { ModulStatus } from "@parrafraktor/protokoll";
import type { Steuerung } from "../steuerung.js";
import type { Eingabemodul } from "./eingabe.js";

export class OscModul implements Eingabemodul {
  readonly name = "OSC";

  constructor(readonly steuerung: Steuerung) {}

  async starte(): Promise<void> {}

  async schliesse(): Promise<void> {}

  status(): ModulStatus {
    return { name: this.name, art: "eingabe", zustand: "aus", text: "noch nicht umgesetzt" };
  }
}
