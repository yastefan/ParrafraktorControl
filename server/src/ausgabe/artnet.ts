// Art-Net 4: ArtDmx-Pakete per UDP an Port 6454, als Broadcast oder Unicast an den Node.
//
// Art-Net kennt keine Priority. Läuft die MA parallel, entscheidet der Node per Merge (HTP/LTP),
// wer gewinnt. Beim Abgeben hört die App nur auf zu senden; je nach Node bleibt die letzte
// Stellung einige Sekunden stehen, bis er die Quelle verwirft. Sauberes Umschalten geht mit sACN.
import { createSocket, type Socket } from "node:dgram";
import type { ArtnetEinstellungen, ModulStatus } from "@parrafraktor/protokoll";
import { fehlerText } from "../log.js";
import type { Ausgabe } from "./ausgabe.js";

export const ARTNET_PORT = 6454;
const OP_DMX = 0x5000;
const PROTOKOLL = 14;

// ArtDmx-Paket für eine Port-Address (15 Bit: Net, Sub-Net, Universe)
export function artDmx(portAdresse: number, sequenz: number, daten: Uint8Array): Buffer {
  const paket = Buffer.alloc(18 + 512);
  paket.write("Art-Net\0", 0, "latin1");
  paket.writeUInt16LE(OP_DMX, 8);
  paket.writeUInt16BE(PROTOKOLL, 10);
  paket[12] = sequenz;
  paket[13] = 0;                          // Physical
  paket[14] = portAdresse & 0xff;         // SubUni
  paket[15] = (portAdresse >> 8) & 0x7f;  // Net
  paket.writeUInt16BE(512, 16);
  paket.set(daten.subarray(0, 512), 18);
  return paket;
}

export class ArtnetAusgabe implements Ausgabe {
  readonly name = "Art-Net";
  private socket: Socket;
  private sequenz = 0;
  private fehler = "";
  private sendet = false;

  constructor(private readonly e: ArtnetEinstellungen) {
    this.socket = createSocket({ type: "udp4", reuseAddr: true });
    this.socket.on("error", (err) => { this.fehler = fehlerText(err); });
    this.socket.bind({ address: e.quelle || undefined, port: 0 }, () => {
      this.socket.setBroadcast(true);
    });
  }

  sende(universen: ReadonlyMap<number, Uint8Array>): void {
    this.sequenz = (this.sequenz % 255) + 1;   // 0 hieße "ohne Sequenz"
    this.sendet = true;
    for (const [universe, daten] of universen) {
      const portAdresse = universe + this.e.versatz;
      if (portAdresse < 0 || portAdresse > 0x7fff) continue;
      this.socket.send(artDmx(portAdresse, this.sequenz, daten), ARTNET_PORT, this.e.ziel, (err) => {
        this.fehler = err ? fehlerText(err) : "";
      });
    }
  }

  gibFrei(): void {
    this.sendet = false;   // Art-Net hat kein "Stream beendet": einfach nicht mehr senden
  }

  async schliesse(): Promise<void> {
    await new Promise<void>((fertig) => this.socket.close(() => fertig()));
  }

  status(): ModulStatus {
    if (this.fehler) return { name: this.name, art: "ausgabe", zustand: "fehler", text: this.fehler };
    return {
      name: this.name,
      art: "ausgabe",
      zustand: this.sendet ? "aktiv" : "bereit",
      text: `an ${this.e.ziel}${this.e.quelle ? ` über ${this.e.quelle}` : ""}`,
    };
  }
}
