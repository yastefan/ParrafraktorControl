// WebSocket zum Server, gebaut für wackliges WLAN:
// - verbindet nach einem Abbruch von selbst neu (0,5 s, dann länger bis 5 s)
// - erkennt "Zombie"-Verbindungen, die iOS nach dem Ruhezustand offen lässt: Kommt 3,5 s lang
//   nichts (der Server schickt mindestens jede Sekunde den Stand), wird neu verbunden
// - versucht es sofort wieder, wenn das Gerät online geht oder die App in den Vordergrund kommt
// Nachrichten werden nicht gepuffert: Ohne Verbindung ist die Bedienung gesperrt, und nach dem
// Verbinden schickt der Server ohnehin den vollständigen Stand.
import { WS_PFAD, type ClientNachricht, type ServerNachricht } from "@parrafraktor/protokoll";

export type VerbindungsZustand = "verbinde" | "verbunden" | "getrennt";

const STILLE_MS = 3500;
const WARTEN_MIN_MS = 500;
const WARTEN_MAX_MS = 5000;

export class Verbindung {
  private ws: WebSocket | null = null;
  private zuletzt = 0;
  private warten = WARTEN_MIN_MS;
  private wiederTimer: number | undefined;
  private _zustand: VerbindungsZustand = "verbinde";

  constructor(
    private readonly beiNachricht: (n: ServerNachricht) => void,
    private readonly beiZustand: (z: VerbindungsZustand) => void,
  ) {}

  get zustand(): VerbindungsZustand {
    return this._zustand;
  }

  starte(): void {
    this.oeffne();
    window.setInterval(() => this.pruefe(), 1000);
    const jetztVersuchen = () => {
      if (document.visibilityState !== "visible") return;
      if (this._zustand === "verbunden") this.pruefe();
      else this.oeffne();
    };
    window.addEventListener("online", jetztVersuchen);
    window.addEventListener("pageshow", jetztVersuchen);
    document.addEventListener("visibilitychange", jetztVersuchen);
  }

  sende(n: ClientNachricht): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(n));
    return true;
  }

  private oeffne(): void {
    window.clearTimeout(this.wiederTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.setze("verbinde");
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${WS_PFAD}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.zuletzt = Date.now();
      this.warten = WARTEN_MIN_MS;
      this.setze("verbunden");
    };
    ws.onmessage = (e) => {
      this.zuletzt = Date.now();
      try {
        this.beiNachricht(JSON.parse(e.data as string) as ServerNachricht);
      } catch {
        // kaputte Nachricht: ignorieren, der nächste Stand kommt gleich
      }
    };
    ws.onclose = () => this.spaeterNeu();
    ws.onerror = () => ws.close();
  }

  private spaeterNeu(): void {
    this.ws = null;
    this.setze("getrennt");
    window.clearTimeout(this.wiederTimer);
    this.wiederTimer = window.setTimeout(() => this.oeffne(), this.warten);
    this.warten = Math.min(WARTEN_MAX_MS, this.warten * 2);
  }

  private pruefe(): void {
    if (this._zustand === "verbunden" && Date.now() - this.zuletzt > STILLE_MS) {
      // Verbindung offen, aber still: als tot behandeln
      this.ws?.close();
      this.spaeterNeu();
    }
  }

  private setze(z: VerbindungsZustand): void {
    if (this._zustand === z) return;
    this._zustand = z;
    this.beiZustand(z);
  }
}
