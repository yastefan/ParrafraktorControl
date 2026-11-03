// HTTP(S) für den PWA-Client und WebSocket (/ws) für den Stand.
//
// Für ein wackliges WLAN: Die gebauten Dateien unter /assets/ tragen einen Hash im Namen und
// werden ein Jahr gecacht; index.html, Service Worker und Manifest werden immer neu geprüft
// (ETag, meist 304). Den Rest erledigt der Service Worker im Client.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer as http, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as https } from "node:https";
import { extname, join, normalize, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { STAND_INTERVALL_MS, WS_PFAD, leseClientNachricht, type ClientNachricht, type ServerNachricht, type Stand } from "@parrafraktor/protokoll";
import { log } from "../log.js";
import type { Steuerung } from "../steuerung.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

const SENDEN_MS = 50;           // Änderungen höchstens 20-mal pro Sekunde verschicken
const HERZSCHLAG_MS = 10_000;   // tote Verbindungen (z. B. iPad im Ruhezustand) erkennen

export interface WebOptionen {
  port: number;
  clientVerzeichnis: string;
  tls?: { cert: string; key: string };
}

export class WebServer {
  private server: Server;
  private wss: WebSocketServer;
  private sendeTimer: NodeJS.Timeout | undefined;
  private intervall: NodeJS.Timeout | undefined;
  private herzschlag: NodeJS.Timeout | undefined;
  private lebendig = new WeakSet<WebSocket>();
  private readonly beiAenderung = () => this.sendeBald();

  constructor(
    private readonly o: WebOptionen,
    private readonly steuerung: Steuerung,
    private readonly stand: () => Stand,
  ) {
    const anfrage = (req: IncomingMessage, res: ServerResponse) => this.datei(req, res);
    this.server = o.tls
      ? https({ cert: readFileSync(o.tls.cert), key: readFileSync(o.tls.key) }, anfrage)
      : http(anfrage);
    this.wss = new WebSocketServer({ server: this.server, path: WS_PFAD, maxPayload: 64 * 1024 });
    this.wss.on("connection", (ws) => this.verbunden(ws));
  }

  get anzahlClients(): number {
    return this.wss.clients.size;
  }

  async starte(): Promise<void> {
    await new Promise<void>((fertig, fehler) => {
      this.server.once("error", fehler);
      this.server.listen(this.o.port, () => fertig());
    });
    this.steuerung.on("aenderung", this.beiAenderung);
    // Auch ohne Änderung regelmäßig senden: Takt für die Vorschau und Lebenszeichen für den Client
    this.intervall = setInterval(() => this.sendeAlle(), STAND_INTERVALL_MS);
    this.herzschlag = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (!this.lebendig.has(ws)) { ws.terminate(); continue; }
        this.lebendig.delete(ws);
        ws.ping();
      }
    }, HERZSCHLAG_MS);
    const art = this.o.tls ? "https" : "http";
    log("web", `${art}://0.0.0.0:${this.o.port}${this.o.tls ? "" : " (ohne HTTPS kein Offline-Cache auf dem iPad)"}`);
  }

  async schliesse(): Promise<void> {
    this.steuerung.off("aenderung", this.beiAenderung);
    clearTimeout(this.sendeTimer);
    clearInterval(this.intervall);
    clearInterval(this.herzschlag);
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((fertig) => this.wss.close(() => fertig()));
    await new Promise<void>((fertig) => this.server.close(() => fertig()));
  }

  // ---------- WebSocket ----------

  private verbunden(ws: WebSocket): void {
    this.lebendig.add(ws);
    ws.on("pong", () => this.lebendig.add(ws));
    ws.on("message", (daten, binaer) => {
      if (binaer) return;
      const n = leseClientNachricht(daten.toString());
      if (n) this.verarbeite(ws, n);
    });
    ws.on("error", () => ws.terminate());
    this.schicke(ws, this.stand());
    this.steuerung.geaendert();   // Anzahl der Clients hat sich geändert
    ws.on("close", () => this.steuerung.geaendert());
  }

  private verarbeite(ws: WebSocket, n: ClientNachricht): void {
    const s = this.steuerung;
    switch (n.typ) {
      case "setze": s.setze(n.parameter); break;
      case "pattern": s.waehlePattern(n.modus); break;
      case "vorgabe": s.vorgabe(n.name); break;
      case "uebernahme": s.setzeUebernahme(n.an); break;
      case "einstellungen": s.setzeEinstellungen(n.einstellungen); break;
      case "preset":
        switch (n.aktion) {
          case "abrufen": s.rufePresetAuf(n.nr); break;
          case "speichern": s.speicherePreset(n.nr); break;
          case "loeschen": s.loeschePreset(n.nr); break;
          case "umbenennen": s.benennePreset(n.nr, n.name); break;
        }
        break;
      case "ping": this.schicke(ws, { typ: "pong", t: n.t }); break;
    }
  }

  private sendeBald(): void {
    if (this.sendeTimer) return;
    this.sendeTimer = setTimeout(() => {
      this.sendeTimer = undefined;
      this.sendeAlle();
    }, SENDEN_MS);
  }

  private sendeAlle(): void {
    if (!this.wss.clients.size) return;
    const text = JSON.stringify(this.stand());
    for (const ws of this.wss.clients) {
      // Hängt ein Client (schlechtes WLAN), nicht weiter aufstauen: der nächste Stand ersetzt alles
      if (ws.readyState === ws.OPEN && ws.bufferedAmount < 256 * 1024) ws.send(text);
    }
  }

  private schicke(ws: WebSocket, n: ServerNachricht): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(n));
  }

  // ---------- Dateien ----------

  private datei(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const pfad = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const wurzel = this.o.clientVerzeichnis;
    let datei = normalize(join(wurzel, pfad));
    if (!datei.startsWith(wurzel + sep) && datei !== wurzel) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(datei) || statSync(datei).isDirectory()) {
      // Unbekannte Pfade ohne Endung landen in der App, alles andere ist 404
      if (extname(pfad)) {
        res.writeHead(404).end();
        return;
      }
      datei = join(wurzel, "index.html");
      if (!existsSync(datei)) {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" })
          .end("Client ist nicht gebaut: npm run build");
        return;
      }
    }
    const inhalt = readFileSync(datei);
    const etag = `"${createHash("sha1").update(inhalt).digest("base64url")}"`;
    const unveraenderlich = pfad.startsWith("/assets/");
    res.setHeader("content-type", MIME[extname(datei)] ?? "application/octet-stream");
    res.setHeader("etag", etag);
    res.setHeader("cache-control", unveraenderlich ? "public, max-age=31536000, immutable" : "no-cache");
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(200).end(req.method === "HEAD" ? undefined : inhalt);
  }
}
