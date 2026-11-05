// Pattern-Engine (Grundbewegung): dieselbe Rechnung wie die Simulation auf der Website (parrafraktor.js).
// Ein Pattern ist eine Grundbewegung (Sinus, Pendelwelle, Wind, Rotation, Öffnung, Ruhe), die dauerhaft läuft;
// Ereignisse wie Flash oder Flyout sind Impulse (impuls.ts). Alle Bewegungen sind weich, ohne Ruck.
// Wie sie über die Spiegel läuft, bestimmen die Regler: Offset, Amplitude, Speed von/bis, Phase und
// Group wie die MAtricks der grandMA3, dazu die Verteilung aus Ordnung (innerhalb eines Elements),
// Element-Folge, Gegenlauf und Fächer.
// Rechnet in double wie die Simulation, damit Vorschau und Spiegel gleich fahren. Nur die Öffnung
// gibt es in der Simulation nicht.
import { SPIEGEL_GESAMT, SPIEGEL_N, elementGespiegelt, elementRaenge, elementRang, type ElementFolge } from "./aufbau.js";

export const MODI = ["sinus", "pendelwelle", "wind", "rotation", "oeffnung", "ruhe"] as const;
export type Modus = (typeof MODI)[number];

export const MODUS_NAME: Record<Modus, string> = {
  sinus: "Sinus",
  pendelwelle: "Pendelwelle",
  wind: "Wind",
  rotation: "Rotation",
  oeffnung: "Öffnung",
  ruhe: "Ruhe",
};

export const istModus = (x: unknown): x is Modus => typeof x === "string" && (MODI as readonly string[]).includes(x);

// Ordnung: in welcher Reihenfolge das Muster die zwölf Spiegel eines Elements erreicht
export const ORDNUNGEN = ["links", "rechts", "mitteAussen", "aussenMitte", "verschachtelt", "zufall"] as const;
export type Ordnung = (typeof ORDNUNGEN)[number];
export const ORDNUNG_NAME: Record<Ordnung, string> = {
  links: "links → rechts",
  rechts: "rechts → links",
  mitteAussen: "Mitte → außen",
  aussenMitte: "außen → Mitte",
  verschachtelt: "verschachtelt",
  zufall: "Zufall",
};
export const istOrdnung = (x: unknown): x is Ordnung => (ORDNUNGEN as readonly unknown[]).includes(x);

// Öffnung: wie das Loch sich bewegt
export const BAHNEN = ["kreis", "linie", "iris", "drift"] as const;
export type Bahn = (typeof BAHNEN)[number];
export const BAHN_NAME: Record<Bahn, string> = { kreis: "Kreis", linie: "Linie", iris: "Iris", drift: "Drift" };
export const istBahn = (x: unknown): x is Bahn => (BAHNEN as readonly unknown[]).includes(x);

// Feste Mischung für die Ordnung "Zufall": Platz des Spiegels i
const ZUFALL_FOLGE = [7, 2, 10, 4, 0, 9, 5, 11, 1, 8, 3, 6];

export interface Parameter {
  modus: Modus;
  offset: number;      // Grad, Grundstellung aller Spiegel
  // Offset je Element: getrennt = jedes Element hat seine eigene Grundstellung
  offsetGetrennt: boolean;
  offsetElemente: number[];
  amplitude: number;   // Grad
  // Speed von/bis wie in den MAtricks: erster Spiegel der Auswahl läuft mit "von",
  // der letzte mit "bis", dazwischen verteilt (Durchläufe pro Minute, BPM).
  // 0 = aus: dann gilt nur der andere Wert, alle Spiegel laufen gleich schnell.
  speedVon: number;
  speedBis: number;
  phase: number;       // Grad, Versatz über die Auswahl wie MAtricks-Phase (360° = eine Welle über die Auswahl)
  // Sinus: Anteil des Durchlaufs, in dem sich ein Spiegel bewegt, wie Width im Phaser der grandMA3.
  // 100 = immer, darunter steht er den Rest der Zeit auf Offset: eine schmale Welle zieht durch.
  breite: number;      // %
  group: number;       // Gruppengröße wie MAtricks-Groups, 0 = aus
  faecher: number;     // %, Amplitude wächst entlang der Ordnung (bei Mitte/außen: zum Rand hin)
  schwuenge: number;   // Pendelwelle: nach so vielen Schwüngen des ersten Spiegels laufen alle wieder gleich
  wellenlaenge: number; // Wind: so viele Spiegel bewegen sich ähnlich
  // Öffnung: ein Loch durch alle hintereinanderstehenden Elemente (siehe unten)
  bahn: Bahn;
  groesse: number;     // cm, Radius des Lochs
  weite: number;       // cm, wie weit es von der Mitte wandert (Iris: um so viel geht es auf)
  kante: number;       // %, von hart bis weich
  wabern: number;      // %, Atmen, Abdriften und Verformen
  nachlauf: number;    // %, die Elemente laufen einander nach; 100 = je Element ¼ Durchlauf
  ordnung: Ordnung;
  elementFolge: ElementFolge;
  gegenlauf: boolean;  // linke Hälfte jedes Elements gespiegelt
  pingpong: boolean;   // Muster läuft hin und wieder zurück
  laeuft: boolean;
}

export const PARAMETER_VORGABE: Readonly<Parameter> = {
  modus: "sinus",
  offset: 0,
  offsetGetrennt: false,
  offsetElemente: [0, 0, 0],
  amplitude: 40,
  speedVon: 3,
  speedBis: 0,
  phase: 360,
  breite: 100,
  group: 0,
  faecher: 0,
  schwuenge: 24,
  wellenlaenge: 8,
  bahn: "kreis",
  groesse: 30,
  weite: 35,
  kante: 30,
  wabern: 30,
  nachlauf: 10,
  ordnung: "links",
  elementFolge: "vorneHinten",
  gegenlauf: false,
  pingpong: false,
  laeuft: true,
};

// Stellung eines Spiegels: Winkel in Grad und Drehzahl für TiltRotate (U/min, 0 = steht)
export interface Stellung {
  tilt: number;
  upm: number;
}

// Weicher Übergang 0 → 1: Geschwindigkeit und Beschleunigung sind am Anfang und Ende null
export const weich = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));

// Ganzzahliges Gitter → 0 … 1, immer gleich (für das Rauschen)
export const gitter = (x: number, y: number): number => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Weiches Rauschen (Gradientenrauschen) über x und t, etwa −1 … 1
function rauschen(x: number, t: number): number {
  const x0 = Math.floor(x), t0 = Math.floor(t), fx = x - x0, ft = t - t0;
  const g = (ix: number, it: number, dx: number, dt: number) => {
    const w = gitter(ix, it) * 2 * Math.PI;
    return Math.cos(w) * dx + Math.sin(w) * dt;
  };
  const a = g(x0, t0, fx, ft), b = g(x0 + 1, t0, fx - 1, ft);
  const c = g(x0, t0 + 1, fx, ft - 1), d = g(x0 + 1, t0 + 1, fx - 1, ft - 1);
  const sx = weich(fx), st = weich(ft);
  return (a + (b - a) * sx + (c - a) * st + (a - b - c + d) * sx * st) * Math.SQRT2;
}

// Wind: Böen ziehen entlang der Ordnung durch (eine Wellenlänge je Durchlauf) und verändern sich
// dabei langsam. Eine Lage Rauschen, weich auf −1 … 1 begrenzt.
export const wind = (x: number, t: number): number =>
  Math.tanh(1.3 * rauschen(x - t, 0.4 * t + 3.7)) / Math.tanh(1.3);

// ---------- Öffnung ----------
// Licht kommt nur durch, wo alle drei hintereinanderstehenden Elemente offen sind (Spiegel hochkant).
// Für ein Loch an (x, y) öffnet deshalb jedes Element nur einen Schlitz: die Spiegel an der
// Projektion des Lochs auf seine Achse, je nach seiner Drehung. Die Schlitze kreuzen sich im Loch.
// Halb offene Spiegel am Rand lassen es weich zwischen den Spiegelreihen gleiten.
const RASTER_M = 1.8 / SPIEGEL_N;

interface Loch { x: number; y: number; r: number }   // Meter, Bildmitte = 0, y nach unten

// Lage des Lochs nach u Durchläufen
function lochBei(p: Parameter, u: number): Loch {
  const w = p.weite / 100, t = 2 * Math.PI * u;
  let loch: Loch = { x: 0, y: 0, r: p.groesse / 100 };
  switch (p.bahn) {
    case "kreis": loch = { ...loch, x: w * Math.cos(t), y: w * Math.sin(t) }; break;
    case "linie": loch = { ...loch, x: w * Math.sin(t) }; break;
    case "iris": loch = { ...loch, r: loch.r + w * (0.5 - 0.5 * Math.cos(t)) }; break;
    case "drift": loch = { ...loch, x: w * 1.4 * rauschen(u, 3.1), y: w * 1.4 * rauschen(u, 8.7) }; break;
  }
  // Wabern: langsames Rauschen, schneller als die Bahn, damit es auch bei ruhiger Bahn lebt
  const stark = p.wabern / 100, z = 3 * u;
  return {
    x: loch.x + 0.2 * stark * rauschen(z, 21.3),
    y: loch.y + 0.2 * stark * rauschen(z, 34.9),
    r: Math.max(0, loch.r * (1 + 0.7 * stark * rauschen(z, 47.1))),
  };
}

// Wie weit Spiegel i von Element k offen ist (0 … 1)
function schlitz(p: Parameter, u: number, drehung: number, k: number, i: number): number {
  const eigen = u - (p.nachlauf / 100) * 0.25 * k;
  const loch = lochBei(p, eigen);
  const a = (drehung * Math.PI) / 180;
  // Eigene kleine Abweichung je Element: Die Schlitze treffen sich nicht ganz, das Loch verformt sich
  const zittern = 0.08 * (p.wabern / 100) * rauschen(3 * eigen, 60 + 13 * k);
  const mitte = loch.x * Math.cos(a) + loch.y * Math.sin(a) + zittern;
  const lage = (i + 0.5) * RASTER_M - 0.9;
  const kante = 0.03 + 0.4 * (p.kante / 100);
  return weich((loch.r + kante - Math.abs(lage - mitte)) / (2 * kante));
}

// Steht ein Regler auf aus (0), übernimmt er den Wert des anderen
const speeds = (p: Parameter): [number, number] => [p.speedVon || p.speedBis, p.speedBis || p.speedVon];

interface Auswahl {
  platz: number;
  anzahl: number;
  anteil: number;
  versatz: number;
  lage: number;    // für den Fächer: 0 … 1 entlang der Ordnung bzw. von der Mitte zum Rand
  seite: number;   // −1 für die gespiegelte Hälfte bei Gegenlauf
}

// Platz des Spiegels i (0 … 11) innerhalb seines Elements gemäß Ordnung, von anzahl Plätzen.
// Bei Mitte/außen teilen sich die beiden Hälften die Plätze.
export function ordnungsPlatz(ordnung: Ordnung, i: number): { platz: number; anzahl: number } {
  const h = SPIEGEL_N / 2, vonInnen = i < h ? h - 1 - i : i - h;
  switch (ordnung) {
    case "rechts": return { platz: SPIEGEL_N - 1 - i, anzahl: SPIEGEL_N };
    case "mitteAussen": return { platz: vonInnen, anzahl: h };
    case "aussenMitte": return { platz: h - 1 - vonInnen, anzahl: h };
    case "verschachtelt": return { platz: i % 2 === 0 ? i / 2 : h + (i - 1) / 2, anzahl: SPIEGEL_N };
    case "zufall": return { platz: ZUFALL_FOLGE[i]!, anzahl: SPIEGEL_N };
    default: return { platz: i, anzahl: SPIEGEL_N };
  }
}

// Platz des Spiegels g in der Auswahl, wie in der grandMA3: daraus ergibt sich sein Phasenversatz
// (Bruchteil eines Durchlaufs, 0 … 1). Erst die Ordnung innerhalb des Elements, dann die Element-Folge
// (laufen die Elemente nacheinander, zählen die Plätze über alle drei weiter), zuletzt die Groups.
// Bei Element-Folge Mitte → außen ist das erste Element das Spiegelbild des dritten.
export function auswahl(p: Parameter, g: number): Auswahl {
  const k = Math.floor(g / SPIEGEL_N), h = SPIEGEL_N / 2;
  const gespiegelt = elementGespiegelt(p.elementFolge, k);
  const i = gespiegelt ? SPIEGEL_N - 1 - (g % SPIEGEL_N) : g % SPIEGEL_N;
  const vonInnen = i < h ? h - 1 - i : i - h;
  let { platz, anzahl } = ordnungsPlatz(p.ordnung, i);
  const rang = elementRang(p.elementFolge, k);
  if (rang !== null) { platz += rang * anzahl; anzahl *= elementRaenge(p.elementFolge); }
  const mitte = p.ordnung === "mitteAussen" || p.ordnung === "aussenMitte";
  const lage = mitte ? (vonInnen + 0.5) / h : (platz + 0.5) / anzahl;
  // Groups: das Muster wiederholt sich alle "group" Spiegel
  if (p.group > 0) { platz %= p.group; anzahl = Math.min(anzahl, p.group); }
  // anteil: Lage in der Auswahl von 0 (erster) bis 1 (letzter) – für Speed von/bis
  const anteil = anzahl > 1 ? Math.min(1, platz / (anzahl - 1)) : 0;
  // Gegenlauf: linke Hälfte gespiegelt; im gespiegelten Element der ganze Winkel noch einmal
  const seite = p.gegenlauf ? (i < h ? -1 : 1) * (gespiegelt ? -1 : 1) : 1;
  return { platz, anzahl, anteil, lage, seite, versatz: (p.phase / 360) * (platz / anzahl) };
}

// Zeitkonstante, mit der die Spiegel wieder zusammenlaufen, wenn alle gleich schnell sind
const GLEICHLAUF_S = 0.4;

export class Engine {
  // Durchläufe bei Speed "von": Bezug für den Gleichlauf und Zeit des Winds
  umlaufVon = 0;
  // bisher gelaufene Durchläufe je Spiegel. Jeder Spiegel zählt selbst, damit beim Verstellen
  // von Speed nichts springt – das Muster läuft nur schneller oder langsamer.
  readonly umlauf = new Float64Array(SPIEGEL_GESAMT);
  private letzterModus: Modus | null = null;
  // Drehung der Elemente in ihrer Ebene (Grad), nur die Öffnung braucht sie. Aus den Einstellungen.
  drehung: readonly number[] = [0, 45, 90];

  // Zeit weiterlaufen lassen (dt in Sekunden)
  weiter(p: Parameter, dt: number): void {
    if (!p.laeuft) return;
    // Pendelwelle startet im Gleichlauf, damit man das Auseinanderlaufen sieht
    if (p.modus !== this.letzterModus) {
      if (p.modus === "pendelwelle") this.umlauf.fill(this.umlaufVon);
      this.letzterModus = p.modus;
    }
    const [von, bis] = speeds(p);
    this.umlaufVon += (dt * von) / 60;
    const zug = 1 - Math.exp(-dt / GLEICHLAUF_S);
    for (let g = 0; g < SPIEGEL_GESAMT; g++) {
      if (p.modus === "pendelwelle") {
        // Wie bei echten Pendeln: Während der erste Spiegel "schwuenge" Mal schwingt, schafft jeder
        // folgende einen Schwung mehr als sein Vorgänger – dann stehen wieder alle gleich.
        // Speed ist das Tempo des ersten Spiegels und beschleunigt damit das ganze Bild.
        this.umlauf[g] += ((dt * von) / 60) * (1 + auswahl(p, g).platz / p.schwuenge);
      } else if (von === bis) {
        // Alle gleich schnell (Speed bis aus): Abstand zum Bezug abbauen, damit bei Phase 0 wieder
        // alle Spiegel gleich laufen. Ganze Durchläufe sind unsichtbar und fallen sofort weg,
        // der Rest (höchstens ½ Durchlauf) läuft weich auf dem kürzesten Weg zu.
        this.umlauf[g] += (dt * von) / 60;
        const d = this.umlaufVon - this.umlauf[g]!;
        const ganz = Math.round(d);
        this.umlauf[g] += ganz + (d - ganz) * zug;
      } else {
        this.umlauf[g] += (dt * (von + (bis - von) * auswahl(p, g).anteil)) / 60;
      }
    }
  }

  // Umlauf setzen wie in der Simulation, die nur die Zähler für "von" und "bis" kennt
  setzeUmlauf(p: Parameter, von: number, bis: number): void {
    this.umlaufVon = von;
    for (let g = 0; g < SPIEGEL_GESAMT; g++) this.umlauf[g] = von + (bis - von) * auswahl(p, g).anteil;
  }

  // Stellung des Spiegels g (0 … 35, Element k = g / 12)
  spiegel(p: Parameter, g: number): Stellung {
    const k = Math.floor(g / SPIEGEL_N);
    // Öffnung: zu = 0°, offen = hochkant; Offset und Amplitude gelten hier nicht
    if (p.modus === "oeffnung") {
      return { tilt: 90 * schlitz(p, this.umlaufVon, this.drehung[k] ?? 0, k, g % SPIEGEL_N), upm: 0 };
    }
    const offset = p.offsetGetrennt ? (p.offsetElemente[k] ?? p.offset) : p.offset;
    if (p.modus === "rotation") {
      // Endlos drehen geht nur über TiltRotate: Drehzahl wie Speed von/bis, Tilt bleibt auf Offset
      const [von, bis] = speeds(p);
      return { tilt: offset, upm: p.laeuft ? von + (bis - von) * auswahl(p, g).anteil : 0 };
    }
    // Gegenlauf spiegelt die linke Hälfte ganz, auch den Offset: aus 30° wird links −30°, sonst wäre
    // das Bild nur bei Offset 0 symmetrisch. (Der Ausschlag hat seine Seite schon in pattern().)
    const seite = p.modus === "ruhe" ? 1 : auswahl(p, g).seite;
    return { tilt: seite * offset + this.pattern(p, g), upm: 0 };
  }

  alle(p: Parameter): Stellung[] {
    return Array.from({ length: SPIEGEL_GESAMT }, (_, g) => this.spiegel(p, g));
  }

  // Ausschlag des Patterns (in Grad)
  private pattern(p: Parameter, g: number): number {
    const { platz, anzahl, versatz, lage, seite } = auswahl(p, g);
    const faecher = p.faecher / 100;
    const A = p.amplitude * (1 - faecher + faecher * lage);
    const u = this.umlauf[g]!;
    switch (p.modus) {
      // Pendelwelle: jeder Spiegel schwingt mit eigener Frequenz (siehe weiter)
      case "pendelwelle": return seite * A * Math.sin(2 * Math.PI * u);
      // Wind: weiches Rauschen über die Spiegel und die Zeit, wiederholt sich nie
      case "wind": return seite * A * wind(platz / p.wellenlaenge, this.umlaufVon);
      case "rotation": return 0;   // läuft über TiltRotate, siehe spiegel()
      case "oeffnung": return 0;   // eigene Rechnung, siehe spiegel()
      case "ruhe": return 0;       // alle auf Offset, nur Impulse bewegen
    }
    // Sinus. Ping-Pong: Das Muster läuft einen Durchlauf lang hin und wieder zurück, bis kurz vor den
    // letzten Spiegel, damit es am Wendepunkt nicht auf den ersten überspringt
    const lauf = p.pingpong ? (1 - Math.abs(2 * (((u % 1) + 1) % 1) - 1)) * (1 - 1 / anzahl) : u;
    // bisherige Laufzeit, verschoben um die Phase, zusammengedrängt auf die Breite
    return seite * A * Math.sin(2 * Math.PI * schmal(lauf - versatz, p.breite / 100));
  }
}

// Breite (Width): Der Durchlauf t eines Spiegels wird auf den Anteil b gedrängt, danach steht er bis
// zum nächsten Durchlauf (Sinus 0 = Offset). Damit er dabei nicht ruckt, läuft das Stück weich an und
// aus; zwischen 100 % und 90 % wird dorthin übergeblendet, damit Verstellen nicht springt.
export function schmal(t: number, b: number): number {
  if (b >= 1) return t;
  const x = t - Math.floor(t);
  if (x >= b) return 0;
  const y = x / b;
  return y + (weich(y) - y) * Math.min(1, (1 - b) / 0.1);
}

// Zwei Stellungen überblenden: anteil 0 = a, 1 = b
export function mische(a: readonly Stellung[], b: readonly Stellung[], anteil: number): Stellung[] {
  return b.map((s, g) => {
    const v = a[g] ?? s;
    return { tilt: v.tilt + (s.tilt - v.tilt) * anteil, upm: v.upm + (s.upm - v.upm) * anteil };
  });
}
