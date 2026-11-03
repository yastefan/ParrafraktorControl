// Pattern-Engine: dieselbe Rechnung wie die Simulation auf der Website (parrafraktor.js).
// Ein Pattern ist nur noch eine Form (Sinus, Puls, …). Alle Formen beginnen und enden ohne Ruck
// (Geschwindigkeit und Beschleunigung gehen weich gegen null), damit die Motoren sanft fahren. Wie sie über die Spiegel läuft, bestimmen die
// Regler: Offset, Amplitude, Speed von/bis, Phase und Group wie die MAtricks der grandMA3, dazu
// Symmetrie, Richtung, Fächer und Reihenfolge.
// Rechnet in double wie die Simulation, damit Vorschau und Spiegel gleich fahren.
import { SPIEGEL_GESAMT, SPIEGEL_N } from "./aufbau.js";

export const MODI = ["sinus", "saegezahn", "puls", "flyout", "blinder", "funkeln", "rotation"] as const;
export type Modus = (typeof MODI)[number];

export const MODUS_NAME: Record<Modus, string> = {
  sinus: "Sinus",
  saegezahn: "Sägezahn",
  puls: "Puls",
  flyout: "Flyout",
  blinder: "Blinder",
  funkeln: "Funkeln",
  rotation: "Rotation",
};

export const istModus = (x: unknown): x is Modus => typeof x === "string" && (MODI as readonly string[]).includes(x);

// Symmetrie: aus = Reihenfolge von links nach rechts. innen/aussen = Reihenfolge von der Mitte
// nach außen bzw. umgekehrt, beide Hälften gleich (wie MAtricks-Wings) und gegenläufig gedreht.
export const SYMMETRIEN = ["aus", "innen", "aussen"] as const;
export type Symmetrie = (typeof SYMMETRIEN)[number];
export const SYMMETRIE_NAME: Record<Symmetrie, string> = { aus: "aus", innen: "von innen", aussen: "von außen" };

// Richtung, in der das Muster über die Spiegel läuft. Ping-Pong: hin und zurück.
export const RICHTUNGEN = ["vor", "zurueck", "pingpong"] as const;
export type Richtung = (typeof RICHTUNGEN)[number];
export const RICHTUNG_NAME: Record<Richtung, string> = { vor: "vor", zurueck: "zurück", pingpong: "Ping-Pong" };

export interface Parameter {
  modus: Modus;
  offset: number;      // Grad, Grundstellung aller Spiegel
  amplitude: number;   // Grad
  // Speed von/bis wie in den MAtricks: erster Spiegel der Auswahl läuft mit "von",
  // der letzte mit "bis", dazwischen verteilt (Durchläufe pro Minute, BPM).
  // 0 = aus: dann gilt nur der andere Wert, alle Spiegel laufen gleich schnell.
  speedVon: number;
  speedBis: number;
  phase: number;       // Grad, Versatz über die Auswahl wie MAtricks-Phase
  group: number;       // Gruppengröße wie MAtricks-Groups, 0 = aus
  symmetrie: Symmetrie;
  richtung: Richtung;
  faecher: number;     // %, Amplitude wächst entlang der Reihenfolge (mit Symmetrie: zum Rand hin)
  jeElement: boolean;  // Reihenfolge je Element (wie "Classic") statt über alle 36 Spiegel
  laeuft: boolean;
}

export const PARAMETER_VORGABE: Readonly<Parameter> = {
  modus: "sinus",
  offset: 0,
  amplitude: 40,
  speedVon: 3,
  speedBis: 0,
  phase: 360,
  group: 0,
  symmetrie: "aus",
  richtung: "vor",
  faecher: 0,
  jeElement: false,
  laeuft: true,
};

// Stellung eines Spiegels: Winkel in Grad und Drehzahl für TiltRotate (U/min, 0 = steht)
export interface Stellung {
  tilt: number;
  upm: number;
}

// Weicher Übergang 0 → 1: Geschwindigkeit und Beschleunigung sind am Anfang und Ende null
export const weich = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));

// Weicher Ausschlag 0 → 1 → 0 über x = 0 … 1 (angehobener Kosinus)
const buckel = (x: number): number => (1 - Math.cos(2 * Math.PI * x)) / 2;

// Zufallszahl 0 … 1, immer gleich für dieselben Eingaben (fürs Funkeln)
const zufall = (a: number, b: number): number => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Steht ein Regler auf aus (0), übernimmt er den Wert des anderen
const speeds = (p: Parameter): [number, number] => [p.speedVon || p.speedBis, p.speedBis || p.speedVon];

interface Auswahl {
  anzahl: number;
  anteil: number;
  versatz: number;
  lage: number;   // für den Fächer: 0 … 1 entlang der Reihenfolge bzw. von der Mitte zum Rand
}

// Platz eines Spiegels in der Auswahl, wie in der grandMA3: daraus ergibt sich sein Phasenversatz
// (Bruchteil eines Durchlaufs, 0 … 1). Liefert außerdem die Anzahl für den Puls.
function auswahl(p: Parameter, nr: number, n: number): Auswahl {
  let platz = nr, anzahl = n;
  const haelfte = n / 2;
  const vonInnen = nr < haelfte ? haelfte - 1 - nr : nr - haelfte;
  if (p.symmetrie === "innen") { platz = vonInnen; anzahl = haelfte; }
  else if (p.symmetrie === "aussen") { platz = haelfte - 1 - vonInnen; anzahl = haelfte; }
  const lage = p.symmetrie === "aus" ? (nr + 0.5) / n : (vonInnen + 0.5) / haelfte;
  // Groups: das Muster wiederholt sich alle "group" Spiegel
  if (p.group > 0) { platz %= p.group; anzahl = Math.min(anzahl, p.group); }
  if (p.richtung === "zurueck") platz = anzahl - 1 - platz;
  // anteil: Lage in der Auswahl von 0 (erster) bis 1 (letzter) – für Speed von/bis
  const anteil = anzahl > 1 ? Math.min(1, platz / (anzahl - 1)) : 0;
  return { anzahl, anteil, lage, versatz: (p.phase / 360) * (platz / anzahl) };
}

// Zeitkonstante, mit der die Spiegel wieder zusammenlaufen, wenn alle gleich schnell sind
const GLEICHLAUF_S = 0.4;

export class Engine {
  // Durchläufe bei Speed "von": Bezug für den Gleichlauf
  umlaufVon = 0;
  // bisher gelaufene Durchläufe je Spiegel. Jeder Spiegel zählt selbst, damit beim Verstellen
  // von Speed nichts springt – das Muster läuft nur schneller oder langsamer.
  readonly umlauf = new Float64Array(SPIEGEL_GESAMT);

  // Zeit weiterlaufen lassen (dt in Sekunden)
  weiter(p: Parameter, dt: number): void {
    if (!p.laeuft) return;
    const [von, bis] = speeds(p);
    this.umlaufVon += (dt * von) / 60;
    const zug = 1 - Math.exp(-dt / GLEICHLAUF_S);
    for (let g = 0; g < SPIEGEL_GESAMT; g++) {
      if (von === bis) {
        // Alle gleich schnell (Speed bis aus): Abstand zum Bezug abbauen, damit bei Phase 0 wieder
        // alle Spiegel gleich laufen. Ganze Durchläufe sind unsichtbar und fallen sofort weg,
        // der Rest (höchstens ½ Durchlauf) läuft weich auf dem kürzesten Weg zu.
        this.umlauf[g] += (dt * von) / 60;
        const d = this.umlaufVon - this.umlauf[g];
        const ganz = Math.round(d);
        this.umlauf[g] += ganz + (d - ganz) * zug;
      } else {
        this.umlauf[g] += (dt * (von + (bis - von) * this.anteil(p, g))) / 60;
      }
    }
  }

  // Umlauf setzen wie in der Simulation, die nur die Zähler für "von" und "bis" kennt
  setzeUmlauf(p: Parameter, von: number, bis: number): void {
    this.umlaufVon = von;
    for (let g = 0; g < SPIEGEL_GESAMT; g++) this.umlauf[g] = von + (bis - von) * this.anteil(p, g);
  }

  // Stellung des Spiegels g (0 … 35, Element k = g / 12)
  spiegel(p: Parameter, g: number): Stellung {
    if (p.modus === "rotation") {
      // Endlos drehen geht nur über TiltRotate: Drehzahl wie Speed von/bis, Tilt bleibt auf Offset
      const [nr, n] = this.lage(p, g);
      const { anteil } = auswahl(p, nr, n);
      const [von, bis] = speeds(p);
      return { tilt: p.offset, upm: p.laeuft ? von + (bis - von) * anteil : 0 };
    }
    return { tilt: p.offset + this.pattern(p, g), upm: 0 };
  }

  alle(p: Parameter): Stellung[] {
    return Array.from({ length: SPIEGEL_GESAMT }, (_, g) => this.spiegel(p, g));
  }

  // Lage relativ zur Mitte: je Element oder über alle 36 Spiegel
  private lage(p: Parameter, g: number): [nr: number, n: number] {
    return p.jeElement ? [g % SPIEGEL_N, SPIEGEL_N] : [g, SPIEGEL_GESAMT];
  }

  // Lage in der Auswahl von 0 (erster) bis 1 (letzter) – für Speed von/bis
  private anteil(p: Parameter, g: number): number {
    const [nr, n] = this.lage(p, g);
    return auswahl(p, nr, n).anteil;
  }

  // Ausschlag des Patterns (in Grad)
  private pattern(p: Parameter, g: number): number {
    const [nr, n] = this.lage(p, g);
    // mit Symmetrie dreht die linke Hälfte gespiegelt
    const seite = p.symmetrie !== "aus" && nr < n / 2 ? -1 : 1;
    const { anzahl, versatz, lage } = auswahl(p, nr, n);
    const faecher = p.faecher / 100;
    const A = p.amplitude * (1 - faecher + faecher * lage);
    const u = this.umlauf[g]!;
    // Ping-Pong: Das Muster läuft einen Durchlauf lang hin und wieder zurück, bis kurz vor den
    // letzten Spiegel, damit es am Wendepunkt nicht auf den ersten überspringt
    const lauf = p.richtung === "pingpong" ? (1 - Math.abs(2 * (((u % 1) + 1) % 1) - 1)) * (1 - 1 / anzahl) : u;
    // bisherige Laufzeit im Bogenmaß, verschoben um die Phase
    const t = 2 * Math.PI * (lauf - versatz);
    const zyklus = (((t / (2 * Math.PI)) % 1) + 1) % 1;   // 0 … 1, wiederholt sich
    switch (p.modus) {
      // Sägezahn, weich: langsam von −A nach +A, dann zügig, aber ohne Sprung zurück
      case "saegezahn": {
        const hin = 0.8;
        return seite * A * (zyklus < hin ? 2 * weich(zyklus / hin) - 1 : 1 - 2 * weich((zyklus - hin) / (1 - hin)));
      }
      // Puls: jeder Spiegel klappt einmal auf und wieder zu. Bei Phase 360° läuft eine weiche Welle
      // von etwa drei Spiegeln Breite durch – breit genug, dass kein Spiegel hektisch fährt.
      case "puls": {
        const breite = Math.min(1, 3 / anzahl);
        return zyklus < breite ? seite * A * buckel(zyklus / breite) : 0;
      }
      // Flyout: geschlossen, dann klappen die Spiegel nacheinander auf, halten offen und schließen
      // wieder in derselben Reihenfolge
      case "flyout": return seite * A * (weich(zyklus / 0.18) - weich((zyklus - 0.55) / 0.18));
      // Blinder: öffnet zügig und schließt langsam wieder (bei Phase 0 alle gleichzeitig)
      case "blinder": return seite * A * (weich(zyklus / 0.12) - weich((zyklus - 0.15) / 0.6));
      // Funkeln: einzelne Spiegel blitzen zu zufälligen Zeiten in zufällige Richtungen auf
      case "funkeln": {
        const takt = u * 6 + zufall(g, 0);
        const nummer = Math.floor(takt);
        if (zufall(g, nummer) > 0.3) return 0;
        const richtung = zufall(nummer, g) < 0.5 ? -1 : 1;
        return richtung * A * buckel(takt - nummer);
      }
      case "rotation": return 0;   // läuft über TiltRotate, siehe spiegel()
      case "sinus":
      default: return seite * A * Math.sin(t);
    }
  }
}

// Zwei Stellungen überblenden: anteil 0 = a, 1 = b
export function mische(a: readonly Stellung[], b: readonly Stellung[], anteil: number): Stellung[] {
  return b.map((s, g) => {
    const v = a[g] ?? s;
    return { tilt: v.tilt + (s.tilt - v.tilt) * anteil, upm: v.upm + (s.upm - v.upm) * anteil };
  });
}
