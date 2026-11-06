// Nebel-Ansicht (Prototyp): Strahlen eines Scheinwerfers im Raum, von vorn leicht versetzt gesehen.
// Jeder Strahl wird durch alle Spiegel verfolgt und als Lichtspur in einen eigenen Puffer gesammelt.
// Der Puffer klingt von Bild zu Bild ab und die Strahlen wechseln leicht die Lage, damit aus wenigen
// Strahlen ein ruhiger Lichtschleier wird. Der Nebel ist überall gleich dicht.
import { ELEMENTE, SPIEGEL_N } from "@parrafraktor/engine";

export type SpiegelSeite = "hinten" | "vorn" | "beide";   // wohin die Vorderseite bei Tilt 0 zeigt
export interface NebelLampe { x: number; y: number; z: number }   // x: nach rechts, y: nach unten, z: nach vorn

const ELEMENT_B = 1.8;
const RASTER = ELEMENT_B / SPIEGEL_N;
const SPIEGEL_B = RASTER - 0.012;
const TIEFE = 0.5;                       // Abstand der Elemente hintereinander: angenommen, nicht gemessen
const LUECKE = 0.25;                     // Lücke, wenn sie in einer Reihe stehen
const RAUM = { x0: -5, x1: 5, y0: -3.5, y1: 2.6, z0: -4, z1: 9 };
// Kamera aus dem Publikum, leicht versetzt und waagerecht: Senkrechtes bleibt senkrecht.
// Sie steht außerhalb des Raums, jeder Punkt darin liegt also vor ihr.
const KAMERA = { x: 3.5, z: 10.5 };
const BLICK_L = Math.hypot(KAMERA.x, KAMERA.z - 0.5);
const VOR = { x: -KAMERA.x / BLICK_L, z: (0.5 - KAMERA.z) / BLICK_L };   // Blickrichtung zur Mitte des Aufbaus
const RECHTS = { x: -VOR.z, z: VOR.x };
const REFLEXION = 0.9;                   // Anteil, den ein Spiegel zurückwirft
const MAX_SPRUENGE = 6;
const STRAHL_MAX = 40;                   // länger als jede Strecke im Raum
const VORLICHT = 0.2;                    // Kegel bis zu den Elementen abgedunkelt, sonst überstrahlt er alles
const ABKLINGEN = 0.8;                   // Rest des letzten Bilds im Puffer
const AUSLAUF_M = 3.5;                   // Licht wird auf diesem Weg schwächer und endet nicht hart am Raumrand
const HELLIGKEIT = 300;
const AUFLOESUNG = 0.6;                  // Puffer gegenüber CSS-Pixeln: Der Nebel ist weich, das spart am meisten

export const NEBEL_STRAHLEN = 4000;
export const NEBEL_LAMPE_VORGABE: Readonly<NebelLampe> = { x: 0, y: 2.2, z: -3 };
export const NEBEL_ZOOM_VORGABE = 32;

// 36 Spiegel flach im Speicher, damit das Rechnen nichts anlegen muss
const FELDER = 12;
const ANZAHL = ELEMENTE * SPIEGEL_N;
const LAGE = ANZAHL * FELDER;            // dahinter je Element: cos, sin der Drehung, Mitte x und z
const GROESSE = LAGE + ELEMENTE * 4;
export function baueSpiegel(winkel: readonly number[], drehung: readonly number[], reihe: boolean, ziel = new Float64Array(GROESSE)): Float64Array {
  for (let k = 0; k < ELEMENTE; k++) {
    const r = reihe ? 0 : ((drehung[k] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const mx = reihe ? (k - (ELEMENTE - 1) / 2) * (ELEMENT_B + LUECKE) : 0;
    const mz = reihe ? TIEFE : TIEFE * (ELEMENTE - 1 - k);   // Element 1 steht vorn
    ziel[LAGE + k * 4] = c; ziel[LAGE + k * 4 + 1] = s; ziel[LAGE + k * 4 + 2] = mx; ziel[LAGE + k * 4 + 3] = mz;
    for (let i = 0; i < SPIEGEL_N; i++) {
      const a = (winkel[k * SPIEGEL_N + i]! * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const u = (i + 0.5) * RASTER - ELEMENT_B / 2, o = (k * SPIEGEL_N + i) * FELDER;
      // Mitte, halbe Breite, halbe Höhe (Kippachse), Normale der Seite, die bei Tilt 0 nach vorn zeigt
      ziel[o] = mx + u * c; ziel[o + 1] = u * s; ziel[o + 2] = mz;
      ziel[o + 3] = (ca * SPIEGEL_B * c) / 2; ziel[o + 4] = (ca * SPIEGEL_B * s) / 2; ziel[o + 5] = (sa * SPIEGEL_B) / 2;
      ziel[o + 6] = (-s * ELEMENT_B) / 2; ziel[o + 7] = (c * ELEMENT_B) / 2; ziel[o + 8] = 0;
      ziel[o + 9] = -sa * c; ziel[o + 10] = -sa * s; ziel[o + 11] = ca;
    }
  }
  return ziel;
}

function bisRaum(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (RAUM.x1 - ox) / dx); else if (dx < -1e-9) t = Math.min(t, (RAUM.x0 - ox) / dx);
  if (dy > 1e-9) t = Math.min(t, (RAUM.y1 - oy) / dy); else if (dy < -1e-9) t = Math.min(t, (RAUM.y0 - oy) / dy);
  if (dz > 1e-9) t = Math.min(t, (RAUM.z1 - oz) / dz); else if (dz < -1e-9) t = Math.min(t, (RAUM.z0 - oz) / dz);
  return Math.max(0, t);
}

export type Spur = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, staerke: number, ersterWeg: boolean) => void;

// Ein Strahl: läuft, bis er den Raum verlässt oder auf eine Rückseite trifft
export function verfolgeStrahl(
  sp: Float64Array, seite: SpiegelSeite, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, staerke: number, spur: Spur,
): void {
  let aus = -1, g = staerke;
  const bb = (SPIEGEL_B * SPIEGEL_B) / 4, hh = (ELEMENT_B * ELEMENT_B) / 4, rand = SPIEGEL_B / 2;
  const vz = seite === "hinten" ? -1 : 1;
  for (let sprung = 0; sprung <= MAX_SPRUENGE; sprung++) {
    let best = -1, tb = Infinity;
    // Ein Spiegel reicht nur eine halbe Breite um seine Achse: Jedes Element prüft nur die Spiegel,
    // an denen der Strahl auf seinem Weg durch diese Schicht vorbeikommt.
    for (let k = 0; k < ELEMENTE; k++) {
      const l = LAGE + k * 4, c = sp[l]!, s = sp[l + 1]!, mx = sp[l + 2]!, mz = sp[l + 3]!;
      let t0 = 0, t1 = STRAHL_MAX;
      if (Math.abs(dz) > 1e-9) {
        const a = (mz - rand - oz) / dz, b = (mz + rand - oz) / dz;
        t0 = Math.max(0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
        if (t1 < 0 || t0 > tb) continue;
      } else if (Math.abs(oz - mz) > rand) continue;
      const u0 = (ox + dx * t0 - mx) * c + (oy + dy * t0) * s, u1 = (ox + dx * t1 - mx) * c + (oy + dy * t1) * s;
      const i0 = Math.max(0, Math.floor((Math.min(u0, u1) - rand + ELEMENT_B / 2) / RASTER));
      const i1 = Math.min(SPIEGEL_N - 1, Math.floor((Math.max(u0, u1) + rand + ELEMENT_B / 2) / RASTER));
      for (let i = i0; i <= i1; i++) {
        const j = k * SPIEGEL_N + i;
        if (j === aus) continue;
        const o = j * FELDER;
        const nx = sp[o + 9]!, ny = sp[o + 10]!, nz = sp[o + 11]!;
        const nd = dx * nx + dy * ny + dz * nz;
        if (Math.abs(nd) < 1e-7) continue;
        const t = ((sp[o]! - ox) * nx + (sp[o + 1]! - oy) * ny + (sp[o + 2]! - oz) * nz) / nd;
        if (t < 1e-5 || t >= tb) continue;
        const px = ox + dx * t - sp[o]!, py = oy + dy * t - sp[o + 1]!, pz = oz + dz * t - sp[o + 2]!;
        if (Math.abs(px * sp[o + 3]! + py * sp[o + 4]! + pz * sp[o + 5]!) > bb) continue;
        if (Math.abs(px * sp[o + 6]! + py * sp[o + 7]! + pz * sp[o + 8]!) > hh) continue;
        best = j; tb = t;
      }
    }
    if (best < 0) {
      const t = bisRaum(ox, oy, oz, dx, dy, dz);
      spur(ox, oy, oz, ox + dx * t, oy + dy * t, oz + dz * t, g, sprung === 0);
      return;
    }
    const px = ox + dx * tb, py = oy + dy * tb, pz = oz + dz * tb;
    spur(ox, oy, oz, px, py, pz, g, sprung === 0);
    const o = best * FELDER;
    const nx = sp[o + 9]!, ny = sp[o + 10]!, nz = sp[o + 11]!;
    const nd = dx * nx + dy * ny + dz * nz;
    if (seite !== "beide" && nd * vz > 0) return;   // Rückseite schluckt das Licht
    dx -= 2 * nd * nx; dy -= 2 * nd * ny; dz -= 2 * nd * nz;
    ox = px; oy = py; oz = pz; aus = best; g *= REFLEXION;
  }
}

// Alle Strahlen: gleichmäßig über den Kegel, um (versatzU, versatzV) innerhalb der Rasterzelle verschoben
export function verfolgeAlle(
  sp: Float64Array, seite: SpiegelSeite, lampe: NebelLampe, zoom: number, anzahl: number, versatzU: number, versatzV: number, spur: Spur,
): number {
  // Achse zur Mitte des Aufbaus
  let ax = -lampe.x, ay = -lampe.y, az = TIEFE - lampe.z;
  const la = Math.hypot(ax, ay, az) || 1;
  ax /= la; ay /= la; az /= la;
  // Zwei Richtungen quer dazu
  const rl = Math.hypot(az, ax) || 1;
  const rx = az / rl, rz = -ax / rl;
  const ox = ay * rz, oy = az * rx - ax * rz, oz = -ay * rx;
  const halb = Math.tan((Math.min(170, zoom) * Math.PI) / 360);
  const dicht = Math.ceil(Math.sqrt((anzahl * 4) / Math.PI));
  let gezaehlt = 0;
  for (let ix = 0; ix < dicht; ix++) for (let iy = 0; iy < dicht; iy++) {
    const u = ((ix + versatzU) / dicht) * 2 - 1, v = ((iy + versatzV) / dicht) * 2 - 1, r = Math.hypot(u, v);
    if (r > 1) continue;
    gezaehlt++;
    const rand = (r - 0.88) / 0.12, g = r <= 0.88 ? 1 : 1 - rand * rand * (3 - 2 * rand);   // weicher Rand
    let dx = ax + (rx * u + ox * v) * halb, dy = ay + (oy * v) * halb, dz = az + (rz * u + oz * v) * halb;
    const l = Math.hypot(dx, dy, dz);
    dx /= l; dy /= l; dz /= l;
    verfolgeStrahl(sp, seite, lampe.x, lampe.y, lampe.z, dx, dy, dz, g, spur);
  }
  return gezaehlt;
}

// Lage im Bild und das Zeichnen
export class NebelBild {
  private readonly spiegel = new Float64Array(GROESSE);
  private readonly bild = document.createElement("canvas");
  private puffer = new Float32Array(0);
  private pixel: ImageData | null = null;
  private b = 0;
  private h = 0;
  private brenn = 1;   // Bildweite in CSS-Pixeln
  private mx = 0;      // Bildmitte
  private my = 0;
  private folge = 0;
  private letztes = 0;
  // Für die Anzeige, damit man es auf dem iPad ablesen kann
  private msRechnen = 0;
  private msBild = 16;

  private sx = (x: number, z: number) => {
    const dx = x - KAMERA.x, dz = z - KAMERA.z;
    return this.mx + (this.brenn * (dx * RECHTS.x + dz * RECHTS.z)) / (dx * VOR.x + dz * VOR.z);
  };
  private sy = (x: number, y: number, z: number) =>
    this.my + (this.brenn * y) / ((x - KAMERA.x) * VOR.x + (z - KAMERA.z) * VOR.z);

  private passe(b: number, h: number): void {
    this.brenn = 2 * Math.min(h, b / 1.6);
    this.mx = b / 2;
    this.my = h / 2;
    const breite = Math.max(1, Math.round(b * AUFLOESUNG)), hoehe = Math.max(1, Math.round(h * AUFLOESUNG));
    if (breite === this.b && hoehe === this.h) return;
    this.b = breite; this.h = hoehe;
    this.bild.width = breite; this.bild.height = hoehe;
    this.puffer = new Float32Array(breite * hoehe);
    this.pixel = this.bild.getContext("2d")?.createImageData(breite, hoehe) ?? null;
  }

  // Punkt auf dem Canvas (CSS-Pixel) → Lampe: Sie bleibt in ihrer Tiefe und folgt dem Finger
  punkt(x: number, y: number, lampe: NebelLampe): NebelLampe {
    const qx = (x - this.mx) / this.brenn, qy = (y - this.my) / this.brenn;
    const dx = VOR.x + RECHTS.x * qx, dz = VOR.z + RECHTS.z * qx;
    const t = (lampe.z - KAMERA.z) / dz;
    return {
      x: Math.min(RAUM.x1 - 0.2, Math.max(RAUM.x0 + 0.2, KAMERA.x + dx * t)),
      y: Math.min(RAUM.y1 - 0.2, Math.max(RAUM.y0 + 0.2, qy * t)),
      z: lampe.z,
    };
  }

  aufLampe(x: number, y: number, lampe: NebelLampe): boolean {
    return Math.hypot(x - this.sx(lampe.x, lampe.z), y - this.sy(lampe.x, lampe.y, lampe.z)) < 32;
  }

  // Lichtspur von a nach b, die Stärke läuft von ga nach gb
  private spurZeichnen(ax: number, ay: number, bx: number, by: number, ga: number, gb: number): void {
    const w = this.b, h = this.h, p = this.puffer;
    let dx = bx - ax, dy = by - ay;
    // Auf das Bild beschneiden: Nah an der Kamera werden Spuren sehr lang
    let t0 = 0, t1 = 1;
    const kante = (q: number, r: number): boolean => {
      if (q === 0) return r >= 0;
      const t = r / q;
      if (q < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    if (!kante(-dx, ax) || !kante(dx, w - 1 - ax) || !kante(-dy, ay) || !kante(dy, h - 1 - ay)) return;
    const gStart = ga + (gb - ga) * t0, gEnde = ga + (gb - ga) * t1;
    const x0 = ax + dx * t0, y0 = ay + dy * t0;
    dx *= t1 - t0; dy *= t1 - t0;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const n = Math.ceil(Math.max(adx, ady));
    if (n < 1) return;
    // Gleich viel Licht je Länge, auch schräg; auf zwei Nachbarpixel verteilt gegen Treppen
    const faktor = Math.hypot(dx, dy) / n, sx = dx / n, sy = dy / n, sg = ((gEnde - gStart) * faktor) / n;
    let x = x0, y = y0, je = gStart * faktor;
    if (adx >= ady) {
      for (let i = 0; i < n; i++, x += sx, y += sy, je += sg) {
        const yy = y - 0.5, q = x | 0, r = Math.floor(yy), f = yy - r;
        if (x < 0 || q >= w || r < 0 || r + 1 >= h) continue;
        p[r * w + q]! += je * (1 - f);
        p[(r + 1) * w + q]! += je * f;
      }
    } else {
      for (let i = 0; i < n; i++, x += sx, y += sy, je += sg) {
        const xx = x - 0.5, r = y | 0, q = Math.floor(xx), f = xx - q;
        if (y < 0 || r >= h || q < 0 || q + 1 >= w) continue;
        p[r * w + q]! += je * (1 - f);
        p[r * w + q + 1]! += je * f;
      }
    }
  }

  zeichne(
    ctx: CanvasRenderingContext2D, breite: number, hoehe: number, winkel: readonly number[], drehung: readonly number[], reihe: boolean,
    lampe: NebelLampe, zoom: number, seite: SpiegelSeite, farbe: string,
  ): void {
    const start = performance.now();
    this.passe(breite, hoehe);
    const sp = baueSpiegel(winkel, drehung, reihe, this.spiegel);
    const p = this.puffer;
    for (let i = 0; i < p.length; i++) p[i]! *= ABKLINGEN;

    // Weg der Lampe bis zur ersten Elementebene abgedunkelt
    const grenze = lampe.z < 0 ? 0 : lampe.z > TIEFE * (ELEMENTE - 1) ? TIEFE * (ELEMENTE - 1) : null;
    const px = (x: number, z: number) => this.sx(x, z) * AUFLOESUNG;
    const py = (x: number, y: number, z: number) => this.sy(x, y, z) * AUFLOESUNG;
    // Stück zeichnen; der Weg zählt ab den Elementen, dahinter wird das Licht schwächer
    let weg = 0;
    const stueck = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, g: number) => {
      const lang = Math.hypot(bx - ax, by - ay, bz - az);
      const ga = g * Math.exp(-weg / AUSLAUF_M);
      weg += lang;
      this.spurZeichnen(px(ax, az), py(ax, ay, az), px(bx, bz), py(bx, by, bz), ga, g * Math.exp(-weg / AUSLAUF_M));
    };
    const dunkel = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, g: number) =>
      this.spurZeichnen(px(ax, az), py(ax, ay, az), px(bx, bz), py(bx, by, bz), g * VORLICHT, g * VORLICHT);
    this.folge++;
    const versatzU = (this.folge * 0.7548776662) % 1, versatzV = (this.folge * 0.5698402910) % 1;
    const anzahl = verfolgeAlle(sp, seite, lampe, zoom, NEBEL_STRAHLEN, versatzU, versatzV, (ax, ay, az, bx, by, bz, g, erster) => {
      if (erster) weg = 0;
      if (erster && grenze !== null) {
        const t = (grenze - az) / (bz - az || 1e-9);
        if (t >= 1) {
          dunkel(ax, ay, az, bx, by, bz, g);
        } else if (t <= 0) {
          stueck(ax, ay, az, bx, by, bz, g);
        } else {
          const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
          dunkel(ax, ay, az, mx, my, grenze, g);
          stueck(mx, my, grenze, bx, by, bz, g);
        }
      } else {
        stueck(ax, ay, az, bx, by, bz, g);
      }
    });

    // Puffer → Farbe. Heller, wenn das Bild größer ist; die Spuren werden dort ja länger.
    const [fr, fg, fb] = farbe.split(",").map(Number) as [number, number, number];
    const s = (HELLIGKEIT * (1 - ABKLINGEN) * ((this.brenn * AUFLOESUNG) / 340)) / Math.max(1, anzahl);
    const d = this.pixel;
    if (d) {
      const data = d.data;
      for (let i = 0, o = 0; i < p.length; i++, o += 4) {
        const v = p[i]! * s;
        const k = v < 0.002 ? v : 1 - Math.exp(-v);
        data[o] = 4 + (fr - 4) * k;
        data[o + 1] = 3 + (fg - 3) * k;
        data[o + 2] = 8 + (fb - 8) * k;
        data[o + 3] = 255;
      }
      this.bild.getContext("2d")?.putImageData(d, 0, 0);
    }
    const ende = performance.now();
    this.msRechnen += (ende - start - this.msRechnen) * 0.08;
    if (this.letztes) this.msBild += (Math.min(250, ende - this.letztes) - this.msBild) * 0.08;
    this.letztes = ende;

    ctx.drawImage(this.bild, 0, 0, breite, hoehe);
    this.deko(ctx, breite, hoehe, sp, lampe, farbe, anzahl);
  }

  // Boden, Spiegel als Scherenschnitt, Lampe, Messwerte
  private deko(ctx: CanvasRenderingContext2D, breite: number, hoehe: number, sp: Float64Array, lampe: NebelLampe, farbe: string, anzahl: number): void {
    const X = this.sx, Y = this.sy;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    // Umriss des Bodens
    [[RAUM.x0, RAUM.z0], [RAUM.x1, RAUM.z0], [RAUM.x1, RAUM.z1], [RAUM.x0, RAUM.z1], [RAUM.x0, RAUM.z0]].forEach(([x, z], e) => {
      if (e) ctx.lineTo(X(x!, z!), Y(x!, RAUM.y1, z!));
      else ctx.moveTo(X(x!, z!), Y(x!, RAUM.y1, z!));
    });
    ctx.stroke();
    const lx = X(lampe.x, lampe.z), ly = Y(lampe.x, lampe.y, lampe.z), r = 12;
    const lampeZeichnen = () => {
      const glanz = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
      glanz.addColorStop(0, `rgba(${farbe},0.9)`);
      glanz.addColorStop(1, `rgba(${farbe},0)`);
      ctx.fillStyle = glanz;
      ctx.beginPath(); ctx.arc(lx, ly, r, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = `rgb(${farbe})`;
      ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, 2 * Math.PI); ctx.fill();
    };
    // Scherenschnitt von hinten nach vorn: Vorderes verdeckt Hinteres, auch die Lampe dahinter.
    // Reihenfolge nach Tiefe, weil die Elemente in einer Reihe alle gleich weit vorn stehen können.
    const ordnung = Array.from({ length: ELEMENTE }, (_, k) => k).sort((a, b) => sp[LAGE + a * 4 + 3]! - sp[LAGE + b * 4 + 3]!);
    let lampeFehlt = true;
    for (const k of ordnung) {
      const l = LAGE + k * 4, c = sp[l]!, s = sp[l + 1]!, mx = sp[l + 2]!, mz = sp[l + 3]!, h = ELEMENT_B / 2;
      if (lampeFehlt && lampe.z < mz) { lampeZeichnen(); lampeFehlt = false; }
      ctx.fillStyle = "rgba(6,5,10,0.88)";
      for (let i = 0; i < SPIEGEL_N; i++) {
        const o = (k * SPIEGEL_N + i) * FELDER;
        ctx.beginPath();
        for (let e = 0; e < 4; e++) {
          const a = e === 0 || e === 3 ? -1 : 1, b = e < 2 ? -1 : 1;
          const x = sp[o]! + a * sp[o + 3]! + b * sp[o + 6]!, y = sp[o + 1]! + a * sp[o + 4]! + b * sp[o + 7]!, z = sp[o + 2]! + a * sp[o + 5]! + b * sp[o + 8]!;
          if (e) ctx.lineTo(X(x, z), Y(x, y, z));
          else ctx.moveTo(X(x, z), Y(x, y, z));
        }
        ctx.closePath();
        ctx.fill();
      }
      // Rahmen: in seiner Ebene gedreht, sonst nichts
      ctx.strokeStyle = "rgba(232,236,244,0.5)";
      ctx.beginPath();
      for (let e = 0; e < 5; e++) {
        const a = e === 0 || e === 3 || e === 4 ? -h : h, b = e < 2 || e === 4 ? -h : h;
        const x = mx + a * c - b * s, y = a * s + b * c;
        if (e) ctx.lineTo(X(x, mz), Y(x, y, mz));
        else ctx.moveTo(X(x, mz), Y(x, y, mz));
      }
      ctx.stroke();
    }
    if (lampeFehlt) lampeZeichnen();

    ctx.font = "600 10px -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    // am Boden über die Lampe, sonst ragt der Hinweis aus dem Bild
    ctx.fillText("Scheinwerfer ziehen", Math.max(52, Math.min(breite - 52, lx)), ly + r + 12 > hoehe ? ly - r - 12 : ly + r);
    ctx.textAlign = "right";
    ctx.fillText(`${anzahl} Strahlen · ${this.msRechnen.toFixed(1)} ms · ${Math.round(1000 / this.msBild)} Bilder/s`, breite - 8, 6);
  }
}
