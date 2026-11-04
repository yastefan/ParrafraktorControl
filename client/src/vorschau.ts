// Live-Vorschau, gerechnet mit derselben Engine wie auf dem Server.
// Die Engine läuft lokal weiter (auch ohne Verbindung) und wird über den Takt im Stand nachgezogen.
//
// Zwei Ansichten, je nach Aufbau:
//   reihe           Draufsicht: die Elemente nebeneinander, jeder Spiegel als Strich
//   hintereinander  Vorderansicht wie "Classic" in der Simulation: die drei Elemente deckungsgleich
//                   hintereinander, jedes in seiner Ebene gedreht. Dazu rechts jedes Element einzeln.
//                   Modus "spiegel" zeigt die Spiegel, Modus "licht" nur das Licht, das von hinten
//                   durch alle drei Lagen kommt – das Muster, das das Publikum sieht.
// Dazu, unabhängig vom Aufbau, die Ansicht "phaser" wie der Phaser-Editor der grandMA3:
// ein Diagramm mit jedem Spiegel als Punkt (waagrecht seine Lage, senkrecht sein Winkel),
// dahinter die Spur der letzten Bewegung; unter jedem Element klein seine Vorderansicht.
// Und die Ansicht "reflexion" wie die Website-Simulation, nur einfacher: Draufsicht auf den
// Raum, die Elemente nebeneinander, ein fester Scheinwerfer davor; die Strahlen werden an den
// Spiegeln reflektiert und treffen auf die Wände.
import {
  ELEMENTE, Engine, SPIEGEL_N, weich, wendeImpulseAn,
  type ImpulsEinstellung, type ImpulsWinkel, type LaufenderImpuls, type Parameter, type Stellung,
} from "@parrafraktor/engine";
import type { Aufbau, Takt } from "@parrafraktor/protokoll";

export type VorderModus = "spiegel" | "licht";
export type Ansicht = "bild" | "phaser" | "reflexion";

export interface VorschauDaten {
  parameter: Parameter;
  live: boolean;
  aufbau: Aufbau;
  modus: VorderModus;
  ansicht: Ansicht;
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

// Winkel in −180 … +180
const umbrechen = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;

const SPUR_N = 20;

// ---------- Reflexion: Raum, Scheinwerfer, Strahlen (wie die Website-Simulation, fest) ----------

interface Punkt { x: number; y: number }
interface RaumSpiegel { a: Punkt; b: Punkt; n: Punkt }   // Enden und Normale der Vorderseite

const RAUM = { b: 10, t: 6 };                  // Meter, die Rückwand oben
const ELEMENT_Y = 1.8;                         // Abstand der Elemente zur Rückwand
const LAMPE = { x: RAUM.b / 2, y: 5.3 };       // ein Scheinwerfer mittig vor den Elementen
const STRAHLEN = 240;
const MAX_REFLEXIONEN = 3;

// Die 36 Spiegel im Raum: Elemente nebeneinander, Vorderseite zum Scheinwerfer
export function raumSpiegel(winkel: number[]): RaumSpiegel[] {
  const gesamt = ELEMENTE * ELEMENT_B + (ELEMENTE - 1) * ABSTAND;
  const liste: RaumSpiegel[] = [];
  for (let k = 0; k < ELEMENTE; k++) {
    const x0 = (RAUM.b - gesamt) / 2 + k * (ELEMENT_B + ABSTAND);
    for (let i = 0; i < SPIEGEL_N; i++) {
      const a = grad(winkel[k * SPIEGEL_N + i]!);
      const p = { x: x0 + (i + 0.5) * RASTER, y: ELEMENT_Y };
      const u = { x: Math.cos(a), y: Math.sin(a) };
      liste.push({
        a: { x: p.x - (u.x * SPIEGEL_B) / 2, y: p.y - (u.y * SPIEGEL_B) / 2 },
        b: { x: p.x + (u.x * SPIEGEL_B) / 2, y: p.y + (u.y * SPIEGEL_B) / 2 },
        n: { x: -u.y, y: u.x },
      });
    }
  }
  return liste;
}

// Schnitt Strahl (o + t·d) mit Strecke a–b; liefert t oder null
function schnitt(o: Punkt, d: Punkt, a: Punkt, b: Punkt): number | null {
  const ex = b.x - a.x, ey = b.y - a.y;
  const nenner = d.x * ey - d.y * ex;
  if (Math.abs(nenner) < 1e-9) return null;
  const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / nenner;
  const s = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / nenner;
  return t > 1e-6 && s >= 0 && s <= 1 ? t : null;
}

function bisWand(o: Punkt, d: Punkt): number {
  let t = Infinity;
  if (d.x > 0) t = Math.min(t, (RAUM.b - o.x) / d.x);
  if (d.x < 0) t = Math.min(t, -o.x / d.x);
  if (d.y > 0) t = Math.min(t, (RAUM.t - o.y) / d.y);
  if (d.y < 0) t = Math.min(t, -o.y / d.y);
  return t;
}

// Lichtkegel des Scheinwerfers über alle drei Elemente; Rückseiten schlucken das Licht
export function strahlen(spiegel: RaumSpiegel[]): { pfade: Punkt[][]; treffer: Punkt[] } {
  const gesamt = ELEMENTE * ELEMENT_B + (ELEMENTE - 1) * ABSTAND;
  const basis = -Math.PI / 2;
  const kegel = Math.atan2(gesamt / 2 + 0.2, LAMPE.y - ELEMENT_Y);
  const pfade: Punkt[][] = [], treffer: Punkt[] = [];
  for (let r = 0; r < STRAHLEN; r++) {
    const w = basis - kegel + (2 * kegel * r) / (STRAHLEN - 1);
    let o: Punkt = { ...LAMPE };
    let d: Punkt = { x: Math.cos(w), y: Math.sin(w) };
    const pfad = [o];
    let reflexionen = 0;
    for (;;) {
      let bestT = Infinity, best: RaumSpiegel | null = null;
      for (const sp of spiegel) {
        const t = schnitt(o, d, sp.a, sp.b);
        if (t !== null && t < bestT) { bestT = t; best = sp; }
      }
      if (!best) {
        const t = bisWand(o, d);
        const ende = { x: o.x + d.x * t, y: o.y + d.y * t };
        pfad.push(ende);
        if (reflexionen > 0) treffer.push(ende);
        break;
      }
      const p = { x: o.x + d.x * bestT, y: o.y + d.y * bestT };
      pfad.push(p);
      const dn = d.x * best.n.x + d.y * best.n.y;
      if (dn >= 0 || reflexionen >= MAX_REFLEXIONEN) break;
      d = { x: d.x - 2 * dn * best.n.x, y: d.y - 2 * dn * best.n.y };
      o = p;
      reflexionen++;
    }
    pfade.push(pfad);
  }
  return { pfade, treffer };
}
// Neonfarben wie in der Oberfläche (RGB-Tripel für Transparenz)
const PHASER = {
  punkt: "0,229,255",
  live: "255,31,79",
  raster: "rgba(140,136,168,0.12)",
  null: "rgba(140,136,168,0.4)",
  rahmen: "rgba(140,136,168,0.18)",
  text: "rgba(140,136,168,0.9)",
};

export class Vorschau {
  private engine = new Engine();
  private drehung = new Float64Array(ELEMENTE * SPIEGEL_N);   // Winkel bei Rotation (TiltRotate)
  private letzte = performance.now();
  private bild = 0;
  private lichtCanvas = document.createElement("canvas");
  // Überblendung zu einem Preset: Ausgangsstellung und eigener, flüssig weiterlaufender Anteil
  private letzteWinkel: number[] = [];
  private blende: { id: number; von: number[]; anteil: number } | null = null;
  // Phaser: Spur der letzten Winkel (älteste zuerst) und Höhe der Achse, weich nachgezogen
  private spur: number[][] = [];
  private spurZeit = 0;
  private bereich = 60;

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
    if (d.ansicht === "phaser") this.phaser(ctx, breite, hoehe, d, winkel);
    else if (d.ansicht === "reflexion") this.reflexion(ctx, breite, hoehe, d, winkel);
    else if (d.aufbau.anordnung === "hintereinander") this.vorderansicht(ctx, breite, hoehe, dpr, d, winkel);
    else this.draufsicht(ctx, breite, hoehe, d.live, winkel);
  }

  // ---------- Phaser ----------

  private phaser(ctx: CanvasRenderingContext2D, breite: number, hoehe: number, d: VorschauDaten, winkel: number[]): void {
    const w = winkel.map(umbrechen);
    // Spur: etwa alle 30 ms ein Bild, 0,6 s lang
    const jetzt = performance.now();
    if (jetzt - this.spurZeit > 30) {
      this.spurZeit = jetzt;
      this.spur.push(w);
      if (this.spur.length > SPUR_N) this.spur.shift();
    }
    // Achse: so hoch wie nötig in 30°-Schritten, weich nachgezogen
    const groesster = Math.max(...this.spur.flat().map(Math.abs), 1);
    const ziel = Math.min(180, Math.max(30, Math.ceil((groesster + 3) / 30) * 30));
    this.bereich += (ziel - this.bereich) * 0.08;
    const r = this.bereich;

    const links = 40, rechts = 8, oben = 44, unten = 40, luecke = 10;   // oben Platz für den Umschalter
    const pb = (breite - links - rechts - (ELEMENTE - 1) * luecke) / ELEMENTE;
    const ph = hoehe - oben - unten;
    const py = (a: number) => oben + ph / 2 - (a / r) * (ph / 2);
    const px = (k: number, i: number) => links + k * (pb + luecke) + ((i + 0.5) / SPIEGEL_N) * pb;
    const farbe = d.live ? PHASER.live : PHASER.punkt;

    ctx.fillStyle = FARBE.grund;
    ctx.fillRect(0, 0, breite, hoehe);
    // Raster und Beschriftung
    ctx.font = "600 10px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const schritt = r > 120 ? 90 : r > 60 ? 45 : 15;
    for (let a = -Math.floor(r / schritt) * schritt; a <= r + 0.01; a += schritt) {
      const y = py(a);
      ctx.strokeStyle = a === 0 ? PHASER.null : PHASER.raster;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(links, y);
      ctx.lineTo(breite - rechts, y);
      ctx.stroke();
      ctx.fillStyle = PHASER.text;
      ctx.fillText(`${a > 0 ? "+" : ""}${a}°`, links - 6, y);
    }
    for (let k = 0; k < ELEMENTE; k++) {
      const x0 = links + k * (pb + luecke);
      ctx.strokeStyle = PHASER.rahmen;
      ctx.strokeRect(x0 + 0.5, oben + 0.5, pb - 1, ph - 1);
      // klein die Vorderansicht des Elements (mit seiner Drehung), daneben der Name
      const klein = unten - 6, mitteY = oben + ph + 3 + klein / 2;
      const text = `Element ${k + 1}`;
      ctx.font = "600 10px -apple-system, sans-serif";
      const tb = ctx.measureText(text).width;
      const start = x0 + pb / 2 - (klein + 6 + tb) / 2;
      this.element(ctx, start + klein / 2, mitteY, klein / (ELEMENT_B * Math.SQRT2), k, d, winkel, 1);
      ctx.fillStyle = PHASER.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, start + klein + 6, mitteY);
    }

    // Spur: ältere Punkte blasser und kleiner
    const n = this.spur.length;
    this.spur.forEach((bild, j) => {
      const alter = (j + 1) / n;
      ctx.fillStyle = `rgba(${farbe},${0.25 * alter * alter})`;
      bild.forEach((a, g) => {
        const k = Math.floor(g / SPIEGEL_N), i = g % SPIEGEL_N;
        ctx.beginPath();
        ctx.arc(px(k, i), py(a), 1.5 + 1.5 * alter, 0, 2 * Math.PI);
        ctx.fill();
      });
    });

    // Verlauf je Element, bei einem Umbruch (Rotation über ±180°) unterbrochen
    ctx.strokeStyle = `rgba(${farbe},0.55)`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    for (let k = 0; k < ELEMENTE; k++) {
      ctx.beginPath();
      for (let i = 0; i < SPIEGEL_N; i++) {
        const a = w[k * SPIEGEL_N + i]!;
        const vorher = i > 0 ? w[k * SPIEGEL_N + i - 1]! : a;
        if (i === 0 || Math.abs(a - vorher) > 180) ctx.moveTo(px(k, i), py(a));
        else ctx.lineTo(px(k, i), py(a));
      }
      ctx.stroke();
    }

    // Die Spiegel selbst: Punkt mit Schein
    for (let g = 0; g < w.length; g++) {
      const k = Math.floor(g / SPIEGEL_N), i = g % SPIEGEL_N;
      const x = px(k, i), y = py(w[g]!);
      ctx.fillStyle = `rgba(${farbe},0.25)`;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = `rgb(${farbe})`;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // ---------- Reflexion ----------

  private reflexion(ctx: CanvasRenderingContext2D, breite: number, hoehe: number, d: VorschauDaten, winkel: number[]): void {
    const m = Math.min(breite / RAUM.b, hoehe / RAUM.t);
    const ox = (breite - RAUM.b * m) / 2, oy = (hoehe - RAUM.t * m) / 2;
    const X = (x: number) => ox + x * m, Y = (y: number) => oy + y * m;
    const farbe = d.live ? FARBE.lichtLive : FARBE.licht;

    ctx.fillStyle = FARBE.grund;
    ctx.fillRect(0, 0, breite, hoehe);
    // Raster (1 m) und Wände
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= RAUM.b; x++) { ctx.beginPath(); ctx.moveTo(X(x), Y(0)); ctx.lineTo(X(x), Y(RAUM.t)); ctx.stroke(); }
    for (let y = 0; y <= RAUM.t; y++) { ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(RAUM.b), Y(y)); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.strokeRect(X(0), Y(0), RAUM.b * m, RAUM.t * m);

    const spiegel = raumSpiegel(winkel);
    const { pfade, treffer } = strahlen(spiegel);

    // Strahlen additiv, reflektierte heller als der Weg zum Spiegel
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = Math.max(1, m * 0.015);
    for (const pfad of pfade) {
      for (let n = 1; n < pfad.length; n++) {
        ctx.strokeStyle = `rgba(${farbe},${n === 1 ? 0.05 : 0.1})`;
        ctx.beginPath();
        ctx.moveTo(X(pfad[n - 1]!.x), Y(pfad[n - 1]!.y));
        ctx.lineTo(X(pfad[n]!.x), Y(pfad[n]!.y));
        ctx.stroke();
      }
    }
    const fleck = m * 0.2;
    for (const t of treffer) {
      const g = ctx.createRadialGradient(X(t.x), Y(t.y), 0, X(t.x), Y(t.y), fleck);
      g.addColorStop(0, `rgba(${farbe},0.35)`);
      g.addColorStop(1, `rgba(${farbe},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(X(t.x) - fleck, Y(t.y) - fleck, 2 * fleck, 2 * fleck);
    }
    ctx.globalCompositeOperation = "source-over";

    // Spiegel: helle Vorderseite (zum Scheinwerfer), dunkle Rückseite
    ctx.lineCap = "round";
    for (const sp of spiegel) {
      ctx.strokeStyle = FARBE.rueckseite;
      ctx.lineWidth = Math.max(2, m * 0.05);
      ctx.beginPath(); ctx.moveTo(X(sp.a.x), Y(sp.a.y)); ctx.lineTo(X(sp.b.x), Y(sp.b.y)); ctx.stroke();
      const o = 0.012;
      ctx.strokeStyle = d.live ? `rgb(${FARBE.lichtLive})` : "#e8ecf4";
      ctx.lineWidth = Math.max(1, m * 0.022);
      ctx.beginPath();
      ctx.moveTo(X(sp.a.x + sp.n.x * o), Y(sp.a.y + sp.n.y * o));
      ctx.lineTo(X(sp.b.x + sp.n.x * o), Y(sp.b.y + sp.n.y * o));
      ctx.stroke();
    }
    // Scheinwerfer
    const glanz = ctx.createRadialGradient(X(LAMPE.x), Y(LAMPE.y), 0, X(LAMPE.x), Y(LAMPE.y), m * 0.4);
    glanz.addColorStop(0, `rgba(${farbe},0.9)`);
    glanz.addColorStop(1, `rgba(${farbe},0)`);
    ctx.fillStyle = glanz;
    ctx.beginPath(); ctx.arc(X(LAMPE.x), Y(LAMPE.y), m * 0.4, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = `rgb(${farbe})`;
    ctx.beginPath(); ctx.arc(X(LAMPE.x), Y(LAMPE.y), Math.max(3, m * 0.09), 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "600 10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Rückwand", X(RAUM.b / 2), Y(0) + 4);
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
    ctx.strokeStyle = d.live ? `rgba(255,31,79,${0.7 * tiefe})` : `rgba(255,255,255,${0.35 * tiefe})`;
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
