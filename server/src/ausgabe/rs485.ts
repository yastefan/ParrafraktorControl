// DMX512 über RS485 an der seriellen Schnittstelle des Raspberry Pi – noch nicht umgesetzt.
//
// Geplant: UART (/dev/serial0) mit 250 000 Baud, 8N2, davor ein RS485-Transceiver
// (z. B. MAX485 oder ein fertiger DMX-HAT). Jedes Paket beginnt mit Break (≥ 88 µs) und
// Mark-after-Break (≥ 8 µs), dann Startcode 0 und 512 Kanäle. Den Break erzeugt man am Pi
// am einfachsten, indem man kurz mit niedriger Baudrate eine 0 sendet.
// Nur ein Universe pro Ausgang: gesendet wird das Universe des ersten Elements.
import type { ModulStatus, Rs485Einstellungen } from "@parrafraktor/protokoll";
import type { Ausgabe } from "./ausgabe.js";

export class Rs485Ausgabe implements Ausgabe {
  readonly name = "DMX RS485";

  constructor(private readonly e: Rs485Einstellungen) {}

  sende(): void {}

  gibFrei(): void {}

  async schliesse(): Promise<void> {}

  status(): ModulStatus {
    return { name: this.name, art: "ausgabe", zustand: "fehler", text: `${this.e.geraet}: noch nicht umgesetzt` };
  }
}
