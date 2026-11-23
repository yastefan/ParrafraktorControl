// sACN (E1.31) with its own priority. The MA sends with 100; with 150 the app wins at the node.
// When releasing it sends three packets with "Stream Terminated", the node falls back to the MA at once.
// Packet layout as in the ESP32 remote (Parrafraktor-Remote/src/sacn.cpp).
import { createHash } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";
import { hostname } from "node:os";
import type { ModuleStatus, SacnSettings } from "@parrafraktor/protocol";
import { errorText } from "../log.js";
import type { Output } from "./output.js";

export const SACN_PORT = 5568;
export const SACN_NAME = "ParrafraktorControl";
const PACKET_LENGTH = 638;
const OPTION_TERMINATED = 0x40;

// CID: fixed per computer, so the node recognises the app after a restart
export const OWN_CID: Buffer = createHash("md5").update(`parrafraktor-control:${hostname()}`).digest();

export const multicastAddress = (universe: number): string => `239.255.${universe >> 8}.${universe & 0xff}`;

// PDU length with flags 0x7
const length = (p: Buffer, ab: number) => p.writeUInt16BE(0x7000 | (PACKET_LENGTH - ab), ab);

export function sacnPacket(universe: number, priority: number, cid: Buffer): Buffer {
  const p = Buffer.alloc(PACKET_LENGTH);
  // Root Layer
  p.writeUInt16BE(0x0010, 0);
  p.write("ASC-E1.17\0\0\0", 4, "latin1");
  length(p, 16);
  p.writeUInt32BE(0x00000004, 18);
  cid.copy(p, 22, 0, 16);
  // Framing Layer
  length(p, 38);
  p.writeUInt32BE(0x00000002, 40);
  p.write(SACN_NAME, 44, 63, "utf8");
  p[108] = priority;
  p.writeUInt16BE(universe, 113);
  // DMP Layer
  length(p, 115);
  p[117] = 0x02;
  p[118] = 0xa1;
  p.writeUInt16BE(1, 121);
  p.writeUInt16BE(513, 123);
  p[125] = 0;   // start code
  return p;
}

export class SacnOutput implements Output {
  readonly name = "sACN";
  private socket: Socket;
  private packets = new Map<number, Buffer>();
  private sequence = new Map<number, number>();
  private error = "";
  private sending = false;

  constructor(private readonly e: SacnSettings) {
    this.socket = createSocket({ type: "udp4", reuseAddr: true });
    this.socket.on("error", (err) => { this.error = errorText(err); });
    this.socket.bind({ address: e.quelle || undefined, port: 0 }, () => {
      if (e.quelle) this.socket.setMulticastInterface(e.quelle);
      this.socket.setMulticastTTL(8);
    });
  }

  send(universes: ReadonlyMap<number, Uint8Array>): void {
    this.sending = true;
    for (const [universe, data] of universes) {
      const p = this.packet(universe);
      p[112] = 0;
      p.set(data.subarray(0, 512), 126);
      this.transmit(universe, p);
    }
    // A universe no longer sent (e.g. light scene off): end its stream, the node takes the MA again
    for (const [universe, p] of this.packets) {
      if (universes.has(universe)) continue;
      p[112] = OPTION_TERMINATED;
      for (let i = 0; i < 3; i++) this.transmit(universe, p);
      this.packets.delete(universe);
    }
  }

  release(): void {
    if (!this.sending) return;
    this.sending = false;
    for (const [universe, p] of this.packets) {
      p[112] = OPTION_TERMINATED;
      for (let i = 0; i < 3; i++) this.transmit(universe, p);
    }
  }

  async close(): Promise<void> {
    this.release();
    await new Promise<void>((done) => this.socket.close(() => done()));
  }

  status(): ModuleStatus {
    if (this.error) return { name: this.name, art: "ausgabe", zustand: "fehler", text: this.error };
    const target = this.e.multicast ? "Multicast" : `Unicast to ${this.e.ziel || "?"}`;
    if (!this.e.multicast && !this.e.ziel) {
      return { name: this.name, art: "ausgabe", zustand: "fehler", text: "unicast without target IP" };
    }
    return {
      name: this.name,
      art: "ausgabe",
      zustand: this.sending ? "aktiv" : "bereit",
      text: `${target}, Priority ${this.e.priority}`,
    };
  }

  private packet(universe: number): Buffer {
    let p = this.packets.get(universe);
    if (!p) {
      p = sacnPacket(universe, this.e.priority, OWN_CID);
      this.packets.set(universe, p);
    }
    return p;
  }

  private transmit(universe: number, p: Buffer): void {
    const seq = ((this.sequence.get(universe) ?? 0) + 1) & 0xff;
    this.sequence.set(universe, seq);
    p[111] = seq;
    const target = this.e.multicast ? multicastAddress(universe) : this.e.ziel;
    if (!target) return;
    // copy, because send() is asynchronous and the packet is written again in the next tick
    this.socket.send(Buffer.from(p), SACN_PORT, target, (err) => {
      this.error = err ? errorText(err) : "";
    });
  }
}
