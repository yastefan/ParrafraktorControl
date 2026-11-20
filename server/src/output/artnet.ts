// Art-Net 4: ArtDmx packets via UDP to port 6454, as broadcast or unicast to the node.
//
// Art-Net has no priority. If the MA runs in parallel, the node decides by merge (HTP/LTP)
// who wins. When releasing, the app only stops sending; depending on the node the last
// position stays for a few seconds until it drops the source. Clean switching works with sACN.
import { createSocket, type Socket } from "node:dgram";
import type { ArtnetSettings, ModuleStatus } from "@parrafraktor/protocol";
import { errorText } from "../log.js";
import type { Output } from "./output.js";

export const ARTNET_PORT = 6454;
const OP_DMX = 0x5000;
const PROTOCOL = 14;

// ArtDmx packet for a port address (15 bit: net, sub-net, universe)
export function artDmx(portAddress: number, sequence: number, data: Uint8Array): Buffer {
  const packet = Buffer.alloc(18 + 512);
  packet.write("Art-Net\0", 0, "latin1");
  packet.writeUInt16LE(OP_DMX, 8);
  packet.writeUInt16BE(PROTOCOL, 10);
  packet[12] = sequence;
  packet[13] = 0;                          // Physical
  packet[14] = portAddress & 0xff;         // SubUni
  packet[15] = (portAddress >> 8) & 0x7f;  // Net
  packet.writeUInt16BE(512, 16);
  packet.set(data.subarray(0, 512), 18);
  return packet;
}

export class ArtnetOutput implements Output {
  readonly name = "Art-Net";
  private socket: Socket;
  private sequence = 0;
  private error = "";
  private sending = false;

  constructor(private readonly e: ArtnetSettings) {
    this.socket = createSocket({ type: "udp4", reuseAddr: true });
    this.socket.on("error", (err) => { this.error = errorText(err); });
    this.socket.bind({ address: e.quelle || undefined, port: 0 }, () => {
      this.socket.setBroadcast(true);
    });
  }

  send(universes: ReadonlyMap<number, Uint8Array>): void {
    this.sequence = (this.sequence % 255) + 1;   // 0 would mean "no sequence"
    this.sending = true;
    for (const [universe, data] of universes) {
      const portAddress = universe + this.e.versatz;
      if (portAddress < 0 || portAddress > 0x7fff) continue;
      this.socket.send(artDmx(portAddress, this.sequence, data), ARTNET_PORT, this.e.ziel, (err) => {
        this.error = err ? errorText(err) : "";
      });
    }
  }

  release(): void {
    this.sending = false;   // Art-Net has no "stream terminated": just stop sending
  }

  async close(): Promise<void> {
    await new Promise<void>((done) => this.socket.close(() => done()));
  }

  status(): ModuleStatus {
    if (this.error) return { name: this.name, art: "ausgabe", zustand: "fehler", text: this.error };
    return {
      name: this.name,
      art: "ausgabe",
      zustand: this.sending ? "aktiv" : "bereit",
      text: `to ${this.e.ziel}${this.e.quelle ? ` via ${this.e.quelle}` : ""}`,
    };
  }
}
