// Zentraler Zustand des Servers: Pattern-Parameter, Übernahme-Wunsch und Einstellungen.
// Alle Bedienungen (Client, Stream Deck, MIDI, OSC) ändern den Zustand nur über diese Aktionen,
// alle Anzeigen hören auf das Ereignis "aenderung".
import { EventEmitter } from "node:events";
import { MODI, PARAMETER_VORGABE, phaseVorgabe, type Modus, type Parameter } from "@parrafraktor/engine";
import {
  BEREICHE, begrenze, pruefeEinstellungen, pruefeParameter, vorgabeWert,
  type Einstellungen, type Uebernahme, type ZahlParameter,
} from "@parrafraktor/protokoll";

interface Ereignisse {
  // irgendetwas Sichtbares hat sich geändert (Parameter, Übernahme, Modulstatus)
  aenderung: [];
  // Einstellungen geändert: Ausgaben müssen neu starten, Datei muss gespeichert werden
  einstellungen: [Einstellungen];
  // Parameter geändert: werden gespeichert
  parameter: [Parameter];
}

export class Steuerung extends EventEmitter<Ereignisse> {
  private _parameter: Parameter;
  private _einstellungen: Einstellungen;
  // Übernahme startet immer aus: nach einem Neustart fährt zuerst die MA
  private _uebernahme: Uebernahme = { soll: false, zustand: "aus", anteil: 0 };
  private _rev = 0;

  constructor(parameter: Parameter, einstellungen: Einstellungen) {
    super();
    this._parameter = parameter;
    this._einstellungen = einstellungen;
  }

  get parameter(): Readonly<Parameter> { return this._parameter; }
  get einstellungen(): Readonly<Einstellungen> { return this._einstellungen; }
  get uebernahme(): Readonly<Uebernahme> { return this._uebernahme; }
  get rev(): number { return this._rev; }

  // ---------- Aktionen der Bedienungen ----------

  setze(teil: Partial<Parameter>): void {
    const geprueft = pruefeParameter(teil);
    if (geprueft.modus && geprueft.modus !== this._parameter.modus) {
      // Patternwechsel über waehlePattern, damit Phase und Amplitude passen
      this.waehlePattern(geprueft.modus);
      delete geprueft.modus;
    }
    this.aendere(geprueft);
  }

  waehlePattern(modus: Modus): void {
    const teil: Partial<Parameter> = { modus, phase: phaseVorgabe(modus), laeuft: true };
    // Flyout und Blinder leben vom vollen Öffnen
    if ((modus === "flyout" || modus === "blinder") && this._parameter.amplitude < 90) teil.amplitude = 90;
    this.aendere(teil);
  }

  // Pattern in der Liste weiterschalten (z. B. per Drehregler)
  naechstesPattern(schritte: number): void {
    const i = MODI.indexOf(this._parameter.modus);
    const n = MODI.length;
    this.waehlePattern(MODI[(((i + schritte) % n) + n) % n]!);
  }

  // Relativ verstellen, z. B. per Drehregler: schritte × kleinster Schritt
  verstelle(name: ZahlParameter, schritte: number): void {
    this.aendere({ [name]: begrenze(name, this._parameter[name] + schritte * BEREICHE[name].schritt) });
  }

  vorgabe(name: ZahlParameter): void {
    const wert = name === "phase" ? phaseVorgabe(this._parameter.modus) : vorgabeWert(name);
    this.aendere({ [name]: wert });
  }

  schalteLauf(): void {
    this.aendere({ laeuft: !this._parameter.laeuft });
  }

  schalteReihenfolge(): void {
    this.aendere({ jeElement: !this._parameter.jeElement });
  }

  setzeUebernahme(an: boolean): void {
    if (this._uebernahme.soll === an) return;
    this._uebernahme = { ...this._uebernahme, soll: an };
    this.geaendert();
  }

  setzeEinstellungen(roh: unknown): void {
    const neu = pruefeEinstellungen(roh, this._einstellungen);
    if (JSON.stringify(neu) === JSON.stringify(this._einstellungen)) return;
    this._einstellungen = neu;
    this.emit("einstellungen", neu);
    this.geaendert();
  }

  // ---------- Meldungen der Module ----------

  // Der Takt meldet, wie weit die Übernahme ist
  meldeUebernahme(zustand: Uebernahme["zustand"], anteil: number): void {
    const u = this._uebernahme;
    if (u.zustand === zustand && u.anteil === anteil) return;
    this._uebernahme = { soll: u.soll, zustand, anteil };
    this.geaendert();
  }

  // Ein Modul hat seinen Status geändert (z. B. Stream Deck angesteckt)
  geaendert(): void {
    this._rev++;
    this.emit("aenderung");
  }

  private aendere(teil: Partial<Parameter>): void {
    const neu = { ...this._parameter, ...teil };
    if (JSON.stringify(neu) === JSON.stringify(this._parameter)) return;
    this._parameter = neu;
    this.emit("parameter", neu);
    this.geaendert();
  }
}

export const parameterAus = (roh: unknown): Parameter => ({ ...PARAMETER_VORGABE, ...pruefeParameter(roh) });
