// Elgato Stream Deck+ als Bedienung am Server-Rechner.
//
// Das Gerät darf jederzeit angesteckt oder abgezogen werden: ohne Gerät wird alle 2 s gesucht.
// macOS/Windows: Die Elgato-Software muss beendet sein, sonst ist das Gerät belegt.
// Linux/Raspberry Pi: udev-Regel nötig (siehe README).
import type { StreamDeck } from "@elgato-stream-deck/node";
import {
  ELEMENT_FOLGEN, ELEMENT_FOLGE_NAME, IMPULS_NAME, MODI, MODUS_NAME, PARAMETER_VORGABE,
} from "@parrafraktor/engine";
import {
  BEREICHE, IMPULS_BEREICHE, PRESET_ANZAHL, SCHALTER, STUFEN, impulsWert, zeigeImpuls, zeigeWert, type ModulStatus,
} from "@parrafraktor/protokoll";
import { fehlerText, log } from "../../log.js";
import type { Steuerung } from "../../steuerung.js";
import type { Eingabemodul } from "../eingabe.js";
import {
  HAUPT, HALTEN_MS, IMPULS_ARTEN_TASTEN, IMPULS_REGLER_SEITEN, PLAETZE, REGLER_SEITEN, TASTE_ELEMENT_FOLGE,
  TASTE_IMPULS_REGLER, TASTE_SEITE, TASTE_ZURUECK,
  eintragAuf, seitenAnzahl, type Menue, type Regler,
} from "./belegung.js";
import { FARBE, Maler, type Feld, type TastenInhalt } from "./bilder.js";

type Bibliothek = typeof import("@elgato-stream-deck/node");

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
  private text = "suche Gerät …";
  private beendet = false;

  private menue: Menue = "haupt";
  private seite = 0;            // Seite im Untermenü
  private reglerSeite = 0;
  private impulsReglerSeite = 0;
  private letzteDrehung = [0, 0, 0, 0];
  private halten: { taste: number; tippen?: () => void; timer: NodeJS.Timeout; ausgeloest: boolean } | null = null;
  private gespeichert: { nr: number; bis: number } | null = null;

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
      // Tippen auf den Streifen wirkt wie Drücken des Reglers darunter, im Impulse-Menü löst es einen Flash aus
      deck.on("lcdShortPress", (c, pos) => this.tippeStreifen(pos.x / c.pixelSize.width));
      deck.on("lcdLongPress", (c, pos) => this.tippeStreifen(pos.x / c.pixelSize.width));
      deck.on("lcdSwipe", (c, von, bis) => this.wische(von.x / c.pixelSize.width, (bis.x - von.x) / c.pixelSize.width));
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
  }

  private aktion(taste: number): Aktion | undefined {
    const s = this.steuerung;
    if (this.menue === "haupt") {
      switch (taste) {
        case HAUPT.pattern: {
          const i = MODI.indexOf(s.parameter.modus);
          return { tippen: () => this.oeffne("pattern", Math.floor(i / PLAETZE.length)) };
        }
        case HAUPT.presets: {
          const i = s.letztesPreset ?? 0;
          return { tippen: () => this.oeffne("presets", Math.floor(i / PLAETZE.length)) };
        }
        case HAUPT.regler: return { tippen: () => { this.reglerSeite = (this.reglerSeite + 1) % REGLER_SEITEN.length; } };
        case HAUPT.elemente: return { tippen: () => s.schalteStufe("elementFolge") };
        case HAUPT.impulse: return { tippen: () => this.oeffne("impulse") };
        case HAUPT.ordnung: return { tippen: () => s.schalteStufe("ordnung") };
        case HAUPT.pause: return { tippen: () => s.schalteLauf() };
        // Erst nach dem Halten umschalten, damit ein Streifen der Hand nicht die Show übernimmt
        case HAUPT.output: return { halten: { ms: HALTEN_MS.output, tun: () => s.setzeUebernahme(!s.uebernahme.soll) } };
        default: return undefined;
      }
    }
    if (taste === TASTE_ZURUECK) return { tippen: () => this.oeffne("haupt") };
    if (this.menue === "impulse") {
      const art = IMPULS_ARTEN_TASTEN[taste];
      if (art) return { tippen: () => s.setzeImpuls({ art }) };
      if (taste === TASTE_ELEMENT_FOLGE) {
        const i = ELEMENT_FOLGEN.indexOf(s.impuls.elementFolge);
        return { tippen: () => s.setzeImpuls({ elementFolge: ELEMENT_FOLGEN[(i + 1) % ELEMENT_FOLGEN.length] }) };
      }
      if (taste === TASTE_IMPULS_REGLER) {
        return { tippen: () => { this.impulsReglerSeite = (this.impulsReglerSeite + 1) % IMPULS_REGLER_SEITEN.length; } };
      }
      return undefined;
    }
    const anzahl = this.menue === "pattern" ? MODI.length : PRESET_ANZAHL;
    if (taste === TASTE_SEITE) return { tippen: () => { this.seite = (this.seite + 1) % seitenAnzahl(anzahl); } };
    const i = eintragAuf(this.seite, taste, anzahl);
    if (i === undefined) return undefined;
    if (this.menue === "pattern") return { tippen: () => s.waehlePattern(MODI[i]!) };
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

  private regler(index: number): Regler | undefined {
    return REGLER_SEITEN[this.reglerSeite]?.[index];
  }

  private drehe(index: number, schritte: number): void {
    const jetzt = Date.now();
    const schnell = jetzt - (this.letzteDrehung[index] ?? 0) < SCHNELL_MS;
    this.letzteDrehung[index] = jetzt;
    if (this.menue === "impulse") {
      const name = IMPULS_REGLER_SEITEN[this.impulsReglerSeite]?.[index];
      if (name) this.steuerung.verstelleImpuls(name, schritte * (schnell ? 5 : 1));
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

  private reglerDruck(index: number): void {
    if (this.menue === "impulse") {
      const name = IMPULS_REGLER_SEITEN[this.impulsReglerSeite]?.[index];
      if (name) this.steuerung.vorgabeImpuls(name);
      return;
    }
    const r = this.regler(index);
    if (!r) return;
    if (r.art === "zahl") this.steuerung.vorgabe(r.name);
    else if (r.art === "schalter") this.steuerung.schalte(r.name);
    else this.steuerung.setze({ [r.name]: PARAMETER_VORGABE[r.name] });
  }

  // x: 0 = links … 1 = rechts
  private tippeStreifen(x: number): void {
    if (this.menue === "impulse") {
      this.steuerung.tippeImpuls(x);
      return;
    }
    this.reglerDruck(Math.min(3, Math.floor(x * 4)));
  }

  // von: Anfang (0 … 1), dx: Weg als Anteil der Streifenbreite
  private wische(von: number, dx: number): void {
    if (this.menue === "impulse") {
      // kurzes Wischen gilt als Tippen, sonst läuft der Flash vom Rand in Wischrichtung durch
      if (Math.abs(dx) < 0.05) this.tippeStreifen(von);
      else this.steuerung.tippeImpuls(dx > 0 ? 0 : 1);
      return;
    }
    if (Math.abs(dx) < 0.05) return;
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
          const seite = this.menue === "impulse" ? `Streifen: ${IMPULS_NAME[this.steuerung.impuls.art]}` : `${this.reglerSeite + 1}/${REGLER_SEITEN.length}`;
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
    const { parameter, uebernahme, presets, letztesPreset } = this.steuerung;
    const haelt = this.halten?.taste === taste && !this.halten.ausgeloest ? "halten …" : undefined;
    if (this.menue === "haupt") {
      switch (taste) {
        case HAUPT.pattern: return { titel: "Pattern ›", unter: MODUS_NAME[parameter.modus] };
        case HAUPT.presets: {
          const p = letztesPreset === null ? null : presets[letztesPreset];
          return { titel: "Presets ›", unter: p?.name };
        }
        case HAUPT.regler: return { titel: `Regler ${this.reglerSeite + 1}/${REGLER_SEITEN.length}`, unter: "umschalten" };
        case HAUPT.elemente: return { titel: "Elemente", unter: STUFEN.elementFolge.text[parameter.elementFolge] };
        case HAUPT.impulse: return { titel: "Impulse ›", unter: IMPULS_NAME[this.steuerung.impuls.art] };
        case HAUPT.ordnung: return { titel: "Ordnung", unter: STUFEN.ordnung.text[parameter.ordnung] };
        case HAUPT.pause: return parameter.laeuft ? { titel: "Pause" } : { titel: "Weiter", rahmen: FARBE.akzent };
        case HAUPT.output:
          switch (uebernahme.zustand) {
            case "an": return { titel: "OUTPUT", unter: haelt ?? "aktiv", grund: FARBE.live };
            case "blendetEin":
            case "blendetAus":
              return { titel: `${Math.round(uebernahme.anteil * 100)} %`, unter: "Output blendet", grund: FARBE.blenden };
            default: return { titel: "Output", unter: haelt ?? "aus · halten", grund: FARBE.feld };
          }
        default: return { titel: "" };
      }
    }
    if (taste === TASTE_ZURUECK) return { titel: "‹ Zurück" };
    if (this.menue === "impulse") {
      const art = IMPULS_ARTEN_TASTEN[taste];
      if (art) {
        // gewählte Art hell, laufende mit Rahmen
        const gewaehlt = this.steuerung.impuls.art === art;
        const laeuft = this.steuerung.impulse().some((i) => i.art === art);
        return {
          titel: IMPULS_NAME[art],
          grund: gewaehlt ? FARBE.akzent : undefined,
          rahmen: !gewaehlt && laeuft ? FARBE.akzent : undefined,
        };
      }
      if (taste === TASTE_ELEMENT_FOLGE) return { titel: "Elemente", unter: ELEMENT_FOLGE_NAME[this.steuerung.impuls.elementFolge] };
      if (taste === TASTE_IMPULS_REGLER) return { titel: `Regler ${this.impulsReglerSeite + 1}/${IMPULS_REGLER_SEITEN.length}`, unter: "umschalten" };
      return { titel: "" };
    }
    const anzahl = this.menue === "pattern" ? MODI.length : PRESET_ANZAHL;
    if (taste === TASTE_SEITE) {
      return { titel: "Seite ›", unter: `${this.seite + 1}/${seitenAnzahl(anzahl)}` };
    }
    const i = eintragAuf(this.seite, taste, anzahl);
    if (i === undefined) return { titel: "" };
    if (this.menue === "pattern") {
      return { titel: MODUS_NAME[MODI[i]!], rahmen: parameter.modus === MODI[i] ? FARBE.akzent : undefined };
    }
    const p = presets[i];
    const gespeichert = this.gespeichert?.nr === i && Date.now() < this.gespeichert.bis;
    if (!p) return { titel: String(i + 1), unter: gespeichert ? "gespeichert" : haelt ?? "leer · halten", leise: true };
    return {
      titel: p.name,
      unter: gespeichert ? "gespeichert" : haelt ?? String(i + 1),
      rahmen: letztesPreset === i ? FARBE.akzent : undefined,
    };
  }

  private felder(): Feld[] {
    if (this.menue === "impulse") {
      const e = this.steuerung.impuls;
      const seite = IMPULS_REGLER_SEITEN[this.impulsReglerSeite] ?? [];
      // immer vier Felder, damit jedes über seinem Drehregler steht
      return [0, 1, 2, 3].map((i): Feld => {
        const name = seite[i];
        if (!name) return { titel: "", wert: "", anteil: null };
        const b = IMPULS_BEREICHE[name], w = impulsWert(e, name);
        return { titel: b.kurz, wert: zeigeImpuls(name, w), anteil: (w - b.min) / (b.max - b.min) };
      });
    }
    const p = this.steuerung.parameter;
    return (REGLER_SEITEN[this.reglerSeite] ?? []).map((r): Feld => {
      if (r.art === "zahl") {
        const b = BEREICHE[r.name];
        return { titel: b.kurz, wert: zeigeWert(r.name, p[r.name]), anteil: (p[r.name] - b.min) / (b.max - b.min) };
      }
      if (r.art === "schalter") return { titel: SCHALTER[r.name], wert: p[r.name] ? "an" : "aus", anteil: null };
      const st = STUFEN[r.name];
      return { titel: st.name, wert: (st.text as Record<string, string>)[p[r.name]] ?? "", anteil: null };
    });
  }
}
