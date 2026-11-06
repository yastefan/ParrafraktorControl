// Zentraler Zustand des Servers: Pattern-Parameter, Übernahme-Wunsch und Einstellungen.
// Alle Bedienungen (Client, Stream Deck, MIDI, OSC) ändern den Zustand nur über diese Aktionen,
// alle Anzeigen hören auf das Ereignis "aenderung".
import { EventEmitter } from "node:events";
import {
  IMPULS_VORGABE, PARAMETER_VORGABE, impulsFertig,
  type ImpulsArt, type ImpulsEinstellung, type LaufenderImpuls, type Modus, type Parameter,
} from "@parrafraktor/engine";
import {
  AUTO_VORGABE, BEREICHE, IMPULS_BEREICHE, STUFEN, begrenze, impulsWert, lookAus, migriereParameter, mitImpulsWert, pruefeAuto, pruefeEinstellungen,
  pruefeImpuls, pruefeParameter, vorgabeName, vorgabeWert,
  type AutoEinstellung, type Einstellungen, type ImpulsRegler, type Presets, type SchalterParameter, type StufenParameter, type Uebernahme, type ZahlParameter,
} from "@parrafraktor/protokoll";

// Ein gestarteter Impuls
interface Impuls {
  id: number;
  art: ImpulsArt;
  start: number;          // Sekunden (Uhr der Steuerung)
  ursprung: number;
  breite: number;
  wischt: boolean;
}

interface Ereignisse {
  // irgendetwas Sichtbares hat sich geändert (Parameter, Übernahme, Modulstatus)
  aenderung: [];
  // Einstellungen geändert: Ausgaben müssen neu starten, Datei muss gespeichert werden
  einstellungen: [Einstellungen];
  // Parameter geändert: werden gespeichert
  parameter: [Parameter];
  // Presets geändert: werden gespeichert
  presets: [Presets];
  // Preset abgerufen: der Takt soll von der aktuellen Stellung zum neuen Look überblenden
  blende: [];
  // Hüllkurve oder Element-Folge geändert: wird gespeichert
  impuls: [ImpulsEinstellung];
  // Auswahl oder Zeiten von Auto geändert: wird gespeichert
  auto: [AutoEinstellung];
}

export class Steuerung extends EventEmitter<Ereignisse> {
  private _parameter: Parameter;
  private _einstellungen: Einstellungen;
  // Übernahme startet immer aus: nach einem Neustart fährt zuerst die MA
  private _uebernahme: Uebernahme = { soll: false, zustand: "aus", anteil: 0 };
  private _rev = 0;
  private _presets: Presets;
  private _letztesPreset: number | null = null;
  private _blende: { id: number; anteil: number } | null = null;
  private _blendeDauerS = 0;
  private _auto: AutoEinstellung;
  // Auto startet immer aus. Es fasst den Output nicht an, nur den Look.
  private _autoAn = false;
  private _autoRestS = 0;
  private _impuls: ImpulsEinstellung;
  private _impulse: Impuls[] = [];
  private impulsNr = 0;

  // uhr: Sekunden, austauschbar für Tests
  constructor(
    parameter: Parameter,
    einstellungen: Einstellungen,
    presets: Presets,
    impuls: ImpulsEinstellung = IMPULS_VORGABE,
    private readonly uhr: () => number = () => performance.now() / 1000,
    auto: AutoEinstellung = AUTO_VORGABE,
  ) {
    super();
    this._parameter = parameter;
    this._einstellungen = einstellungen;
    this._presets = presets;
    this._impuls = impuls;
    this._auto = auto;
    this._blendeDauerS = einstellungen.ueberblendungS;
  }

  get parameter(): Readonly<Parameter> { return this._parameter; }
  get einstellungen(): Readonly<Einstellungen> { return this._einstellungen; }
  get uebernahme(): Readonly<Uebernahme> { return this._uebernahme; }
  get rev(): number { return this._rev; }
  get presets(): Readonly<Presets> { return this._presets; }
  get letztesPreset(): number | null { return this._letztesPreset; }
  get blende(): Readonly<{ id: number; anteil: number }> | null { return this._blende; }
  get blendeDauerS(): number { return this._blendeDauerS; }
  get impuls(): Readonly<ImpulsEinstellung> { return this._impuls; }
  get auto(): Readonly<AutoEinstellung> { return this._auto; }
  get autoAn(): boolean { return this._autoAn; }
  get autoRestS(): number { return this._autoRestS; }
  get autoStartbar(): boolean { return this.autoListe().length >= 2; }

  // Laufende Impulse mit Zeiten relativ zu jetzt (für Takt, Vorschau und Anzeigen)
  impulse(): LaufenderImpuls[] {
    const jetzt = this.uhr();
    return this._impulse.map((i) => ({
      id: i.id, art: i.art, alterS: jetzt - i.start, ursprung: i.ursprung, breite: i.breite, wischt: i.wischt,
    }));
  }

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
    // Nur die Form wechselt; die Regler bleiben, wie sie sind. Die Spiegel blenden weich
    // in die neue Form über, statt zu springen.
    const neu = modus !== this._parameter.modus;
    this.aendere({ modus, laeuft: true });
    if (neu) this.starteBlende();
  }

  // Relativ verstellen, z. B. per Drehregler: schritte × kleinster Schritt
  verstelle(name: ZahlParameter, schritte: number): void {
    this.aendere({ [name]: begrenze(name, this._parameter[name] + schritte * BEREICHE[name].schritt) });
  }

  vorgabe(name: ZahlParameter): void {
    this.aendere({ [name]: vorgabeWert(name) });
  }

  schalteLauf(): void {
    this.aendere({ laeuft: !this._parameter.laeuft });
  }

  // Regler mit Stufen (Ordnung, Element-Folge) eine Stufe weiterschalten
  schalteStufe(name: StufenParameter, schritte = 1): void {
    const werte: readonly string[] = STUFEN[name].werte;
    const n = werte.length;
    const i = werte.indexOf(this._parameter[name]);
    this.aendere({ [name]: werte[(((i + schritte) % n) + n) % n] });
  }

  schalte(name: SchalterParameter): void {
    this.aendere({ [name]: !this._parameter[name] });
  }

  setzeUebernahme(an: boolean): void {
    if (this._uebernahme.soll === an) return;
    this._uebernahme = { ...this._uebernahme, soll: an };
    this.geaendert();
  }

  // ---------- Impulse ----------

  // Streifen: die gewählte Art vom Ursprung (0 = links … 1 = rechts) aus starten.
  // Getippt wirkt sie nur in der eingestellten Breite, gewischt läuft sie durch das ganze Element.
  tippeImpuls(ursprung: number, wischen = false): void {
    const start = this.uhr();
    const u = Math.min(1, Math.max(0, ursprung));
    const breite = wischen ? 0 : this._impuls.breite;
    this._impulse.push({ id: ++this.impulsNr, art: this._impuls.art, start, ursprung: u, breite, wischt: wischen });
    this.geaendert();
  }

  // Der Takt räumt fertige Impulse weg
  raeumeImpulse(): void {
    const vorher = this._impulse.length;
    const liste = this.impulse();
    this._impulse = this._impulse.filter((_, n) => !impulsFertig(this._impuls, liste[n]!));
    if (this._impulse.length !== vorher) this.geaendert();
  }

  setzeImpuls(roh: unknown): void {
    this.aendereImpuls(pruefeImpuls(roh, this._impuls));
  }

  verstelleImpuls(name: ImpulsRegler, schritte: number): void {
    const wert = impulsWert(this._impuls, name) + schritte * IMPULS_BEREICHE[name].schritt;
    this.aendereImpuls(mitImpulsWert(this._impuls, name, wert));
  }

  vorgabeImpuls(name: ImpulsRegler): void {
    this.aendereImpuls(mitImpulsWert(this._impuls, name, impulsWert(IMPULS_VORGABE, name)));
  }

  private aendereImpuls(neu: ImpulsEinstellung): void {
    if (JSON.stringify(neu) === JSON.stringify(this._impuls)) return;
    this._impuls = neu;
    this.emit("impuls", neu);
    this.geaendert();
  }

  // ---------- Presets ----------

  rufePresetAuf(nr: number): void {
    if (!this._presets[nr]) return;
    this.setzeAuto(false);   // Wer selbst ein Preset abruft, übernimmt
    this.ladePreset(nr, this._einstellungen.ueberblendungS);
  }

  private ladePreset(nr: number, blendeS: number): void {
    const preset = this._presets[nr];
    if (!preset) return;
    // Pause bleibt, wie sie ist: sie gehört nicht zum Look
    this.aendere({ ...preset.look }, nr, true);
    this.starteBlende(blendeS);
    this.geaendert();
  }

  // Takt und Vorschau blenden von der aktuellen Stellung zum neuen Look über
  private starteBlende(dauerS: number = this._einstellungen.ueberblendungS): void {
    if (dauerS <= 0) return;
    this._blendeDauerS = dauerS;
    this._blende = { id: (this._blende?.id ?? 0) + 1, anteil: 0 };
    this.emit("blende");
    this.geaendert();
  }

  speicherePreset(nr: number): void {
    const look = lookAus(this._parameter);
    // Name bleibt beim Überschreiben erhalten, sonst nach dem Pattern
    const name = this._presets[nr]?.name ?? vorgabeName(look);
    this.setzePreset(nr, { name, look });
    this._letztesPreset = nr;
    this.geaendert();
  }

  loeschePreset(nr: number): void {
    if (this._letztesPreset === nr) this._letztesPreset = null;
    this.setzePreset(nr, null);
    if (this.autoListe().length < 2) this.setzeAuto(false);
  }

  benennePreset(nr: number, name: string): void {
    const p = this._presets[nr];
    if (p) this.setzePreset(nr, { ...p, name });
  }

  private setzePreset(nr: number, preset: Presets[number]): void {
    this._presets = this._presets.map((p, i) => (i === nr ? preset : p));
    this.emit("presets", this._presets);
    this.geaendert();
  }

  // ---------- Auto ----------

  // Ausgewählte Plätze, auf denen auch ein Preset liegt
  private autoListe(): number[] {
    return this._presets.flatMap((p, nr) => (p && this._auto.auswahl[nr] ? [nr] : []));
  }

  setzeAuto(an: boolean): void {
    if (an === this._autoAn) return;
    if (an && this.autoListe().length < 2) return;   // Bei einem Preset gäbe es nichts zu wechseln
    this._autoAn = an;
    this._autoRestS = 0;
    if (an) this.autoNaechstes();
    this.geaendert();
  }

  stelleAuto(roh: unknown): void {
    const neu = pruefeAuto(roh, this._auto);
    if (JSON.stringify(neu) === JSON.stringify(this._auto)) return;
    this._auto = neu;
    this.emit("auto", neu);
    if (this._autoAn) {
      if (this.autoListe().length < 2) this.setzeAuto(false);
      else this._autoRestS = Math.min(this._autoRestS, neu.blendeS + neu.halteS);
    }
    this.geaendert();
  }

  // Der Takt lässt die Zeit laufen. In der Pause steht auch Auto.
  autoWeiter(dt: number): void {
    if (!this._autoAn || !this._parameter.laeuft) return;
    this._autoRestS -= dt;
    if (this._autoRestS <= 0) this.autoNaechstes();
  }

  private autoNaechstes(): void {
    const liste = this.autoListe();
    const von = this._letztesPreset ?? -1;
    const nr = liste.find((n) => n > von) ?? liste[0];
    if (nr === undefined) return;
    this.ladePreset(nr, this._auto.blendeS);
    this._autoRestS = this._auto.blendeS + this._auto.halteS;
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

  // Der Takt meldet, wie weit die Überblendung zum Preset ist (null = fertig)
  meldeBlende(anteil: number | null): void {
    if (!this._blende) return;
    this._blende = anteil === null ? null : { id: this._blende.id, anteil };
    this.geaendert();
  }

  // Ein Modul hat seinen Status geändert (z. B. Stream Deck angesteckt)
  geaendert(): void {
    this._rev++;
    this.emit("aenderung");
  }

  // preset: Nummer, wenn die Änderung ein Preset abruft; sonst gilt kein Preset mehr als aktiv
  // vonPreset: Abruf eines Presets; jede andere Änderung am Look ist Handbetrieb und beendet Auto
  private aendere(teil: Partial<Parameter>, preset: number | null = null, vonPreset = false): void {
    const neu = { ...this._parameter, ...teil };
    const pauseOderGleich = Object.keys(teil).every((k) => k === "laeuft");
    if (!pauseOderGleich || preset !== null) this._letztesPreset = preset;
    if (JSON.stringify(neu) === JSON.stringify(this._parameter)) return;
    if (!pauseOderGleich && !vonPreset) this.setzeAuto(false);
    this._parameter = neu;
    this.emit("parameter", neu);
    this.geaendert();
  }
}

export const parameterAus = (roh: unknown): Parameter => ({ ...PARAMETER_VORGABE, ...pruefeParameter(migriereParameter(roh)) });
