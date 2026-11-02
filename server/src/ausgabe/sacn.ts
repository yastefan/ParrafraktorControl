// sACN (E1.31) mit eigener Priority. Die MA sendet mit 100; mit 150 gewinnt die App am Node.
// Beim Abgeben schickt sie drei Pakete mit "Stream Terminated", der Node fällt sofort auf die MA zurück.
// Aufbau des Pakets wie in der ESP32-Remote (Parrafraktor-Remote/src/sacn.cpp).
import { createHash } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";
import { hostname } from "node:os";
import type { ModulStatus, SacnEinstellungen } from "@parrafraktor/protokoll";
import { fehlerText } from "../log.js";
import type { Ausgabe } from "./ausgabe.js";

export const SACN_PORT = 5568;
export const SACN_NAME = "ParrafraktorControl";
const PAKET_LAENGE = 638;
const OPTION_TERMINATED = 0x40;

// CID: fest je Rechner, damit der Node die App nach einem Neustart wiedererkennt
export const EIGENE_CID: Buffer = createHash("md5").update(`parrafraktor-control:${hostname()}`).digest();

export const multicastAdresse = (universe: number): string => `239.255.${universe >> 8}.${universe & 0xff}`;

// PDU-Länge mit Flags 0x7
const laenge = (p: Buffer, ab: number) => p.writeUInt16BE(0x7000 | (PAKET_LAENGE - ab), ab);

export function sacnPaket(universe: number, priority: number, cid: Buffer): Buffer {
  const p = Buffer.alloc(PAKET_LAENGE);
  // Root Layer
  p.writeUInt16BE(0x0010, 0);
  p.write("ASC-E1.17\0\0\0", 4, "latin1");
  laenge(p, 16);
  p.writeUInt32BE(0x00000004, 18);
  cid.copy(p, 22, 0, 16);
  // Framing Layer
  laenge(p, 38);
  p.writeUInt32BE(0x00000002, 40);
  p.write(SACN_NAME, 44, 63, "utf8");
  p[108] = priority;
  p.writeUInt16BE(universe, 113);
  // DMP Layer
  laenge(p, 115);
  p[117] = 0x02;
  p[118] = 0xa1;
  p.writeUInt16BE(1, 121);
  p.writeUInt16BE(513, 123);
  p[125] = 0;   // Startcode
  return p;
}

export class SacnAusgabe implements Ausgabe {
  readonly name = "sACN";
  private socket: Socket;
  private pakete = new Map<number, Buffer>();
  private sequenz = new Map<number, number>();
  private fehler = "";
  private sendet = false;

  constructor(private readonly e: SacnEinstellungen) {
    this.socket = createSocket({ type: "udp4", reuseAddr: true });
    this.socket.on("error", (err) => { this.fehler = fehlerText(err); });
    this.socket.bind({ address: e.quelle || undefined, port: 0 }, () => {
      if (e.quelle) this.socket.setMulticastInterface(e.quelle);
      this.socket.setMulticastTTL(8);
    });
  }

  sende(universen: ReadonlyMap<number, Uint8Array>): void {
    this.sendet = true;
    for (const [universe, daten] of universen) {
      const p = this.paket(universe);
      p[112] = 0;
      p.set(daten.subarray(0, 512), 126);
      this.schicke(universe, p);
    }
  }

  gibFrei(): void {
    if (!this.sendet) return;
    this.sendet = false;
    for (const [universe, p] of this.pakete) {
      p[112] = OPTION_TERMINATED;
      for (let i = 0; i < 3; i++) this.schicke(universe, p);
    }
  }

  async schliesse(): Promise<void> {
    this.gibFrei();
    await new Promise<void>((fertig) => this.socket.close(() => fertig()));
  }

  status(): ModulStatus {
    if (this.fehler) return { name: this.name, art: "ausgabe", zustand: "fehler", text: this.fehler };
    const ziel = this.e.multicast ? "Multicast" : `Unicast an ${this.e.ziel || "?"}`;
    if (!this.e.multicast && !this.e.ziel) {
      return { name: this.name, art: "ausgabe", zustand: "fehler", text: "Unicast ohne Ziel-IP" };
    }
    return {
      name: this.name,
      art: "ausgabe",
      zustand: this.sendet ? "aktiv" : "bereit",
      text: `${ziel}, Priority ${this.e.priority}`,
    };
  }

  private paket(universe: number): Buffer {
    let p = this.pakete.get(universe);
    if (!p) {
      p = sacnPaket(universe, this.e.priority, EIGENE_CID);
      this.pakete.set(universe, p);
    }
    return p;
  }

  private schicke(universe: number, p: Buffer): void {
    const seq = ((this.sequenz.get(universe) ?? 0) + 1) & 0xff;
    this.sequenz.set(universe, seq);
    p[111] = seq;
    const ziel = this.e.multicast ? multicastAdresse(universe) : this.e.ziel;
    if (!ziel) return;
    // Kopie, weil send() asynchron ist und das Paket im nächsten Takt schon wieder beschrieben wird
    this.socket.send(Buffer.from(p), SACN_PORT, ziel, (err) => {
      this.fehler = err ? fehlerText(err) : "";
    });
  }
}
