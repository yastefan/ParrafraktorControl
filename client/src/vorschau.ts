// Live-Vorschau, gerechnet mit derselben Engine wie auf dem Server.
// Die Engine läuft lokal weiter (auch ohne Verbindung) und wird über den Takt im Stand nachgezogen.
//
// Zwei Ansichten, je nach Aufbau:
//   reihe           Draufsicht: die Elemente nebeneinander, jeder Spiegel als Strich
//   hintereinander  Vorderansicht wie "Classic" in der Simulation: die drei Elemente deckungsgleich
//                   hintereinander, jedes in seiner Ebene gedreht. Dazu rechts jedes Element einzeln.
//                   Modus "spiegel" zeigt die Spiegel, Modus "licht" nur das Licht, das von hinten
//                   durch alle drei Lagen kommt – das Muster, das das Publikum sieht.
import {
  ELEMENTE, Engine, SPIEGEL_N, weich, wendeImpulseAn,
  type ImpulsEinstellung, type ImpulsWinkel, type LaufenderImpuls, type Parameter, type Stellung,
} from "@parrafraktor/engine";
import type { Aufbau, Takt } from "@parrafraktor/protokoll";

export type VorderModus = "spiegel" | "licht";

export interface VorschauDaten {
  parameter: Parameter;
  live: boolean;
  aufbau: Aufbau;
  modus: VorderModus;
  blende: { id: number; anteil: number } | null;   // Überblendung zu einem Preset (vom Server)
  blendeDauer: number;                              // Sekunden
  impuls: ImpulsEinstellung;
  impulse: LaufenderImpuls[];                       // Zeiten beim Empfang des Stands
  impulseSeitS: number;                             // so lange ist der Stand schon da
  flash: ImpulsWinkel;
}

const ABWEICHUNG_MAX = 0.05;   // Durchläufe; größere Abweichungen werden sofort übernommen

// Maße wie in der Simulation (Meter)
const ELEMENT_B = 1.8;
const RASTER = ELEMENT_B / SPIEGEL_N;   // 0,15 m Achsabstand
const SPIEGEL_B = RASTER - 0.012;       // Spiegel etwas schmaler als das Raster
const ABSTAND = 0.25;                   // Lücke zwischen den Elementen (Draufsicht)
const SICHT_VORN = 2.75;                // sichtbare Breite der Vorderansicht: Raute 1,8 × √2 plus Rand

const FARBE = {
  grund: "#0b0a0f",
  rahmen: "#2a2d33",
  spiegel: "#c9ccd1",
  live: "#f0a030",
  licht: "255,214,160",        // warmes Gegenlicht wie in der Simulation
  lichtLive: "240,160,48",
  rueckseite: "#2a2630",
};

// Kleine Abweichungen weich nachziehen, damit die Vorschau nicht ruckelt
const nachziehen = (lokal: number, server: number): number =>
  Math.abs(server - lokal) > ABWEICHUNG_MAX ? server : lokal + (server - lokal) * 0.2;

const grad = (g: number): number => (g * Math.PI) / 180;

export class Vorschau {
  private engine = new Engine();
  private drehung = new Float64Array(ELEMENTE * SPIEGEL_N);   // Winkel bei Rotation (TiltRotate)
  private letzte = performance.now();
  private bild = 0;
  private lichtCanvas = document.createElement("canvas");
  // Überblendung zu einem Preset: Ausgangsstellung und eigener, flüssig weiterlaufender Anteil
  private letzteWinkel: number[] = [];
  private blende: { id: number; von: number[]; anteil: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly daten: () => VorschauDaten | null,
  ) {}

  starte(): void {
    const schleife = (jetzt: number) => {
      const dt = Math.min(0.1, (jetzt - this.letzte) / 1000);
      this.letzte = jetzt;
      const d = this.daten();
      if (d) {
        this.engine.weiter(d.parameter, dt);
        const look = this.blenden(d, this.winkel(this.engine.alle(d.parameter), dt), dt);
        this.letzteWinkel = look;
        const winkel = this.mitImpulsen(d, look);
        this.zeichne(d, winkel);
      }
      this.bild = requestAnimationFrame(schleife);
    };
    this.bild = requestAnimationFrame(schleife);
  }

  stoppe(): void {
    cancelAnimationFrame(this.bild);
  }

  // Takt vom Server übernehmen
  gleiche(takt: Takt): void {
    const e = this.engine;
    e.umlaufVon = nachziehen(e.umlaufVon, takt.umlaufVon);
    takt.umlauf.forEach((u, g) => { if (g < e.umlauf.length) e.umlauf[g] = nachziehen(e.umlauf[g]!, u); });
  }

  // Wie der Server: von der Stellung beim Abrufen weich zum neuen Look. Den Anteil rechnet die
  // Vorschau selbst weiter, damit es flüssig läuft; der Server gibt Start und Ende vor.
  private blenden(d: VorschauDaten, ziel: number[], dt: number): number[] {
    if (!d.blende) {
      this.blende = null;
      return ziel;
    }
    if (this.blende?.id !== d.blende.id) {
      this.blende = { id: d.blende.id, von: this.letzteWinkel.length ? this.letzteWinkel : ziel, anteil: d.blende.anteil };
    } else if (d.blendeDauer > 0) {
      this.blende.anteil = Math.min(1, Math.max(d.blende.anteil, this.blende.anteil + dt / d.blendeDauer));
    }
    const b = this.blende, f = weich(b.anteil);
    return ziel.map((w, g) => (b.von[g] ?? w) + (w - (b.von[g] ?? w)) * f);
  }

  // Impulse wie im Takt über den Look legen; ihre Zeit läuft seit dem Stand lokal weiter
  private mitImpulsen(d: VorschauDaten, winkel: number[]): number[] {
    if (!d.impulse.length) return winkel;
    const impulse = d.impulse.map((i) => ({ ...i, alterS: i.alterS + d.impulseSeitS }));
    return wendeImpulseAn(winkel.map((tilt) => ({ tilt, upm: 0 })), impulse, d.impuls, d.flash).map((s) => s.tilt);
  }

  // Sichtbarer Winkel je Spiegel in Grad: Tilt plus die Drehung über TiltRotate
  private winkel(stellungen: Stellung[], dt: number): number[] {
    return stellungen.map((s, g) => {
      this.drehung[g] = s.upm ? (this.drehung[g]! + s.upm * 6 * dt) % 360 : 0;
      return s.tilt + this.drehung[g]!;
    });
  }

  private zeichne(d: VorschauDaten, winkel: number[]): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const breite = c.clientWidth, hoehe = c.clientHeight;
    if (c.width !== Math.round(breite * dpr) || c.height !== Math.round(hoehe * dpr)) {
      c.width = Math.round(breite * dpr);
      c.height = Math.round(hoehe * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx || !breite || !hoehe) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, breite, hoehe);
    if (d.aufbau.anordnung === "hintereinander") this.vorderansicht(ctx, breite, hoehe, dpr, d, winkel);
    else this.draufsicht(ctx, breite, hoehe, d.live, winkel);
  }

  // ---------- Draufsicht ----------

  private draufsicht(ctx: CanvasRenderingContext2D, breite: number, hoehe: number, live: boolean, winkel: number[]): void {
    const gesamt = ELEMENTE * ELEMENT_B + (ELEMENTE - 1) * ABSTAND;
    const m = Math.min((breite - 24) / gesamt, (hoehe - 24) / 0.3);
    const x0 = (breite - gesamt * m) / 2;
    const y = hoehe / 2;
    for (let k = 0; k < ELEMENTE; k++) {
      const ex = x0 + k * (ELEMENT_B + ABSTAND) * m;
      ctx.strokeStyle = FARBE.rahmen;
      ctx.lineWidth = 1;
      ctx.strokeRect(ex, y - 0.1 * m, ELEMENT_B * m, 0.2 * m);   // Rahmen des Elements von oben
      for (let i = 0; i < SPIEGEL_N; i++) {
        const a = grad(winkel[k * SPIEGEL_N + i]!);
        const px = ex + (i + 0.5) * RASTER * m;
        const dx = (Math.cos(a) * SPIEGEL_B * m) / 2, dy = (Math.sin(a) * SPIEGEL_B * m) / 2;
        ctx.strokeStyle = live ? FARBE.live : FARBE.spiegel;
        ctx.lineWidth = Math.max(2, m * 0.012);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(px - dx, y - dy);
        ctx.lineTo(px + dx, y + dy);
        ctx.stroke();
      }
    }
  }

  // ---------- Vorderansicht ----------

  private vorderansicht(
    ctx: CanvasRenderingContext2D, breite: number, hoehe: number, dpr: number, d: VorschauDaten, winkel: number[],
  ): void {
    // Rechts eine Spalte mit den Elementen einzeln, links das Gesamtbild
    const spalte = Math.min(hoehe / ELEMENTE, breite * 0.22);
    const hauptB = breite - spalte - 8;
    const s = Math.min(hauptB, hoehe) / SICHT_VORN;
    const mx = hauptB / 2, my = hoehe / 2;

    ctx.fillStyle = FARBE.grund;
    ctx.fillRect(0, 0, hauptB, hoehe);
    if (d.modus === "licht") this.durchlicht(ctx, hauptB, hoehe, dpr, mx, my, s, d, winkel);
    else this.spiegelVorn(ctx, mx, my, s, d, winkel);

    for (let k = 0; k < ELEMENTE; k++) {
      const y0 = k * spalte;
      const x0 = breite - spalte;
      ctx.fillStyle = FARBE.grund;
      ctx.fillRect(x0 + 2, y0 + 2, spalte - 4, spalte - 4);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 + 2, y0 + 2, spalte - 4, spalte - 4);
      ctx.clip();
      this.element(ctx, x0 + spalte / 2, y0 + spalte / 2, (spalte - 8) / SICHT_VORN, k, d, winkel, 1);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "600 11px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const lage = k === 0 ? " vorn" : k === ELEMENTE - 1 ? " hinten" : "";
      ctx.fillText(`${k + 1}${lage} · ${d.aufbau.drehung[k] ?? 0}°`, x0 + 7, y0 + 6);
    }
  }

  // Spiegel von vorn: Gegenlicht dahinter, die Elemente von hinten nach vorn darüber
  private spiegelVorn(ctx: CanvasRenderingContext2D, mx: number, my: number, s: number, d: VorschauDaten, winkel: number[]): void {
    this.gegenlicht(ctx, mx, my, s, d.live, 0.55);
    for (let k = ELEMENTE - 1; k >= 0; k--) this.element(ctx, mx, my, s, k, d, winkel, 1 - k * 0.18);
  }

  // Ein Element von vorn: Spiegel als Streifen, von der Seite gesehen schmaler.
  // Die Vorderseite glänzt leicht, wenn sie zum Publikum zeigt, die Rückseite ist dunkel.
  private element(
    ctx: CanvasRenderingContext2D, mx: number, my: number, s: number, k: number, d: VorschauDaten, winkel: number[], tiefe: number,
  ): void {
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(grad(d.aufbau.drehung[k] ?? 0));
    const halb = (ELEMENT_B / 2) * s;
    for (let i = 0; i < SPIEGEL_N; i++) {
      const a = grad(winkel[k * SPIEGEL_N + i]!);
      const vorderseite = Math.cos(a) >= 0;
      const b = Math.max(1, Math.abs(Math.cos(a)) * SPIEGEL_B * s);
      const x = ((i + 0.5) * RASTER - ELEMENT_B / 2) * s;
      if (vorderseite) {
        const hell = (0.16 + 0.3 * Math.cos(a) ** 4) * tiefe;
        const c1 = Math.round(235 * hell), c2 = Math.round(170 * hell);
        const verlauf = ctx.createLinearGradient(0, -halb, 0, halb);
        verlauf.addColorStop(0, `rgb(${c1},${c1},${Math.round(c1 * 1.05)})`);
        verlauf.addColorStop(0.5, `rgb(${c2},${c2},${Math.round(c2 * 1.12)})`);
        verlauf.addColorStop(1, `rgb(${c1},${c1},${Math.round(c1 * 1.05)})`);
        ctx.fillStyle = verlauf;
      } else {
        ctx.fillStyle = FARBE.rueckseite;
      }
      ctx.fillRect(x - b / 2, -halb, b, 2 * halb);
    }
    ctx.strokeStyle = d.live ? `rgba(240,160,48,${0.7 * tiefe})` : `rgba(255,255,255,${0.35 * tiefe})`;
    ctx.lineWidth = Math.max(1, s * 0.015);
    ctx.strokeRect(-halb, -halb, 2 * halb, 2 * halb);
    ctx.restore();
  }

  // Licht durch alle drei Lagen: helle Fläche, aus der die Spiegel aller Elemente ausgestanzt werden.
  // Außerhalb der Rahmen bleibt es dunkel, damit nur das Muster der Elemente zu sehen ist.
  private durchlicht(
    ctx: CanvasRenderingContext2D, breite: number, hoehe: number, dpr: number,
    mx: number, my: number, s: number, d: VorschauDaten, winkel: number[],
  ): void {
    const l = this.lichtCanvas;
    if (l.width !== Math.round(breite * dpr) || l.height !== Math.round(hoehe * dpr)) {
      l.width = Math.round(breite * dpr);
      l.height = Math.round(hoehe * dpr);
    }
    const lc = l.getContext("2d");
    if (!lc) return;
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, breite, hoehe);
    this.gegenlicht(lc, mx, my, s, d.live, 1);

    const halb = (ELEMENT_B / 2) * s;
    // nur innerhalb der Rahmen
    lc.globalCompositeOperation = "destination-in";
    lc.fillStyle = "#000";
    lc.beginPath();
    for (let k = 0; k < ELEMENTE; k++) {
      const r = grad(d.aufbau.drehung[k] ?? 0);
      const cos = Math.cos(r), sin = Math.sin(r);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], n) => {
        const px = mx + (x! * cos - y! * sin) * halb, py = my + (x! * sin + y! * cos) * halb;
        if (n) lc.lineTo(px, py);
        else lc.moveTo(px, py);
      });
      lc.closePath();
    }
    lc.fill("nonzero");

    // Spiegel aller Lagen ausstanzen
    lc.globalCompositeOperation = "destination-out";
    for (let k = 0; k < ELEMENTE; k++) {
      lc.save();
      lc.translate(mx, my);
      lc.rotate(grad(d.aufbau.drehung[k] ?? 0));
      for (let i = 0; i < SPIEGEL_N; i++) {
        const b = Math.abs(Math.cos(grad(winkel[k * SPIEGEL_N + i]!))) * SPIEGEL_B * s;
        if (b < 0.5) continue;
        const x = ((i + 0.5) * RASTER - ELEMENT_B / 2) * s;
        lc.fillRect(x - b / 2, -halb, b, 2 * halb);
      }
      lc.restore();
    }

    ctx.drawImage(l, 0, 0, breite, hoehe);
    // Rahmen dünn darüber, damit man die Lage der Elemente erkennt
    for (let k = 0; k < ELEMENTE; k++) {
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(grad(d.aufbau.drehung[k] ?? 0));
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-halb, -halb, 2 * halb, 2 * halb);
      ctx.restore();
    }
  }

  private gegenlicht(ctx: CanvasRenderingContext2D, mx: number, my: number, s: number, live: boolean, staerke: number): void {
    const farbe = live ? FARBE.lichtLive : FARBE.licht;
    const verlauf = ctx.createRadialGradient(mx, my, 0, mx, my, s * 1.45);
    verlauf.addColorStop(0, `rgba(${farbe},${staerke})`);
    verlauf.addColorStop(0.55, `rgba(${farbe},${0.65 * staerke})`);
    verlauf.addColorStop(1, `rgba(${farbe},0)`);
    ctx.fillStyle = verlauf;
    ctx.fillRect(mx - s * 1.5, my - s * 1.5, s * 3, s * 3);
  }
}
