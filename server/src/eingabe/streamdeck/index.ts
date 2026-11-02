// Elgato Stream Deck+ als Bedienung am Server-Rechner.
//
// Das Gerät darf jederzeit angesteckt oder abgezogen werden: ohne Gerät wird alle 2 s gesucht.
// macOS/Windows: Die Elgato-Software muss beendet sein, sonst ist das Gerät belegt.
// Linux/Raspberry Pi: udev-Regel nötig (siehe README).
import type { StreamDeck } from "@elgato-stream-deck/node";
import { MODI, MODUS_NAME } from "@parrafraktor/engine";
import { BEREICHE, zeigeWert, type ModulStatus } from "@parrafraktor/protokoll";
import { fehlerText, log } from "../../log.js";
import type { Steuerung } from "../../steuerung.js";
import type { Eingabemodul } from "../eingabe.js";
import {
  PATTERN_SEITEN, REGLER_SEITEN, TASTE_PAUSE, TASTE_SEITE, TASTE_UEBERNAHME, UEBERNAHME_HALTEN_MS,
  patternAufTaste, patternSeiteVon, type Regler,
} from "./belegung.js";
import { FARBE, Maler, type Feld, type TastenInhalt } from "./bilder.js";

type Bibliothek = typeof import("@elgato-stream-deck/node");

const SUCHEN_MS = 2000;
const ZEICHNEN_MS = 50;      // höchstens 20 Bilder pro Sekunde
const SCHNELL_MS = 60;       // Rastungen schneller als das zählen mehrfach

export class StreamDeckModul implements Eingabemodul {
  readonly name = "Stream Deck+";
  private lib: Bibliothek | null = null;
  private maler: Maler | null = null;
  private deck: StreamDeck | null = null;
  private suchTimer: NodeJS.Timeout | undefined;
  private zustand: ModulStatus["zustand"] = "bereit";
  private text = "suche Gerät …";
  private beendet = false;

  private reglerSeite = 0;
  private patternSeite = 0;
  private letzteDrehung = [0, 0, 0, 0];
  private uebernahmeTimer: NodeJS.Timeout | undefined;
  private uebernahmeGehalten = false;

  // Zuletzt gezeichnete Bilder, damit nur Geändertes zum Gerät geht
  private gezeichnet = new Map<string, string>();
  private zeichnet = false;
  private nochmal = false;
  private zeichenTimer: NodeJS.Timeout | undefined;
  private readonly beiAenderung = () => this.zeichneBald();

  constructor(private readonly steuerung: Steuerung) {}

  async starte(): Promise<void> {
    try {
      this.lib = await import("@elgato-stream-deck/node");
      this.maler = new Maler(await import("@napi-rs/canvas"));
    } catch (e) {
      this.melde("fehler", `Pakete fehlen: ${fehlerText(e)}`);
      return;
    }
    this.steuerung.on("aenderung", this.beiAenderung);
    this.patternSeite = patternSeiteVon(this.steuerung.parameter.modus);
    await this.suche();
  }

  async schliesse(): Promise<void> {
    this.beendet = true;
    clearTimeout(this.suchTimer);
    clearTimeout(this.zeichenTimer);
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
      this.melde("bereit", geraete.length ? "nur Stream Deck+ wird unterstützt" : "kein Gerät gefunden");
    } catch (e) {
      this.melde("fehler", fehlerText(e));
    }
    this.suchTimer = setTimeout(() => void this.suche(), SUCHEN_MS);
  }

  private async verbinde(pfad: string): Promise<void> {
    try {
      const deck = await this.lib!.openStreamDeck(pfad, { resetToLogoOnClose: true });
      this.deck = deck;
      deck.on("down", (c) => (c.type === "button" ? this.tasteRunter(c.index) : this.reglerDruck(c.index)));
      deck.on("up", (c) => { if (c.type === "button") this.tasteHoch(c.index); });
      deck.on("rotate", (c, schritte) => this.drehe(c.index, schritte));
      // Tippen auf den Streifen wirkt wie Drücken des Reglers darunter
      deck.on("lcdShortPress", (c, pos) => this.reglerDruck(Math.floor((pos.x / c.pixelSize.width) * 4)));
      deck.on("lcdSwipe", (_c, von, bis) => this.wische(bis.x - von.x));
      deck.on("error", (e) => void this.getrennt(e));
      await deck.setBrightness(80);
      await deck.clearPanel();
      this.gezeichnet.clear();
      this.melde("aktiv", `verbunden (${await deck.getSerialNumber().catch(() => "?")})`);
      log("streamdeck", "verbunden");
      this.zeichneBald();
    } catch (e) {
      // Typisch auf dem Mac: die Elgato-Software hält das Gerät
      this.melde("fehler", `nicht zu öffnen – läuft die Elgato-Software? (${fehlerText(e)})`);
      this.deck = null;
      this.suchTimer = setTimeout(() => void this.suche(), SUCHEN_MS);
    }
  }

  private async getrennt(e: unknown): Promise<void> {
    log("streamdeck", `getrennt: ${fehlerText(e)}`);
    const deck = this.deck;
    this.deck = null;
    await deck?.close().catch(() => {});
    this.melde("bereit", "getrennt, suche Gerät …");
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
    const s = this.steuerung;
    const modus = patternAufTaste(this.patternSeite, taste);
    if (modus) s.waehlePattern(modus);
    else if (taste === TASTE_SEITE) {
      this.patternSeite = (this.patternSeite + 1) % PATTERN_SEITEN;
      this.zeichneBald();
    } else if (taste === TASTE_PAUSE) s.schalteLauf();
    else if (taste === TASTE_UEBERNAHME) {
      // Erst nach dem Halten umschalten, damit ein Streifen der Hand nicht die Show übernimmt
      this.uebernahmeGehalten = true;
      this.zeichneBald();
      this.uebernahmeTimer = setTimeout(() => {
        this.uebernahmeGehalten = false;
        s.setzeUebernahme(!s.uebernahme.soll);
      }, UEBERNAHME_HALTEN_MS);
    }
  }

  private tasteHoch(taste: number): void {
    if (taste !== TASTE_UEBERNAHME) return;
    clearTimeout(this.uebernahmeTimer);
    this.uebernahmeGehalten = false;
    this.zeichneBald();
  }

  private regler(index: number): Regler | undefined {
    return REGLER_SEITEN[this.reglerSeite]?.[index];
  }

  private drehe(index: number, schritte: number): void {
    const r = this.regler(index);
    if (!r) return;
    const jetzt = Date.now();
    const schnell = jetzt - (this.letzteDrehung[index] ?? 0) < SCHNELL_MS;
    this.letzteDrehung[index] = jetzt;
    if (r.art === "zahl") {
      const b = BEREICHE[r.name];
      // Bei großen Bereichen mit feinem Schritt (Speed) wirkt schnelles Drehen stärker
      const faktor = schnell ? (b.schritt < 1 ? 10 : 5) : 1;
      this.steuerung.verstelle(r.name, schritte * faktor);
    } else if (r.art === "pattern") {
      this.steuerung.naechstesPattern(Math.sign(schritte));
    } else {
      this.steuerung.schalteReihenfolge();
    }
  }

  private reglerDruck(index: number): void {
    const r = this.regler(index);
    if (!r) return;
    if (r.art === "zahl") this.steuerung.vorgabe(r.name);
    else if (r.art === "reihenfolge") this.steuerung.schalteReihenfolge();
    else this.steuerung.schalteLauf();
  }

  private wische(dx: number): void {
    if (Math.abs(dx) < 40) return;
    const n = REGLER_SEITEN.length;
    this.reglerSeite = (((this.reglerSeite + (dx < 0 ? 1 : -1)) % n) + n) % n;
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
          const seite = `${this.reglerSeite + 1}/${REGLER_SEITEN.length}`;
          if (this.neu("streifen", { felder, seite })) {
            await deck.fillLcd(c.id, maler.streifen(c.pixelSize.width, c.pixelSize.height, felder, seite), { format: "rgba" });
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
    const { parameter, uebernahme } = this.steuerung;
    const modus = patternAufTaste(this.patternSeite, taste);
    if (modus) {
      const aktiv = parameter.modus === modus;
      return { titel: MODUS_NAME[modus], rahmen: aktiv ? FARBE.akzent : undefined };
    }
    if (taste === TASTE_SEITE) {
      return { titel: "Pattern ›", unter: `${this.patternSeite + 1}/${PATTERN_SEITEN}` };
    }
    if (taste === TASTE_PAUSE) {
      return parameter.laeuft ? { titel: "Pause" } : { titel: "Weiter", rahmen: FARBE.akzent };
    }
    if (taste === TASTE_UEBERNAHME) {
      const halten = this.uebernahmeGehalten ? "halten …" : undefined;
      switch (uebernahme.zustand) {
        case "an": return { titel: "LIVE", unter: halten ?? "App fährt", grund: FARBE.live };
        case "blendetEin":
        case "blendetAus":
          return { titel: `${Math.round(uebernahme.anteil * 100)} %`, unter: "blendet", grund: FARBE.blenden };
        default: return { titel: "MA", unter: halten ?? "halten = live", grund: FARBE.ma };
      }
    }
    return { titel: "" };
  }

  private felder(): Feld[] {
    const p = this.steuerung.parameter;
    return (REGLER_SEITEN[this.reglerSeite] ?? []).map((r): Feld => {
      if (r.art === "zahl") {
        const b = BEREICHE[r.name];
        return { titel: b.kurz, wert: zeigeWert(r.name, p[r.name]), anteil: (p[r.name] - b.min) / (b.max - b.min) };
      }
      if (r.art === "pattern") {
        return { titel: p.laeuft ? "Pattern" : "Pattern (Pause)", wert: MODUS_NAME[p.modus], anteil: MODI.indexOf(p.modus) / (MODI.length - 1) };
      }
      return { titel: "Reihenfolge", wert: p.jeElement ? "je Element" : "alle 36", anteil: null };
    });
  }
}
