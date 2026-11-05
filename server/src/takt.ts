// Takt: rechnet 40-mal pro Sekunde die Spiegelstellungen und schickt sie an die Ausgaben.
// Das Pattern läuft auch ohne Übernahme weiter, damit man es vorher einstellen kann und die
// Vorschau im Client stimmt. Gesendet wird nur, solange die App übernommen hat.
//
// Übernahme mit Überblendung:
//   aus ──(soll an)──▶ blendetEin ──(anteil 1)──▶ an ──(soll aus)──▶ blendetAus ──(anteil 0)──▶ aus
// Überblendet wird von bzw. zur Stellung der MA (siehe Mitlesen). Ist die unbekannt oder die
// Überblendzeit 0, wird direkt umgeschaltet.
//
// Preset abrufen: Die Stellung im Moment des Abrufens wird festgehalten und über die
// Überblendzeit in den neuen Look überblendet, damit die Motoren nicht springen.
//
// Impulse (Flash, Stoß, Glitzern) liegen über dem Look, aber unter der Überblendung von bzw. zur MA.
import { Engine, mische, schreibeUniversen, weich, wendeImpulseAn, type Stellung } from "@parrafraktor/engine";
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
  // zuletzt gerechnete Stellungen der App und, während einer Überblendung zum Preset, der Ausgangspunkt
  private app: Stellung[] = [];
  private blendeVon: Stellung[] | null = null;

  constructor(private readonly steuerung: Steuerung, private readonly quellen: Quellen) {
    steuerung.on("blende", () => {
      this.blendeVon = this.app.length ? this.app : this.engine.alle(steuerung.parameter);
    });
  }

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

  // Stellungen des Looks, während einer Überblendung zum Preset gemischt
  private appStellungen(dt: number): Stellung[] {
    const ziel = this.engine.alle(this.steuerung.parameter);
    const blende = this.steuerung.blende;
    if (!blende || !this.blendeVon) {
      this.blendeVon = null;
      this.app = ziel;
      return ziel;
    }
    const dauer = this.steuerung.einstellungen.ueberblendungS;
    const anteil = dauer > 0 ? Math.min(1, blende.anteil + dt / dauer) : 1;
    this.app = anteil >= 1 ? ziel : mische(this.blendeVon, ziel, weich(anteil));
    this.steuerung.meldeBlende(anteil >= 1 ? null : anteil);
    if (anteil >= 1) this.blendeVon = null;
    return this.app;
  }

  private mitImpulsen(app: Stellung[]): Stellung[] {
    const impulse = this.steuerung.impulse();
    if (!impulse.length) return app;
    return wendeImpulseAn(app, impulse, this.steuerung.impuls, this.steuerung.einstellungen.flash);
  }

  private schritt(dt: number): void {
    const { parameter, einstellungen, uebernahme } = this.steuerung;
    this.engine.drehung = einstellungen.aufbau.drehung;
    this.engine.weiter(parameter, dt);
    this.steuerung.raeumeImpulse();

    const ma = this.quellen.mitlesen()?.stellungen(einstellungen.rotateMaxUpm) ?? null;
    const vorher = uebernahme.zustand;
    const { zustand, anteil } = uebernahmeSchritt(
      vorher, uebernahme.anteil, uebernahme.soll, dt, einstellungen.ueberblendungS, ma !== null,
    );
    this.steuerung.meldeUebernahme(zustand, anteil);

    const ausgaben = this.quellen.ausgaben();
    if (zustand === "aus") {
      this.appStellungen(dt);   // Überblendung zum Preset läuft auch ohne Output weiter
      if (vorher !== "aus") for (const a of ausgaben) a.gibFrei();
      return;
    }
    const app = this.mitImpulsen(this.appStellungen(dt));
    const stellungen = ma && anteil < 1 ? mische(ma, app, weich(anteil)) : app;
    const universen = schreibeUniversen(stellungen, einstellungen.patch, einstellungen.rotateMaxUpm);
    for (const a of ausgaben) a.sende(universen);
  }
}
