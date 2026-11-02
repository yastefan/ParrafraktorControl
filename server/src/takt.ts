// Takt: rechnet 40-mal pro Sekunde die Spiegelstellungen und schickt sie an die Ausgaben.
// Das Pattern läuft auch ohne Übernahme weiter, damit man es vorher einstellen kann und die
// Vorschau im Client stimmt. Gesendet wird nur, solange die App übernommen hat.
//
// Übernahme mit Überblendung:
//   aus ──(soll an)──▶ blendetEin ──(anteil 1)──▶ an ──(soll aus)──▶ blendetAus ──(anteil 0)──▶ aus
// Überblendet wird von bzw. zur Stellung der MA (siehe Mitlesen). Ist die unbekannt oder die
// Überblendzeit 0, wird direkt umgeschaltet.
import { Engine, mische, schreibeUniversen, weich, type Stellung } from "@parrafraktor/engine";
import type { UebernahmeZustand } from "@parrafraktor/protokoll";
import type { Ausgabe } from "./ausgabe/index.js";
import type { Mitlesen } from "./mitlesen.js";
import type { Steuerung } from "./steuerung.js";

export const TAKT_MS = 25;

export interface Quellen {
  ausgaben(): readonly Ausgabe[];
  mitlesen(): Mitlesen | null;
}

// Nächster Zustand der Übernahme (rein, damit testbar)
export function uebernahmeSchritt(
  zustand: UebernahmeZustand,
  anteil: number,
  soll: boolean,
  dt: number,
  ueberblendungS: number,
  maBekannt: boolean,
): { zustand: UebernahmeZustand; anteil: number } {
  const blenden = ueberblendungS > 0 && maBekannt;
  const schritt = blenden ? dt / ueberblendungS : 1;
  if (soll) {
    if (zustand === "an") return { zustand, anteil: 1 };
    if (!blenden) return { zustand: "an", anteil: 1 };
    const neu = Math.min(1, anteil + schritt);
    return neu >= 1 ? { zustand: "an", anteil: 1 } : { zustand: "blendetEin", anteil: neu };
  }
  if (zustand === "aus") return { zustand, anteil: 0 };
  if (!blenden) return { zustand: "aus", anteil: 0 };
  const neu = Math.max(0, anteil - schritt);
  return neu <= 0 ? { zustand: "aus", anteil: 0 } : { zustand: "blendetAus", anteil: neu };
}

export class Takt {
  readonly engine = new Engine();
  private timer: NodeJS.Timeout | undefined;
  private letzte = performance.now();

  constructor(private readonly steuerung: Steuerung, private readonly quellen: Quellen) {}

  starte(): void {
    this.letzte = performance.now();
    this.timer = setInterval(() => {
      const jetzt = performance.now();
      const dt = Math.min(0.1, (jetzt - this.letzte) / 1000);
      this.letzte = jetzt;
      this.schritt(dt);
    }, TAKT_MS);
  }

  stoppe(): void {
    clearInterval(this.timer);
  }

  // Aktuelle Stellungen der App (ohne Überblendung), z. B. für Anzeigen
  stellungen(): Stellung[] {
    return this.engine.alle(this.steuerung.parameter);
  }

  private schritt(dt: number): void {
    const { parameter, einstellungen, uebernahme } = this.steuerung;
    this.engine.weiter(parameter, dt);

    const ma = this.quellen.mitlesen()?.stellungen() ?? null;
    const vorher = uebernahme.zustand;
    const { zustand, anteil } = uebernahmeSchritt(
      vorher, uebernahme.anteil, uebernahme.soll, dt, einstellungen.ueberblendungS, ma !== null,
    );
    this.steuerung.meldeUebernahme(zustand, anteil);

    const ausgaben = this.quellen.ausgaben();
    if (zustand === "aus") {
      if (vorher !== "aus") for (const a of ausgaben) a.gibFrei();
      return;
    }
    const app = this.engine.alle(parameter);
    const stellungen = ma && anteil < 1 ? mische(ma, app, weich(anteil)) : app;
    const universen = schreibeUniversen(stellungen, einstellungen.patch, einstellungen.rotateMaxUpm);
    for (const a of ausgaben) a.sende(universen);
  }
}
