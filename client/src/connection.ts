// WebSocket to the server, built for a shaky Wi-Fi:
// - reconnects by itself after a drop (0.5 s, then longer up to 5 s)
// - detects "zombie" connections that iOS leaves open after sleeping: if nothing comes for 3.5 s
//   (the server sends the state at least every second), it reconnects
// - tries again at once when the device goes online or the app comes to the foreground
// Messages are not buffered: without a connection the controls are locked, and after
// connecting the server sends the complete state anyway.
import { WS_PATH, type ClientMessage, type ServerMessage } from "@parrafraktor/protocol";

export type ConnectionState = "verbinde" | "verbunden" | "getrennt";

const SILENCE_MS = 3500;
const WAIT_MIN_MS = 500;
const WAIT_MAX_MS = 5000;

export class Connection {
  private ws: WebSocket | null = null;
  private recent = 0;
  private wait = WAIT_MIN_MS;
  private retryTimer: number | undefined;
  private _state: ConnectionState = "verbinde";

  constructor(
    private readonly onMessage: (n: ServerMessage) => void,
    private readonly onState: (z: ConnectionState) => void,
  ) {}

  get state(): ConnectionState {
    return this._state;
  }

  start(): void {
    this.open();
    window.setInterval(() => this.check(), 1000);
    const tryNow = () => {
      if (document.visibilityState !== "visible") return;
      if (this._state === "verbunden") this.check();
      else this.open();
    };
    window.addEventListener("online", tryNow);
    window.addEventListener("pageshow", tryNow);
    document.addEventListener("visibilitychange", tryNow);
  }

  send(n: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(n));
    return true;
  }

  private open(): void {
    window.clearTimeout(this.retryTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.set("verbinde");
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${WS_PATH}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.recent = Date.now();
      this.wait = WAIT_MIN_MS;
      this.set("verbunden");
    };
    ws.onmessage = (e) => {
      this.recent = Date.now();
      try {
        this.onMessage(JSON.parse(e.data as string) as ServerMessage);
      } catch {
        // broken message: ignore, the next state comes soon
      }
    };
    ws.onclose = () => this.retryLater();
    ws.onerror = () => ws.close();
  }

  private retryLater(): void {
    this.ws = null;
    this.set("getrennt");
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.open(), this.wait);
    this.wait = Math.min(WAIT_MAX_MS, this.wait * 2);
  }

  private check(): void {
    if (this._state === "verbunden" && Date.now() - this.recent > SILENCE_MS) {
      // connection open but silent: treat as dead
      this.ws?.close();
      this.retryLater();
    }
  }

  private set(z: ConnectionState): void {
    if (this._state === z) return;
    this._state = z;
    this.onState(z);
  }
}
