// Live-Vorschau: Draufsicht auf die drei Elemente, gerechnet mit derselben Engine wie auf dem Server.
// Die Engine läuft lokal weiter (auch ohne Verbindung) und wird über den Takt im Stand nachgezogen.
import { ELEMENTE, Engine, SPIEGEL_N, type Parameter, type Stellung } from "@parrafraktor/engine";

const ABWEICHUNG_MAX = 0.05;   // Durchläufe; größere Abweichungen werden sofort übernommen

export class Vorschau {
  private engine = new Engine();
  private drehung = new Float64Array(ELEMENTE * SPIEGEL_N);   // Winkel bei Rotation (TiltRotate)
  private letzte = performance.now();
  private bild = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly parameter: () => Parameter | null,
    private readonly live: () => boolean,
  ) {}

  starte(): void {
    const schleife = (jetzt: number) => {
      const dt = Math.min(0.1, (jetzt - this.letzte) / 1000);
      this.letzte = jetzt;
      const p = this.parameter();
      if (p) {
        this.engine.weiter(p, dt);
        this.zeichne(this.engine.alle(p), dt);
      }
      this.bild = requestAnimationFrame(schleife);
    };
    this.bild = requestAnimationFrame(schleife);
  }

  stoppe(): void {
    cancelAnimationFrame(this.bild);
  }

  // Takt vom Server übernehmen
  gleiche(takt: { umlaufVon: number; umlaufBis: number }): void {
    const e = this.engine;
    const d = Math.max(Math.abs(e.umlaufVon - takt.umlaufVon), Math.abs(e.umlaufBis - takt.umlaufBis));
    // Kleine Abweichungen weich nachziehen, damit die Vorschau nicht ruckelt
    const f = d > ABWEICHUNG_MAX ? 1 : 0.2;
    e.umlaufVon += (takt.umlaufVon - e.umlaufVon) * f;
    e.umlaufBis += (takt.umlaufBis - e.umlaufBis) * f;
  }

  private zeichne(stellungen: Stellung[], dt: number): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const breite = c.clientWidth, hoehe = c.clientHeight;
    if (c.width !== Math.round(breite * dpr) || c.height !== Math.round(hoehe * dpr)) {
      c.width = Math.round(breite * dpr);
      c.height = Math.round(hoehe * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, breite, hoehe);

    // Maße wie in der Simulation: Element 1,8 m, Lücke 0,25 m, Spiegel knapp 0,15 m
    const gesamt = ELEMENTE * 1.8 + (ELEMENTE - 1) * 0.25;
    const m = Math.min((breite - 24) / gesamt, (hoehe - 24) / 0.3);
    const x0 = (breite - gesamt * m) / 2;
    const y = hoehe / 2;
    const raster = 0.15 * m, spiegel = 0.138 * m;
    const live = this.live();

    for (let k = 0; k < ELEMENTE; k++) {
      const ex = x0 + k * (1.8 + 0.25) * m;
      ctx.strokeStyle = "#2a2d33";
      ctx.lineWidth = 1;
      ctx.strokeRect(ex, y - 0.1 * m, 1.8 * m, 0.2 * m);   // Rahmen des Elements von oben
      for (let i = 0; i < SPIEGEL_N; i++) {
        const g = k * SPIEGEL_N + i;
        const s = stellungen[g]!;
        this.drehung[g] = s.upm ? (this.drehung[g]! + s.upm * 6 * dt) % 360 : 0;
        const winkel = ((s.tilt + this.drehung[g]!) * Math.PI) / 180;
        const px = ex + (i + 0.5) * raster;
        const dx = (Math.cos(winkel) * spiegel) / 2, dy = (Math.sin(winkel) * spiegel) / 2;
        ctx.strokeStyle = live ? "#f0a030" : "#c9ccd1";
        ctx.lineWidth = Math.max(2, m * 0.012);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(px - dx, y - dy);
        ctx.lineTo(px + dx, y + dy);
        ctx.stroke();
      }
    }
  }
}
