// Listens to what the MA is sending to the mirrors right now (sACN and/or Art-Net in the same network).
// Only the cross-fade needs it: on takeover it starts at the MA's position, on release it ends
// there. If the app hears nothing, the mirrors jump as before.
//
// Limits: Art-Net sent by unicast from the MA to the node does not arrive here, only broadcast.
import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { readPositions, patchUniverses, type Position } from "@parrafraktor/engine";
import type { Settings, ModuleStatus } from "@parrafraktor/protocol";
import { ARTNET_PORT } from "./output/artnet.js";
import { OWN_CID, SACN_PORT, multicastAddress } from "./output/sacn.js";
import { errorText, log } from "./log.js";

const FRESH_MS = 2500;   // a received universe counts as current this long

interface Received {
  data: Uint8Array;
  time: number;
}

const ownAddresses = (): Set<string> =>
  new Set(Object.values(networkInterfaces()).flatMap((l) => (l ?? []).map((a) => a.address)));

export class MaListener {
  private sockets: Socket[] = [];
  private received = new Map<number, Received>();
  private error = "";
  // Own addresses, refreshed every few seconds: on the Pi the fixed IP often comes after the server start
  private own = ownAddresses();
  private ownCheckedAt = Date.now();

  constructor(private readonly e: Settings) {
    const universes = patchUniverses(e.patch);
    if (e.sacn.an) this.listenSacn(universes);
    if (e.artnet.an) this.listenArtnet();
  }

  // Positions of the MA if all universes of the patch were received recently, otherwise null
  positions(rotateMaxRpm = this.e.rotateMaxUpm): Position[] | null {
    const now = Date.now();
    const fresh = new Map<number, Uint8Array>();
    for (const [u, { data, time }] of this.received) if (now - time < FRESH_MS) fresh.set(u, data);
    return readPositions(fresh, this.e.patch, rotateMaxRpm);
  }

  status(): ModuleStatus {
    const name = "Read MA";
    if (this.error) return { name, art: "mitlesen", zustand: "fehler", text: this.error };
    if (!this.sockets.length) return { name, art: "mitlesen", zustand: "aus", text: "no output active" };
    return this.positions()
      ? { name, art: "mitlesen", zustand: "aktiv", text: "MA position known, crossfade possible" }
      : { name, art: "mitlesen", zustand: "bereit", text: "nothing received – mirrors jump when the output takes over" };
  }

  async close(): Promise<void> {
    await Promise.all(this.sockets.map((s) => new Promise<void>((done) => s.close(() => done()))));
    this.sockets = [];
  }

  private socket(port: number, onPacket: (p: Buffer, from: string) => void, bound?: (s: Socket) => void): void {
    const s = createSocket({ type: "udp4", reuseAddr: true });
    s.on("error", (err) => {
      this.error = errorText(err);
      log("ma-listener", `Port ${port}: ${this.error}`);
    });
    s.on("message", (p, info) => onPacket(p, info.address));
    s.bind(port, () => bound?.(s));
    this.sockets.push(s);
  }

  private isOwn(address: string): boolean {
    if (!this.own.has(address) && Date.now() - this.ownCheckedAt > 5000) {
      this.own = ownAddresses();
      this.ownCheckedAt = Date.now();
    }
    return this.own.has(address);
  }

  private remember(universe: number, data: Uint8Array): void {
    this.received.set(universe, { data: new Uint8Array(data), time: Date.now() });
  }

  private listenSacn(universes: number[]): void {
    this.socket(
      SACN_PORT,
      (p) => {
        if (p.length < 126 || p.toString("latin1", 4, 13) !== "ASC-E1.17") return;
        if (p.subarray(22, 38).equals(OWN_CID)) return;         // own packets
        if (p[112]! & 0xc0) return;                                // preview or terminated
        if (p[125] !== 0) return;                                  // only start code 0
        const universe = p.readUInt16BE(113);
        if (!universes.includes(universe)) return;
        const count = Math.min(512, p.readUInt16BE(123) - 1);
        this.remember(universe, p.subarray(126, 126 + count));
      },
      (s) => {
        for (const u of universes) {
          try {
            s.addMembership(multicastAddress(u), this.e.sacn.quelle || undefined);
          } catch (err) {
            this.error = `Multicast ${multicastAddress(u)}: ${errorText(err)}`;
          }
        }
      },
    );
  }

  private listenArtnet(): void {
    const offset = this.e.artnet.versatz;
    this.socket(ARTNET_PORT, (p, from) => {
      if (p.length < 18 || p.toString("latin1", 0, 8) !== "Art-Net\0") return;
      if (p.readUInt16LE(8) !== 0x5000) return;                    // only ArtDmx
      if (this.isOwn(from)) return;                             // own packets
      const portAddress = (p[15]! << 8) | p[14]!;
      const count = Math.min(512, p.readUInt16BE(16));
      this.remember(portAddress - offset, p.subarray(18, 18 + count));
    });
  }
}
