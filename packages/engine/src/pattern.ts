// Pattern-Engine: dieselben Pattern wie die Simulation auf der Website (parrafraktor.js).
// Offset, Amplitude, Speed von/bis, Phase und Group funktionieren wie die MAtricks der grandMA3.
// Rechnet in double wie die Simulation, damit Vorschau und Spiegel gleich fahren.
import { SPIEGEL_GESAMT, SPIEGEL_N } from "./aufbau.js";

export const MODI = [
  "sinus", "dreieck", "rechteck", "saegezahn",
  "sinus-innen", "sinus-aussen", "faecher", "flyout",
  "blinder", "chase", "pingpong", "funkeln", "rotation",
] as const;
export type Modus = (typeof MODI)[number];

export const MODUS_NAME: Record<Modus, string> = {
  sinus: "Sinus",
  dreieck: "Dreieck",
  rechteck: "Rechteck",
  saegezahn: "Sägezahn",
  "sinus-innen": "Sinus innen",
  "sinus-aussen": "Sinus außen",
  faecher: "Fächer",
  flyout: "Flyout",
  blinder: "Blinder",
  chase: "Chase",
  pingpong: "Ping-Pong",
  funkeln: "Funkeln",
  rotation: "Rotation",
};

export const istModus = (x: unknown): x is Modus => typeof x === "string" && (MODI as readonly string[]).includes(x);

// Startwert der Phase je Pattern (beim Umschalten gesetzt, danach frei einstellbar)
const PHASE_VORGABE: Partial<Record<Modus, number>> = {
  sinus: 360, "sinus-innen": 180, "sinus-aussen": 180, dreieck: 360, rechteck: 360, saegezahn: 360,
  flyout: 120, chase: 360, rotation: 360,
};
export const phaseVorgabe = (m: Modus): number => PHASE_VORGABE[m] ?? 0;

// Pattern, deren Reihenfolge von der Mitte aus zählt (beide Hälften gleich, wie MAtricks-Wings)
const VON_INNEN: readonly Modus[] = ["sinus-innen", "flyout", "faecher"];

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
  jeElement: false,
  laeuft: true,
};

// Stellung eines Spiegels: Winkel in Grad und Drehzahl für TiltRotate (U/min, 0 = steht)
export interface Stellung {
  tilt: number;
  upm: number;
}

// Weicher Übergang 0 → 1
export const weich = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Zufallszahl 0 … 1, immer gleich für dieselben Eingaben (fürs Funkeln)
const zufall = (a: number, b: number): number => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Steht ein Regler auf aus (0), übernimmt er den Wert des anderen
const speeds = (p: Parameter): [number, number] => [p.speedVon || p.speedBis, p.speedBis || p.speedVon];

interface Auswahl {
  platz: number;
  anzahl: number;
  anteil: number;
  versatz: number;
}

// Platz eines Spiegels in der Auswahl, wie in der grandMA3: daraus ergibt sich sein Phasenversatz
// (Bruchteil eines Durchlaufs, 0 … 1). Liefert außerdem Platz und Anzahl für Chase und Fächer.
function auswahl(p: Parameter, nr: number, n: number): Auswahl {
  let platz = nr, anzahl = n;
  const haelfte = n / 2;
  const vonInnen = nr < haelfte ? haelfte - 1 - nr : nr - haelfte;
  if (VON_INNEN.includes(p.modus)) { platz = vonInnen; anzahl = haelfte; }
  else if (p.modus === "sinus-aussen") { platz = haelfte - 1 - vonInnen; anzahl = haelfte; }
  // Groups: das Muster wiederholt sich alle "group" Spiegel
  if (p.group > 0) { platz %= p.group; anzahl = Math.min(anzahl, p.group); }
  // anteil: Lage in der Auswahl von 0 (erster) bis 1 (letzter) – für Speed von/bis
  const anteil = anzahl > 1 ? Math.min(1, platz / (anzahl - 1)) : 0;
  return { platz, anzahl, anteil, versatz: (p.phase / 360) * (platz / anzahl) };
}

export class Engine {
  // bisher gelaufene Durchläufe bei Speed "von" bzw. "bis"
  umlaufVon = 0;
  umlaufBis = 0;

  // Zeit weiterlaufen lassen (dt in Sekunden)
  weiter(p: Parameter, dt: number): void {
    if (!p.laeuft) return;
    const [von, bis] = speeds(p);
    this.umlaufVon += (dt * von) / 60;
    this.umlaufBis += (dt * bis) / 60;
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

  // Bisherige Laufzeit im Bogenmaß. Weil beide Umläufe getrennt mitgezählt werden,
  // springt beim Verstellen von Speed nichts – das Muster läuft nur schneller oder langsamer.
  private laufzeit(anteil: number): number {
    return 2 * Math.PI * (this.umlaufVon + (this.umlaufBis - this.umlaufVon) * anteil);
  }

  // Ausschlag des Patterns (in Grad)
  private pattern(p: Parameter, g: number): number {
    const A = p.amplitude;
    const [nr, n] = this.lage(p, g);
    const seite = nr < n / 2 ? -1 : 1;   // linke Hälfte dreht gespiegelt
    const { platz, anzahl, anteil, versatz } = auswahl(p, nr, n);
    const t = this.laufzeit(anteil) - versatz * 2 * Math.PI;
    const zyklus = (((t / (2 * Math.PI)) % 1) + 1) % 1;   // 0 … 1, wiederholt sich
    switch (p.modus) {
      // Sinus läuft von der Mitte nach außen bzw. von außen zur Mitte, beide Hälften gespiegelt
      case "sinus-innen":
      case "sinus-aussen": return seite * A * Math.sin(t);
      // Formen wie in der grandMA3, jeweils mit Nulldurchgang am Anfang wie der Sinus
      case "dreieck": return A * (4 * Math.abs(((zyklus + 0.75) % 1) - 0.5) - 1);
      case "rechteck": return zyklus < 0.5 ? A : -A;
      case "saegezahn": return A * (2 * zyklus - 1);
      // Fächer: außen weit, innen wenig – öffnet und schließt sich
      case "faecher": return (seite * A * ((platz + 0.5) / anzahl) * (1 - Math.cos(t))) / 2;
      // Flyout: geschlossen, dann klappen die Spiegel von der Mitte nach außen nacheinander auf,
      // halten offen und schließen wieder in derselben Reihenfolge
      case "flyout": return seite * A * (weich(zyklus / 0.12) - weich((zyklus - 0.55) / 0.12));
      // Blinder: alle Spiegel reißen gleichzeitig auf und schließen langsam wieder
      case "blinder": return seite * A * (weich(zyklus / 0.04) - weich((zyklus - 0.08) / 0.6));
      // Chase: ein Spiegel nach dem anderen klappt kurz auf (bei Phase 360° immer genau einer)
      case "chase": {
        const breite = 1 / anzahl;
        return zyklus < breite ? A * Math.sin((Math.PI * zyklus) / breite) : 0;
      }
      // Ping-Pong: ein offener Spiegel wandert hin und her
      case "pingpong": {
        const z = (((this.laufzeit(0) / (2 * Math.PI)) % 1) + 1) % 1;
        const ort = (1 - Math.abs(2 * z - 1)) * (anzahl - 1);
        return A * Math.max(0, 1 - Math.abs(platz - ort));
      }
      // Funkeln: einzelne Spiegel blitzen zu zufälligen Zeiten in zufällige Richtungen auf
      case "funkeln": {
        const takt = (this.laufzeit(anteil) / (2 * Math.PI)) * 6 + zufall(g, 0);
        const nummer = Math.floor(takt);
        if (zufall(g, nummer) > 0.3) return 0;
        const richtung = zufall(nummer, g) < 0.5 ? -1 : 1;
        return richtung * A * Math.sin(Math.PI * (takt - nummer));
      }
      case "rotation": return 0;   // läuft über TiltRotate, siehe spiegel()
      case "sinus":
      default: return A * Math.sin(t);
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
