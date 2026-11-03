// Liest mit, was die MA gerade an die Spiegel schickt (sACN und/oder Art-Net im selben Netz).
// Das braucht nur die Überblendung: beim Übernehmen startet sie bei der Stellung der MA,
// beim Abgeben endet sie dort. Liest die App nichts mit, springen die Spiegel wie bisher.
//
// Grenzen: Art-Net per Unicast von der MA an den Node kommt hier nicht an, nur Broadcast.
import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { leseStellungen, patchUniversen, type Stellung } from "@parrafraktor/engine";
import type { Einstellungen, ModulStatus } from "@parrafraktor/protokoll";
import { ARTNET_PORT } from "./ausgabe/artnet.js";
import { EIGENE_CID, SACN_PORT, multicastAdresse } from "./ausgabe/sacn.js";
import { fehlerText, log } from "./log.js";

const FRISCH_MS = 2500;   // so lange gilt ein empfangenes Universe als aktuell

interface Empfangen {
  daten: Uint8Array;
  zeit: number;
}

const eigeneAdressen = (): Set<string> =>
  new Set(Object.values(networkInterfaces()).flatMap((l) => (l ?? []).map((a) => a.address)));

export class Mitlesen {
  private sockets: Socket[] = [];
  private empfangen = new Map<number, Empfangen>();
  private fehler = "";
  private eigene = eigeneAdressen();

  constructor(private readonly e: Einstellungen) {
    const universen = patchUniversen(e.patch);
    if (e.sacn.an) this.lauscheSacn(universen);
    if (e.artnet.an) this.lauscheArtnet();
  }

  // Stellungen der MA, wenn alle Universen des Patches frisch empfangen wurden, sonst null
  stellungen(rotateMaxUpm = this.e.rotateMaxUpm): Stellung[] | null {
    const jetzt = Date.now();
    const frisch = new Map<number, Uint8Array>();
    for (const [u, { daten, zeit }] of this.empfangen) if (jetzt - zeit < FRISCH_MS) frisch.set(u, daten);
    return leseStellungen(frisch, this.e.patch, rotateMaxUpm);
  }

  status(): ModulStatus {
    const name = "MA mitlesen";
    if (this.fehler) return { name, art: "mitlesen", zustand: "fehler", text: this.fehler };
    if (!this.sockets.length) return { name, art: "mitlesen", zustand: "aus", text: "keine Ausgabe aktiv" };
    return this.stellungen()
      ? { name, art: "mitlesen", zustand: "aktiv", text: "Stellung der MA bekannt, Überblendung möglich" }
      : { name, art: "mitlesen", zustand: "bereit", text: "nichts empfangen – beim Übernehmen springen die Spiegel" };
  }

  async schliesse(): Promise<void> {
    await Promise.all(this.sockets.map((s) => new Promise<void>((fertig) => s.close(() => fertig()))));
    this.sockets = [];
  }

  private socket(port: number, beiPaket: (p: Buffer, von: string) => void, gebunden?: (s: Socket) => void): void {
    const s = createSocket({ type: "udp4", reuseAddr: true });
    s.on("error", (err) => {
      this.fehler = fehlerText(err);
      log("mitlesen", `Port ${port}: ${this.fehler}`);
    });
    s.on("message", (p, info) => beiPaket(p, info.address));
    s.bind(port, () => gebunden?.(s));
    this.sockets.push(s);
  }

  private merke(universe: number, daten: Uint8Array): void {
    this.empfangen.set(universe, { daten: new Uint8Array(daten), zeit: Date.now() });
  }

  private lauscheSacn(universen: number[]): void {
    this.socket(
      SACN_PORT,
      (p) => {
        if (p.length < 126 || p.toString("latin1", 4, 13) !== "ASC-E1.17") return;
        if (p.subarray(22, 38).equals(EIGENE_CID)) return;         // eigene Pakete
        if (p[112]! & 0xc0) return;                                // Preview oder Terminated
        if (p[125] !== 0) return;                                  // nur Startcode 0
        const universe = p.readUInt16BE(113);
        if (!universen.includes(universe)) return;
        const anzahl = Math.min(512, p.readUInt16BE(123) - 1);
        this.merke(universe, p.subarray(126, 126 + anzahl));
      },
      (s) => {
        for (const u of universen) {
          try {
            s.addMembership(multicastAdresse(u), this.e.sacn.quelle || undefined);
          } catch (err) {
            this.fehler = `Multicast ${multicastAdresse(u)}: ${fehlerText(err)}`;
          }
        }
      },
    );
  }

  private lauscheArtnet(): void {
    const versatz = this.e.artnet.versatz;
    this.socket(ARTNET_PORT, (p, von) => {
      if (p.length < 18 || p.toString("latin1", 0, 8) !== "Art-Net\0") return;
      if (p.readUInt16LE(8) !== 0x5000) return;                    // nur ArtDmx
      if (this.eigene.has(von)) return;                            // eigene Pakete
      const portAdresse = (p[15]! << 8) | p[14]!;
      const anzahl = Math.min(512, p.readUInt16BE(16));
      this.merke(portAdresse - versatz, p.subarray(18, 18 + anzahl));
    });
  }
}
