// Elgato Stream Deck+ als Bedienung am Server-Rechner.
//
// Das Gerät darf jederzeit angesteckt oder abgezogen werden: ohne Gerät wird alle 2 s gesucht.
// macOS/Windows: Die Elgato-Software muss beendet sein, sonst ist das Gerät belegt.
// Linux/Raspberry Pi: udev-Regel nötig (siehe README).
import type { DeviceModelId, StreamDeck } from "@elgato-stream-deck/core";
import {
  ELEMENT_ORDERS, ELEMENT_ORDER_NAME, IMPULSE_NAME, MODES_SELECTABLE, isApertureKind, MODE_NAME, PARAMETER_DEFAULTS,
} from "@parrafraktor/engine";
import {
  BEREICHE, IMPULS_BEREICHE, PRESET_ANZAHL, benutzt, offsetVerschieden, SCHALTER, STUFEN, impulsWert, zeigeImpuls, zeigeWert, type ModulStatus,
} from "@parrafraktor/protokoll";
import { fehlerText, log } from "../../log.js";
import { PRAEFIXE, gleicherWunsch, zeigeAdresse, type Netz, type NetzWunsch } from "../../netz.js";
import type { Steuerung } from "../../steuerung.js";
import type { Eingabemodul } from "../eingabe.js";
import {
  CODE_WARTEN_MS, HAUPT, HALTEN_MS, IMPULS_ARTEN_TASTEN, NETZ_TASTEN, IMPULS_REGLER_SEITEN, PLAETZE, TASTE_ELEMENT_FOLGE,
  TASTE_IMPULS_REGLER, TASTE_SEITE, TASTE_SYMMETRISCH, TASTE_ZURUECK,
  eintragAuf, reglerSeiten, seitenAnzahl, type Menue, type Regler, type ReglerSeite,
} from "./belegung.js";
import { FARBE, Maler, TON, type Farbton, type Feld, type TastenInhalt } from "./bilder.js";

// @elgato-stream-deck/node braucht node-hid (nativ) und ist optional. Typen kommen aus dem reinen
// JS-Paket @elgato-stream-deck/core, damit der Build auch ohne das native Paket gelingt (z. B. am Pi).
interface Bibliothek {
  listStreamDecks(): Promise<{ model: DeviceModelId; path: string }[]>;
  openStreamDeck(pfad: string, optionen?: { resetToLogoOnClose?: boolean }): Promise<StreamDeck>;
  DeviceModelId: typeof DeviceModelId;
}
const BIBLIOTHEK: string = "@elgato-stream-deck/node";

const SUCHEN_MS = 2000;
const ZEICHNEN_MS = 50;      // höchstens 20 Bilder pro Sekunde
const SCHNELL_MS = 60;       // Rastungen schneller als das zählen mehrfach
const GESPEICHERT_MS = 1200; // so lange zeigt eine Preset-Taste "gespeichert"

// Was eine Taste tut: tippen, halten oder beides (dann löst Tippen erst beim Loslassen aus)
interface Aktion {
  tippen?: () => void;
  halten?: { ms: number; tun: () => void };
}

export class StreamDeckModul implements Eingabemodul {
  readonly name = "Stream Deck+";
  private lib: Bibliothek | null = null;
  private maler: Maler | null = null;
  private deck: StreamDeck | null = null;
  private suchTimer: NodeJS.Timeout | undefined;
  private zustand: ModulStatus["zustand"] = "bereit";
  private text = "looking for device …";
  private beendet = false;

  private menue: Menue = "haupt";
  private seite = 0;            // Seite im Untermenü
  private reglerSeite = 0;
  private impulsReglerSeite = 0;
  private letzteDrehung = [0, 0, 0, 0];
  // Offset je Element: langer Druck auf den Offset-Regler legt Off. 1–3 und den gemeinsamen Offset
  // auf die vier Regler, langer Druck auf einen davon zurück. Kurzer Druck wirkt erst beim Loslassen.
  private offsetJeElement = false;
  private reglerHalten: { index: number; timer: NodeJS.Timeout; ausgeloest: boolean } | null = null;
  private halten: { taste: number; tippen?: () => void; timer: NodeJS.Timeout; ausgeloest: boolean } | null = null;
  private gespeichert: { nr: number; bis: number } | null = null;

  // Netz-Menü (nur mit netz): Tastenkombination, Code, Entwurf der Einstellungen
  private kombi: NodeJS.Timeout | null = null;
  private code = "";
  private codeTimer: NodeJS.Timeout | undefined;
  private entwurf: NetzWunsch | null = null;
  private netzTimer: NodeJS.Timeout | undefined;

  // Zuletzt gezeichnete Bilder, damit nur Geändertes zum Gerät geht
  private gezeichnet = new Map<string, string>();
  private zeichnet = false;
  private nochmal = false;
  private zeichenTimer: NodeJS.Timeout | undefined;
  private readonly beiAenderung = () => this.zeichneBald();

  constructor(private readonly steuerung: Steuerung, private readonly netz: Netz | null = null) {}

  async starte(): Promise<void> {
    try {
      this.lib = (await import(BIBLIOTHEK)) as Bibliothek;
      this.maler = new Maler(await import("@napi-rs/canvas"));
    } catch (e) {
      this.melde("fehler", `packages missing: ${fehlerText(e)}`);
      return;
    }
    this.steuerung.on("aenderung", this.beiAenderung);
    await this.suche();
  }

  async schliesse(): Promise<void> {
    this.beendet = true;
    clearTimeout(this.suchTimer);
    clearTimeout(this.zeichenTimer);
    clearTimeout(this.codeTimer);
    clearInterval(this.netzTimer);
    if (this.kombi) clearTimeout(this.kombi);
    if (this.reglerHalten) clearTimeout(this.reglerHalten.timer);
    this.steuerung.off("aenderung", this.beiAenderung);
    const deck = this.deck;
    this.deck = null;
    if (deck) {
      await deck.clearPanel().catch(() => {});
      await deck.close().catch(() => {});
    }
  }

  status(): ModulStatus {
    return { name: this.name, art: "eingabe", zustand: this.zustand, text: this.text };
  }

  // ---------- Gerät ----------

  private async suche(): Promise<void> {
    if (this.beendet || this.deck || !this.lib) return;
    try {
      const geraete = await this.lib.listStreamDecks();
      const plus = geraete.find((g) => g.model === this.lib!.DeviceModelId.PLUS);
      if (plus) {
        await this.verbinde(plus.path);
        return;
      }
      this.melde("bereit", geraete.length ? "only Stream Deck+ is supported" : "no device found");
    } catch (e) {
      this.melde("fehler", fehlerText(e));
    }
    this.suchTimer = setTimeout(() => void this.suche(), SUCHEN_MS);
  }

  private async verbinde(pfad: string): Promise<void> {
    try {
      const deck = await this.lib!.openStreamDeck(pfad, { resetToLogoOnClose: true });
      this.deck = deck;
      deck.on("down", (c) => (c.type === "button" ? this.tasteRunter(c.index) : this.reglerRunter(c.index)));
      deck.on("up", (c) => (c.type === "button" ? this.tasteHoch(c.index) : this.reglerHoch(c.index)));
      deck.on("rotate", (c, schritte) => this.drehe(c.index, schritte));
      // Tippen auf den Streifen wirkt wie Drücken des Reglers darunter, im Impulse-Menü löst es einen Flash aus
      deck.on("lcdShortPress", (c, pos) => this.tippeStreifen(pos.x / c.pixelSize.width));
      deck.on("lcdLongPress", (c, pos) => this.tippeStreifen(pos.x / c.pixelSize.width));
      deck.on("lcdSwipe", (c, von, bis) => this.wische(von.x / c.pixelSize.width, (bis.x - von.x) / c.pixelSize.width));
      deck.on("error", (e) => void this.getrennt(e));
      await deck.setBrightness(80);
      await deck.clearPanel();
      this.gezeichnet.clear();
      this.melde("aktiv", `connected (${await deck.getSerialNumber().catch(() => "?")})`);
      log("streamdeck", "verbunden");
      this.zeichneBald();
    } catch (e) {
      // Typisch auf dem Mac: die Elgato-Software hält das Gerät
      this.melde("fehler", `cannot open – is the Elgato software running? (${fehlerText(e)})`);
      this.deck = null;
      this.suchTimer = setTimeout(() => void this.suche(), SUCHEN_MS);
    }
  }

  private async getrennt(e: unknown): Promise<void> {
    log("streamdeck", `getrennt: ${fehlerText(e)}`);
    const deck = this.deck;
    this.deck = null;
    await deck?.close().catch(() => {});
    this.melde("bereit", "disconnected, looking for device …");
    this.suchTimer = setTimeout(() => void this.suche(), SUCHEN_MS);
  }

  private melde(zustand: ModulStatus["zustand"], text: string): void {
    if (this.zustand === zustand && this.text === text) return;
    this.zustand = zustand;
    this.text = text;
    this.steuerung.geaendert();
  }

  // ---------- Bedienung ----------

  private tasteRunter(taste: number): void {
    // Output halten, dann Order dazu: Output schaltet nicht um, Order nicht weiter; nach 2 s Code
    const output = this.halten;
    if (this.netz && this.menue === "haupt" && taste === HAUPT.ordnung && output?.taste === HAUPT.output && !output.ausgeloest) {
      clearTimeout(output.timer);
      this.halten = null;
      this.kombi = setTimeout(() => {
        this.kombi = null;
        this.oeffne("code");
        this.zeichneBald();
      }, HALTEN_MS.netz);
      this.zeichneBald();
      return;
    }
    const aktion = this.aktion(taste);
    if (!aktion) return;
    if (!aktion.halten) {
      aktion.tippen?.();
      this.zeichneBald();
      return;
    }
    if (this.halten) clearTimeout(this.halten.timer);
    const h = aktion.halten;
    const gehalten = {
      taste,
      tippen: aktion.tippen,
      ausgeloest: false,
      timer: setTimeout(() => {
        gehalten.ausgeloest = true;
        h.tun();
        this.zeichneBald();
      }, h.ms),
    };
    this.halten = gehalten;
    this.zeichneBald();
  }

  private tasteHoch(taste: number): void {
    if (this.kombi && (taste === HAUPT.output || taste === HAUPT.ordnung)) {
      clearTimeout(this.kombi);   // zu früh losgelassen
      this.kombi = null;
      this.zeichneBald();
      return;
    }
    const h = this.halten;
    if (!h || h.taste !== taste) return;
    clearTimeout(h.timer);
    this.halten = null;
    if (!h.ausgeloest) h.tippen?.();   // kurz getippt
    this.zeichneBald();
  }

  private oeffne(menue: Menue, seite = 0): void {
    this.menue = menue;
    this.seite = seite;
    clearTimeout(this.codeTimer);
    clearInterval(this.netzTimer);
    this.netzTimer = undefined;
    if (menue === "code") {
      this.code = "";
      this.codeTimer = setTimeout(() => { this.oeffne("haupt"); this.zeichneBald(); }, CODE_WARTEN_MS);
    }
    if (menue === "netz" && this.netz) {
      const netz = this.netz;
      this.entwurf = structuredClone(netz.wunsch);
      const auffrischen = () => void netz.aktualisiere().then(() => this.zeichneBald(), () => {});
      auffrischen();
      this.netzTimer = setInterval(auffrischen, 2000);
    }
  }

  private codeZiffer(ziffer: number): void {
    this.code += String(ziffer);
    clearTimeout(this.codeTimer);
    if (this.code.length < 4) {
      this.codeTimer = setTimeout(() => { this.oeffne("haupt"); this.zeichneBald(); }, CODE_WARTEN_MS);
      return;
    }
    if (this.code === this.netz?.code) {
      log("streamdeck", "Netz-Menü geöffnet");
      this.oeffne("netz");
    } else {
      log("streamdeck", "Netz-Menü: falscher Code");
      this.oeffne("haupt");
    }
  }

  private netzAktion(taste: number): Aktion | undefined {
    const netz = this.netz, e = this.entwurf;
    if (!netz || !e) return undefined;
    switch (taste) {
      case NETZ_TASTEN.wlan: return { tippen: () => { e.ap = !e.ap; } };
      case NETZ_TASTEN.lan: return { tippen: () => { e.lan.modus = e.lan.modus === "dhcp" ? "fest" : "dhcp"; } };
      case NETZ_TASTEN.praefix: return {
        tippen: () => {
          const i = (PRAEFIXE as readonly number[]).indexOf(e.lan.praefix);
          e.lan.praefix = PRAEFIXE[(i + 1) % PRAEFIXE.length]!;
        },
      };
      case NETZ_TASTEN.uebernehmen: return {
        tippen: () => {
          if (netz.wendetAn || gleicherWunsch(e, netz.wunsch)) return;
          void netz.setze(structuredClone(e)).then(() => {
            if (this.menue === "netz") this.entwurf = structuredClone(netz.wunsch);
            this.zeichneBald();
          });
        },
      };
      case NETZ_TASTEN.zurueck: return { tippen: () => this.oeffne("haupt") };
      case NETZ_TASTEN.verwerfen: return { tippen: () => { this.entwurf = structuredClone(netz.wunsch); } };
      default: return undefined;
    }
  }

  private aktion(taste: number): Aktion | undefined {
    const s = this.steuerung;
    if (this.menue === "haupt") {
      switch (taste) {
        case HAUPT.pattern: {
          const i = Math.max(0, MODES_SELECTABLE.indexOf(s.parameter.modus));
          return { tippen: () => this.oeffne("pattern", Math.floor(i / PLAETZE.length)) };
        }
        case HAUPT.presets: {
          const i = s.letztesPreset ?? 0;
          return { tippen: () => this.oeffne("presets", Math.floor(i / PLAETZE.length)) };
        }
        case HAUPT.auto: return { tippen: () => s.setzeAuto(!s.autoAn) };
        case HAUPT.elemente: return { tippen: () => s.schalteStufe("elementFolge") };
        case HAUPT.impulse: return { tippen: () => this.oeffne("impulse") };
        case HAUPT.ordnung: return { tippen: () => s.schalteStufe("ordnung") };
        case HAUPT.pause: return { tippen: () => s.schalteLauf() };
        // Erst nach dem Halten umschalten, damit ein Streifen der Hand nicht die Show übernimmt
        case HAUPT.output: return { halten: { ms: HALTEN_MS.output, tun: () => s.setzeUebernahme(!s.uebernahme.soll) } };
        default: return undefined;
      }
    }
    if (this.menue === "code") return { tippen: () => this.codeZiffer(taste + 1) };
    if (this.menue === "netz") return this.netzAktion(taste);
    if (taste === TASTE_ZURUECK) return { tippen: () => this.oeffne("haupt") };
    if (this.menue === "impulse") {
      const art = IMPULS_ARTEN_TASTEN[taste];
      if (art) return { tippen: () => s.setzeImpuls({ art }) };
      if (taste === TASTE_ELEMENT_FOLGE) {
        const i = ELEMENT_ORDERS.indexOf(s.impuls.elementFolge);
        return { tippen: () => s.setzeImpuls({ elementFolge: ELEMENT_ORDERS[(i + 1) % ELEMENT_ORDERS.length] }) };
      }
      if (taste === TASTE_SYMMETRISCH) return { tippen: () => s.setzeImpuls({ symmetrisch: !s.impuls.symmetrisch }) };
      if (taste === TASTE_IMPULS_REGLER) {
        return { tippen: () => { this.impulsReglerSeite = (this.impulsReglerSeite + 1) % IMPULS_REGLER_SEITEN.length; } };
      }
      return undefined;
    }
    const anzahl = this.menue === "pattern" ? MODES_SELECTABLE.length : PRESET_ANZAHL;
    if (taste === TASTE_SEITE) return { tippen: () => { this.seite = (this.seite + 1) % seitenAnzahl(anzahl); } };
    const i = eintragAuf(this.seite, taste, anzahl);
    if (i === undefined) return undefined;
    if (this.menue === "pattern") return { tippen: () => s.waehlePattern(MODES_SELECTABLE[i]!) };
    return {
      tippen: () => s.rufePresetAuf(i),
      halten: {
        ms: HALTEN_MS.presetSpeichern,
        tun: () => {
          s.speicherePreset(i);
          this.gespeichert = { nr: i, bis: Date.now() + GESPEICHERT_MS };
          setTimeout(() => this.zeichneBald(), GESPEICHERT_MS + 10);
        },
      },
    };
  }

  // Reglerseiten der aktuellen Grundbewegung; die Nummer bleibt beim Formwechsel, passt sich aber an
  private seiten(): ReglerSeite[] {
    return reglerSeiten(this.steuerung.parameter.modus);
  }

  private aktuelleSeite(): { seite: ReglerSeite; nr: number; anzahl: number } {
    const seiten = this.seiten();
    const nr = this.reglerSeite % seiten.length;
    return { seite: seiten[nr]!, nr, anzahl: seiten.length };
  }

  private blaettere(richtung: number): void {
    const n = this.seiten().length;
    this.reglerSeite = (((this.aktuelleSeite().nr + richtung) % n) + n) % n;
  }

  private regler(index: number): Regler | undefined {
    return this.aktuelleSeite().seite.regler[index];
  }

  private impulsRegler(index: number) {
    const name = IMPULS_REGLER_SEITEN[this.impulsReglerSeite]?.regler[index];
    // Loch und Iris haben statt der Breite eine Größe
    return name === "breite" && isApertureKind(this.steuerung.impuls.art) ? "groesse" : name;
  }

  private drehe(index: number, schritte: number): void {
    const jetzt = Date.now();
    const schnell = jetzt - (this.letzteDrehung[index] ?? 0) < SCHNELL_MS;
    this.letzteDrehung[index] = jetzt;
    if (this.menue === "code") return;
    if (this.menue === "netz") {
      // je Regler eine Zahl der festen IP
      const a = this.entwurf?.lan.adresse;
      if (!a) return;
      a[index] = Math.min(255, Math.max(0, a[index]! + schritte * (schnell ? 10 : 1)));
      this.zeichneBald();
      return;
    }
    if (this.menue === "impulse") {
      const name = this.impulsRegler(index);
      if (name) this.steuerung.verstelleImpuls(name, schritte * (schnell ? 5 : 1));
      return;
    }
    if (this.offsetModus()) {
      const n = schritte * (schnell ? 5 : 1);
      if (index < 3) this.steuerung.verstelleOffsetElement(index, n);
      else this.steuerung.verstelle("offset", n);   // verschiebt alle, Abstände bleiben
      return;
    }
    const r = this.regler(index);
    if (!r) return;
    if (r.art === "zahl") {
      const b = BEREICHE[r.name];
      // Bei großen Bereichen mit feinem Schritt (Speed) wirkt schnelles Drehen stärker
      const faktor = schnell ? (b.schritt < 1 ? 10 : 5) : 1;
      this.steuerung.verstelle(r.name, schritte * faktor);
    } else if (r.art === "stufe") {
      this.steuerung.schalteStufe(r.name, Math.sign(schritte));
    } else if ((schritte > 0) !== this.steuerung.parameter[r.name]) {
      this.steuerung.schalte(r.name);   // rechts drehen = an, links = aus
    }
  }

  // Offset je Element gilt nur im Hauptmenü und den Untermenüs mit Reglerseiten, solange die
  // Grundbewegung den Offset benutzt
  private offsetModus(): boolean {
    if (!this.offsetJeElement) return false;
    if (["impulse", "code", "netz"].includes(this.menue) || !benutzt(this.steuerung.parameter.modus, "offset")) {
      this.offsetJeElement = false;
      return false;
    }
    return true;
  }

  // Langer Druck nur auf dem Offset-Regler (bzw. im Offset-je-Element-Modus auf jedem); sonst wie bisher sofort
  private reglerRunter(index: number): void {
    const lang = this.offsetModus() || (["haupt", "pattern", "presets"].includes(this.menue) && this.regler(index)?.name === "offset");
    if (!lang) {
      this.reglerDruck(index);
      return;
    }
    if (this.reglerHalten) clearTimeout(this.reglerHalten.timer);
    const h = {
      index,
      ausgeloest: false,
      timer: setTimeout(() => {
        h.ausgeloest = true;
        this.offsetJeElement = !this.offsetJeElement;
        const p = this.steuerung.parameter;
        // Erstes Mal je Element: alle starten beim gemeinsamen Offset
        if (this.offsetJeElement && !p.offsetGetrennt) {
          this.steuerung.setze({ offsetGetrennt: true, offsetElemente: p.offsetElemente.map(() => p.offset) });
        }
        this.zeichneBald();
      }, HALTEN_MS.reglerLang),
    };
    this.reglerHalten = h;
  }

  private reglerHoch(index: number): void {
    const h = this.reglerHalten;
    if (!h || h.index !== index) return;
    clearTimeout(h.timer);
    this.reglerHalten = null;
    if (!h.ausgeloest) this.reglerDruck(index);
    this.zeichneBald();
  }

  private reglerDruck(index: number): void {
    if (this.menue === "code") return;
    if (this.offsetModus()) {
      const p = this.steuerung.parameter;
      // Element: zurück auf den gemeinsamen Offset; gemeinsamer Regler: Vorgabe, alle gleich
      if (index < 3) this.steuerung.setze({ offsetElemente: p.offsetElemente.map((w, i) => (i === index ? p.offset : w)) });
      else this.steuerung.vorgabe("offset");
      return;
    }
    if (this.menue === "netz") {
      // Drücken: diese Zahl wieder wie gespeichert
      const a = this.entwurf?.lan.adresse, w = this.netz?.wunsch.lan.adresse;
      if (a && w) a[index] = w[index]!;
      this.zeichneBald();
      return;
    }
    if (this.menue === "impulse") {
      const name = this.impulsRegler(index);
      if (name) this.steuerung.vorgabeImpuls(name);
      return;
    }
    const r = this.regler(index);
    if (!r) return;
    if (r.art === "zahl") this.steuerung.vorgabe(r.name);
    else if (r.art === "schalter") this.steuerung.schalte(r.name);
    else this.steuerung.setze({ [r.name]: PARAMETER_DEFAULTS[r.name] });
  }

  // x: 0 = links … 1 = rechts
  private tippeStreifen(x: number): void {
    if (this.menue === "code") return;
    if (this.menue === "impulse") {
      this.steuerung.tippeImpuls(x);
      return;
    }
    this.reglerDruck(Math.min(3, Math.floor(x * 4)));
  }

  // von: Anfang (0 … 1), dx: Weg als Anteil der Streifenbreite
  private wische(von: number, dx: number): void {
    if (this.menue === "code" || this.menue === "netz") return;
    if (this.menue === "impulse") {
      // kurzes Wischen gilt als Tippen, sonst läuft der Flash vom Rand in Wischrichtung durch
      if (Math.abs(dx) < 0.05) this.tippeStreifen(von);
      else this.steuerung.tippeImpuls(dx > 0 ? 0 : 1, true);
      return;
    }
    if (Math.abs(dx) < 0.05) return;
    this.offsetJeElement = false;
    this.blaettere(dx < 0 ? 1 : -1);
    this.zeichneBald();
  }

  // ---------- Anzeige ----------

  private zeichneBald(): void {
    if (!this.deck || this.zeichenTimer) return;
    this.zeichenTimer = setTimeout(() => {
      this.zeichenTimer = undefined;
      void this.zeichne();
    }, ZEICHNEN_MS);
  }

  private async zeichne(): Promise<void> {
    if (this.zeichnet) { this.nochmal = true; return; }
    const deck = this.deck, maler = this.maler;
    if (!deck || !maler) return;
    this.zeichnet = true;
    try {
      for (const c of deck.CONTROLS) {
        if (c.type === "button" && c.feedbackType === "lcd") {
          const inhalt = this.tastenInhalt(c.index);
          if (this.neu(`taste${c.index}`, inhalt)) {
            await deck.fillKeyBuffer(c.index, maler.taste(c.pixelSize.width, c.pixelSize.height, inhalt), { format: "rgba" });
          }
        } else if (c.type === "lcd-segment") {
          const felder = this.felder();
          const { name, ton } = this.streifenKopf();
          if (this.neu("streifen", { felder, name, ton })) {
            await deck.fillLcd(c.id, maler.streifen(c.pixelSize.width, c.pixelSize.height, felder, name, ton), { format: "rgba" });
          }
        }
      }
    } catch (e) {
      log("streamdeck", `Zeichnen: ${fehlerText(e)}`);
    } finally {
      this.zeichnet = false;
    }
    if (this.nochmal) {
      this.nochmal = false;
      this.zeichneBald();
    }
  }

  private neu(schluessel: string, inhalt: unknown): boolean {
    const text = JSON.stringify(inhalt);
    if (this.gezeichnet.get(schluessel) === text) return false;
    this.gezeichnet.set(schluessel, text);
    return true;
  }

  private tastenInhalt(taste: number): TastenInhalt {
    // Hauptmenü: Menütasten dunkel mit Neonschrift und Neonrand
    const menueTaste = (ton: Farbton): Partial<TastenInhalt> => ({ grund: ton.dunkel, text: ton.hell, rahmen: ton.hell, rahmenBreite: 3 });
    const { parameter, uebernahme, presets, letztesPreset } = this.steuerung;
    const haelt = this.halten?.taste === taste && !this.halten.ausgeloest ? "hold …" : undefined;
    if (this.menue === "code") {
      return { titel: String(taste + 1), grund: TON.netz.dunkel, text: TON.netz.hell };
    }
    if (this.menue === "netz") return this.netzTaste(taste);
    if (this.menue === "haupt" && this.kombi && (taste === HAUPT.output || taste === HAUPT.ordnung)) {
      return { titel: "Network", unter: "hold …", grund: TON.netz.dunkel, text: TON.netz.hell, rahmen: TON.netz.hell };
    }
    if (this.menue === "haupt") {
      switch (taste) {
        case HAUPT.pattern: return { titel: "Pattern ›", unter: MODE_NAME[parameter.modus], ...menueTaste(TON.pattern) };
        case HAUPT.presets: {
          const p = letztesPreset === null ? null : presets[letztesPreset];
          return { titel: "Presets ›", unter: p?.name ?? "–", ...menueTaste(TON.presets) };
        }
        case HAUPT.impulse: return { titel: "Impulses ›", unter: IMPULSE_NAME[this.steuerung.impuls.art], ...menueTaste(TON.impulse) };
        // Auto läuft: voll leuchtend wie der Rahmen im Client, darunter der aktuelle Look
        case HAUPT.auto: {
          const s = this.steuerung;
          if (s.autoAn) {
            const p = letztesPreset === null ? null : presets[letztesPreset];
            return { titel: "AUTO", unter: p?.name ?? "–", grund: TON.presets.hell, text: TON.presets.auf };
          }
          return s.autoStartbar
            ? { titel: "Auto", unter: "off", ...menueTaste(TON.presets) }
            : { titel: "Auto", unter: "too few presets", leise: true };
        }
        // bei Ruhe wirken Ordnung und Elemente nicht: gedämpft
        case HAUPT.ordnung:
          return { titel: "Order", unter: STUFEN.ordnung.text[parameter.ordnung], leise: !benutzt(parameter.modus, "ordnung") };
        case HAUPT.elemente:
          return { titel: "Elements", unter: STUFEN.elementFolge.text[parameter.elementFolge], leise: !benutzt(parameter.modus, "elementFolge") };
        case HAUPT.pause: return parameter.laeuft ? { titel: "Pause" } : { titel: "Resume", rahmen: FARBE.akzent };
        case HAUPT.output:
          switch (uebernahme.zustand) {
            case "an": return { titel: "OUTPUT", unter: haelt ?? "on", grund: FARBE.live };
            case "blendetEin":
            case "blendetAus":
              return { titel: `${Math.round(uebernahme.anteil * 100)} %`, unter: "Output fading", grund: FARBE.blenden };
            default: return { titel: "Output", unter: haelt ?? "off · hold", grund: FARBE.liveDunkel, rahmen: FARBE.live };
          }
        default: return { titel: "" };
      }
    }
    // Untermenüs: alles in der Farbe des Menüs, der gewählte Eintrag hell
    const ton: Farbton = TON[this.menue];
    const eintrag = (titel: string, gewaehlt: boolean, extra: Partial<TastenInhalt> = {}): TastenInhalt =>
      gewaehlt ? { titel, grund: ton.hell, text: ton.auf, ...extra } : { titel, grund: ton.dunkel, ...extra };
    if (taste === TASTE_ZURUECK) return { titel: "‹ Back", rahmen: ton.hell };
    if (this.menue === "impulse") {
      const e = this.steuerung.impuls;
      const art = IMPULS_ARTEN_TASTEN[taste];
      if (art) {
        // gewählte Art hell, laufende mit hellem Rahmen
        const laeuft = this.steuerung.impulse().some((i) => i.art === art);
        return eintrag(IMPULSE_NAME[art], e.art === art, laeuft && e.art !== art ? { rahmen: ton.hell } : {});
      }
      if (taste === TASTE_ELEMENT_FOLGE) return eintrag("Elements", false, { unter: ELEMENT_ORDER_NAME[e.elementFolge] });
      if (taste === TASTE_SYMMETRISCH) return eintrag("Symmetric", e.symmetrisch, { unter: e.symmetrisch ? "on" : "off" });
      if (taste === TASTE_IMPULS_REGLER) {
        return eintrag("Controls ›", false, { unter: IMPULS_REGLER_SEITEN[this.impulsReglerSeite]?.name });
      }
      return { titel: "" };
    }
    const anzahl = this.menue === "pattern" ? MODES_SELECTABLE.length : PRESET_ANZAHL;
    if (taste === TASTE_SEITE) {
      return seitenAnzahl(anzahl) > 1
        ? eintrag("Page ›", false, { unter: `${this.seite + 1}/${seitenAnzahl(anzahl)}` })
        : { titel: "" };
    }
    const i = eintragAuf(this.seite, taste, anzahl);
    if (i === undefined) return { titel: "" };
    if (this.menue === "pattern") return eintrag(MODE_NAME[MODES_SELECTABLE[i]!], parameter.modus === MODES_SELECTABLE[i]);
    const p = presets[i];
    const gespeichert = this.gespeichert?.nr === i && Date.now() < this.gespeichert.bis;
    if (!p) return { titel: String(i + 1), unter: gespeichert ? "stored" : haelt ?? "empty · hold", leise: true, grund: FARBE.feld };
    return eintrag(p.name, letztesPreset === i, { unter: gespeichert ? "stored" : haelt ?? String(i + 1) });
  }

  private netzTaste(taste: number): TastenInhalt {
    const netz = this.netz, e = this.entwurf;
    if (!netz || !e) return { titel: "" };
    const ton = TON.netz;
    const st = netz.status;
    const geaendert = !gleicherWunsch(e, netz.wunsch);
    const schalter = (titel: string, an: boolean, unter: string): TastenInhalt =>
      an ? { titel, unter, grund: ton.hell, text: ton.auf } : { titel, unter, grund: ton.dunkel };
    switch (taste) {
      case NETZ_TASTEN.wlan: return schalter("WLAN", e.ap, e.ap ? "on" : "off");
      case NETZ_TASTEN.lan: return schalter("LAN", e.lan.modus === "dhcp", e.lan.modus === "dhcp" ? "DHCP" : "fixed IP");
      case NETZ_TASTEN.praefix: return { titel: "Mask", unter: `/${e.lan.praefix}`, grund: ton.dunkel };
      case NETZ_TASTEN.uebernehmen:
        if (netz.wendetAn) return { titel: "Apply", unter: "applying …", grund: FARBE.blenden };
        return geaendert
          ? { titel: "Apply", unter: "changes", grund: ton.hell, text: ton.auf }
          : { titel: "Apply", unter: netz.meldung || "no changes", leise: true, grund: ton.dunkel };
      case NETZ_TASTEN.zurueck: return { titel: "‹ Back", rahmen: ton.hell };
      case NETZ_TASTEN.verwerfen: return geaendert ? { titel: "Reset", unter: "draft", grund: ton.dunkel } : { titel: "Reset", leise: true };
      case NETZ_TASTEN.lanStand: {
        const unter = st.lanAdressen[0] ?? (st.kabel === false ? "no cable" : "no address");
        return { titel: st.dhcpAktiv ? "LAN · DHCP" : "LAN", unter, grund: FARBE.feld };
      }
      case NETZ_TASTEN.wlanStand: return { titel: "WLAN now", unter: st.apAn ? "on" : "off", grund: FARBE.feld };
      default: return { titel: "" };
    }
  }

  // Kopf des Touchstreifens: Name der Reglerseite und ihre Farbe
  private streifenKopf(): { name: string; ton: Farbton } {
    if (this.menue === "code") return { name: "Network · enter code", ton: TON.netz };
    if (this.menue === "netz") {
      const e = this.entwurf;
      const modus = e?.lan.modus === "dhcp" ? "DHCP, else fixed IP" : "fixed IP";
      return { name: `Network · LAN ${modus} · ${e ? zeigeAdresse(e) : ""}`, ton: TON.netz };
    }
    if (this.menue === "impulse") {
      const seite = IMPULS_REGLER_SEITEN[this.impulsReglerSeite];
      return { name: `${seite?.name ?? ""} · Strip: ${IMPULSE_NAME[this.steuerung.impuls.art]}`, ton: TON.impulse };
    }
    if (this.offsetModus()) return { name: "Offset per element · hold to leave", ton: TON.bewegung };
    const { seite, nr, anzahl } = this.aktuelleSeite();
    return { name: anzahl > 1 ? `${seite.name} ${nr + 1}/${anzahl}` : seite.name, ton: TON[seite.ton] };
  }

  private felder(): Feld[] {
    if (this.menue === "code") {
      return [0, 1, 2, 3].map((i): Feld => ({ titel: "Code", wert: i < this.code.length ? "●" : "○", anteil: null }));
    }
    if (this.menue === "netz") {
      const a = this.entwurf?.lan.adresse ?? [0, 0, 0, 0];
      const w = this.netz?.wunsch.lan.adresse;
      return a.map((z, i): Feld => ({ titel: `IP ${i + 1}${w && w[i] !== z ? " *" : ""}`, wert: String(z), anteil: z / 255 }));
    }
    if (this.menue === "impulse") {
      const e = this.steuerung.impuls;
      // immer vier Felder, damit jedes über seinem Drehregler steht
      return [0, 1, 2, 3].map((i): Feld => {
        const name = this.impulsRegler(i);
        if (!name) return { titel: "", wert: "", anteil: null };
        const b = IMPULS_BEREICHE[name], w = impulsWert(e, name);
        return { titel: b.kurz, wert: zeigeImpuls(name, w), anteil: (w - b.min) / (b.max - b.min) };
      });
    }
    const p = this.steuerung.parameter;
    if (this.offsetModus()) {
      const b = BEREICHE.offset;
      const werte = [...(p.offsetGetrennt ? p.offsetElemente : p.offsetElemente.map(() => p.offset)), p.offset];
      return werte.map((w, i): Feld => ({
        titel: i < 3 ? `Off. ${i + 1}` : "Off. all",
        wert: zeigeWert("offset", w),
        anteil: (w - b.min) / (b.max - b.min),
      }));
    }
    return [0, 1, 2, 3].map((i): Feld => {
      const r = this.regler(i);
      if (!r) return { titel: "", wert: "", anteil: null };
      if (r.art === "zahl") {
        const b = BEREICHE[r.name];
        // Offset je Element im Spiel: kenntlich machen, langer Druck zeigt die drei
        const titel = r.name === "offset" && offsetVerschieden(p) ? "Offset 1–3" : b.kurz;
        return { titel, wert: zeigeWert(r.name, p[r.name]), anteil: (p[r.name] - b.min) / (b.max - b.min) };
      }
      if (r.art === "schalter") return { titel: SCHALTER[r.name], wert: p[r.name] ? "on" : "off", anteil: null };
      const st = STUFEN[r.name];
      return { titel: st.name, wert: (st.text as Record<string, string>)[p[r.name]] ?? "", anteil: null };
    });
  }
}
