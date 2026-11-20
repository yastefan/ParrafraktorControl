// HTTP(S) for the PWA client and WebSocket (/ws) for the state.
//
// For a shaky Wi-Fi: the built files under /assets/ carry a hash in their name and are cached for
// a year; index.html, service worker and manifest are always checked again (ETag, mostly 304).
// The service worker in the client does the rest.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer as http, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as https } from "node:https";
import { extname, join, normalize, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { STATE_INTERVAL_MS, WS_PATH, parseClientMessage, type ClientMessage, type ServerMessage, type State } from "@parrafraktor/protocol";
import { log } from "../log.js";
import type { Controller } from "../controller.js";

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

const SEND_MS = 50;           // send changes at most 20 times per second
const HEARTBEAT_MS = 10_000;   // detect dead connections (e.g. iPad asleep)

export interface WebOptions {
  port: number;
  clientDir: string;
  tls?: { cert: string; key: string };
  // Additionally unencrypted on this port (only useful together with tls): fallback when the
  // certificate causes trouble (someone else's computer, Firefox). Without HTTPS the iPad only lacks the offline cache.
  httpPort?: number;
  // Only with npm run dev: port of Vite. Then the server forwards page requests there instead of
  // serving a possibly old build from client/dist; the WebSocket stays here.
  vitePort?: number;
}

// In development replaces a service worker registered earlier by the built client: otherwise it
// would keep the old app in its cache and the forwarding would never arrive.
const SW_UNREGISTER = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
})()));
`;

export class WebServer {
  private server: Server;
  private httpServer: Server | null = null;
  private wss: WebSocketServer;
  private sendTimer: NodeJS.Timeout | undefined;
  private interval: NodeJS.Timeout | undefined;
  private heartbeat: NodeJS.Timeout | undefined;
  private alive = new WeakSet<WebSocket>();
  private readonly onChange = () => this.sendSoon();

  constructor(
    private readonly o: WebOptions,
    private readonly controller: Controller,
    private readonly state: () => State,
  ) {
    const request = (req: IncomingMessage, res: ServerResponse) =>
      o.vitePort ? this.forward(req, res, o.vitePort) : this.file(req, res);
    this.server = o.tls
      ? https({ cert: readFileSync(o.tls.cert), key: readFileSync(o.tls.key) }, request)
      : http(request);
    if (o.tls && o.httpPort && o.httpPort !== o.port) this.httpServer = http(request);
    // One WebSocket server for both ports: all clients get the same state
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    this.wss.on("connection", (ws) => this.connected(ws));
    for (const server of this.servers()) {
      server.on("upgrade", (req, socket, head) => {
        if (new URL(req.url ?? "/", "http://x").pathname !== WS_PATH) {
          socket.destroy();
          return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit("connection", ws, req));
      });
    }
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }

  private servers(): Server[] {
    return this.httpServer ? [this.server, this.httpServer] : [this.server];
  }

  async start(): Promise<void> {
    const listen = (server: Server, port: number) => new Promise<void>((done, error) => {
      server.once("error", error);
      server.listen(port, () => done());
    });
    await listen(this.server, this.o.port);
    if (this.httpServer) await listen(this.httpServer, this.o.httpPort!);
    this.controller.on("change", this.onChange);
    // Send regularly even without a change: cycles for the preview and a sign of life for the client
    this.interval = setInterval(() => this.sendAll(), STATE_INTERVAL_MS);
    this.heartbeat = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (!this.alive.has(ws)) { ws.terminate(); continue; }
        this.alive.delete(ws);
        ws.ping();
      }
    }, HEARTBEAT_MS);
    const kind = this.o.tls ? "https" : "http";
    log("web", `${kind}://0.0.0.0:${this.o.port}${this.o.tls ? "" : " (without HTTPS no offline cache on the iPad)"}`);
    if (this.httpServer) log("web", `http://0.0.0.0:${this.o.httpPort} (additionally, without certificate)`);
  }

  async close(): Promise<void> {
    this.controller.off("change", this.onChange);
    clearTimeout(this.sendTimer);
    clearInterval(this.interval);
    clearInterval(this.heartbeat);
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((done) => this.wss.close(() => done()));
    await Promise.all(this.servers().map((server) => new Promise<void>((done) => server.close(() => done()))));
  }

  // ---------- WebSocket ----------

  private connected(ws: WebSocket): void {
    this.alive.add(ws);
    ws.on("pong", () => this.alive.add(ws));
    ws.on("message", (data, binary) => {
      if (binary) return;
      const n = parseClientMessage(data.toString());
      if (n) this.handle(ws, n);
    });
    ws.on("error", () => ws.terminate());
    this.transmit(ws, this.state());
    this.controller.changed();   // the number of clients has changed
    ws.on("close", () => this.controller.changed());
  }

  private handle(ws: WebSocket, n: ClientMessage): void {
    const s = this.controller;
    switch (n.typ) {
      case "setze": s.set(n.parameter); break;
      case "pattern": s.selectPattern(n.modus); break;
      case "vorgabe": s.reset(n.name); break;
      case "uebernahme": s.setTakeover(n.an); break;
      case "einstellungen": s.setSettings(n.einstellungen); break;
      case "preset":
        switch (n.aktion) {
          case "abrufen": s.recallPreset(n.nr); break;
          case "speichern": s.storePreset(n.nr); break;
          case "loeschen": s.deletePreset(n.nr); break;
          case "umbenennen": s.renamePreset(n.nr, n.name); break;
        }
        break;
      case "auto": s.setAuto(n.an); break;
      case "autoEinstellung": s.configureAuto(n.einstellung); break;
      case "impulsTippen": s.tapImpulse(n.ursprung, n.wischen); break;
      case "impulsEinstellung": s.setImpulse(n.einstellung); break;
      case "ping": this.transmit(ws, { typ: "pong", t: n.t }); break;
    }
  }

  private sendSoon(): void {
    if (this.sendTimer) return;
    this.sendTimer = setTimeout(() => {
      this.sendTimer = undefined;
      this.sendAll();
    }, SEND_MS);
  }

  private sendAll(): void {
    if (!this.wss.clients.size) return;
    const text = JSON.stringify(this.state());
    for (const ws of this.wss.clients) {
      // If a client lags (bad Wi-Fi), do not pile up: the next state replaces everything
      if (ws.readyState === ws.OPEN && ws.bufferedAmount < 256 * 1024) ws.send(text);
    }
  }

  private transmit(ws: WebSocket, n: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(n));
  }

  // ---------- Files ----------

  private forward(req: IncomingMessage, res: ServerResponse, vitePort: number): void {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/sw.js") {
      res.writeHead(200, { "content-type": MIME[".js"]!, "cache-control": "no-store" }).end(SW_UNREGISTER);
      return;
    }
    // Same host name as in the request, so it also works from the iPad in the LAN (Vite: host true)
    const host = new URL(`http://${req.headers.host ?? "localhost"}`).hostname;
    res.writeHead(307, { location: `http://${host}:${vitePort}${req.url ?? "/"}`, "cache-control": "no-store" }).end();
  }

  private file(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const root = this.o.clientDir;
    let file = normalize(join(root, path));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // Unknown paths without an extension end up in the app, everything else is 404
      if (extname(path)) {
        res.writeHead(404).end();
        return;
      }
      file = join(root, "index.html");
      if (!existsSync(file)) {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" })
          .end("Client is not built: npm run build");
        return;
      }
    }
    const content = readFileSync(file);
    const etag = `"${createHash("sha1").update(content).digest("base64url")}"`;
    const immutable = path.startsWith("/assets/");
    res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
    res.setHeader("etag", etag);
    res.setHeader("cache-control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(200).end(req.method === "HEAD" ? undefined : content);
  }
}
