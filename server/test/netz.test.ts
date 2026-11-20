import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARAMETER_DEFAULTS } from "@parrafraktor/engine";
import { EINSTELLUNGEN_VORGABE, pruefePresets } from "@parrafraktor/protokoll";
import { HALTEN_MS, HAUPT, NETZ_TASTEN, CODE_WARTEN_MS } from "../src/eingabe/streamdeck/belegung.js";
import { StreamDeckModul } from "../src/eingabe/streamdeck/index.js";
import { NETZ_VORGABE, istNetzCode, netzAusUmgebung, pruefeNetz, type Netz, type NetzStatus, type NetzWunsch } from "../src/netz.js";
import { Steuerung } from "../src/steuerung.js";

vi.mock("../src/log.js", () => ({ log: () => {}, fehlerText: (e: unknown) => String(e) }));

describe("Netz-Wunsch", () => {
  it("prüft Datei und Bedienung, Ungültiges behält den alten Wert", () => {
    expect(pruefeNetz(undefined)).toEqual(NETZ_VORGABE);
    expect(pruefeNetz({ ap: false, lan: { modus: "dhcp", adresse: [10, 0, 0, 7], praefix: 16 } }))
      .toEqual({ ap: false, lan: { modus: "dhcp", adresse: [10, 0, 0, 7], praefix: 16 } });
    expect(pruefeNetz({ ap: "nein", lan: { modus: "x", adresse: [300, -1, 1.5, "2"], praefix: 33 } })).toEqual(NETZ_VORGABE);
    expect(pruefeNetz({ lan: { adresse: [1, 2, 3] } }).lan.adresse).toEqual(NETZ_VORGABE.lan.adresse);
  });

  it("Code: vier Tasten 1–8", () => {
    expect(istNetzCode("2468")).toBe(true);
    expect(istNetzCode("1290")).toBe(false);
    expect(istNetzCode("131")).toBe(false);
    expect(istNetzCode("24682")).toBe(false);
  });

  it("ohne gültigen Code kein Netz-Menü", () => {
    const speicher = { lies: () => undefined, schreibeJetzt: () => {} } as never;
    expect(netzAusUmgebung(speicher, {})).toBeNull();
    expect(netzAusUmgebung(speicher, { PARRAFRAKTOR_NETZ_CODE: "1290" })).toBeNull();
    expect(netzAusUmgebung(speicher, { PARRAFRAKTOR_NETZ_CODE: "2468" })?.code).toBe("2468");
  });
});

class NetzAttrappe implements Netz {
  code = "2468";
  wunsch: NetzWunsch = structuredClone(NETZ_VORGABE) as NetzWunsch;
  status: NetzStatus = { kabel: true, lanAdressen: ["2.0.0.50/8"], apAn: true, dhcpAktiv: false };
  wendetAn = false;
  meldung = "";
  gesetzt: NetzWunsch[] = [];
  async aktualisiere(): Promise<void> {}
  async setze(w: NetzWunsch): Promise<void> {
    this.gesetzt.push(w);
    this.wunsch = w;
    this.meldung = "applied";
  }
}

interface DeckIntern {
  menue: string;
  tasteRunter(t: number): void;
  tasteHoch(t: number): void;
  drehe(i: number, schritte: number): void;
  tastenInhalt(t: number): { titel: string; unter?: string };
  felder(): { titel: string; wert: string }[];
  schliesse(): Promise<void>;
}

describe("Netz-Menü am Stream Deck", () => {
  let s: Steuerung, netz: NetzAttrappe, deck: DeckIntern;
  beforeEach(() => {
    vi.useFakeTimers();
    s = new Steuerung({ ...PARAMETER_DEFAULTS }, structuredClone(EINSTELLUNGEN_VORGABE), pruefePresets([]));
    netz = new NetzAttrappe();
    deck = new StreamDeckModul(s, netz) as unknown as DeckIntern;
  });
  afterEach(async () => {
    await deck.schliesse();
    vi.useRealTimers();
  });

  const kombi = () => {
    deck.tasteRunter(HAUPT.output);
    vi.advanceTimersByTime(300);
    deck.tasteRunter(HAUPT.ordnung);
  };
  const tippe = (...tasten: number[]) => tasten.forEach((t) => { deck.tasteRunter(t); deck.tasteHoch(t); });

  it("Output halten, Order dazu, 2 s: Code-Eingabe, ohne Output oder Order zu schalten", () => {
    const ordnung = s.parameter.ordnung;
    kombi();
    vi.advanceTimersByTime(HALTEN_MS.netz - 1);
    expect(deck.menue).toBe("haupt");
    vi.advanceTimersByTime(1);
    expect(deck.menue).toBe("code");
    deck.tasteHoch(HAUPT.ordnung);
    deck.tasteHoch(HAUPT.output);
    expect(s.uebernahme.soll).toBe(false);
    expect(s.parameter.ordnung).toBe(ordnung);
  });

  it("zu früh losgelassen: nichts passiert", () => {
    kombi();
    vi.advanceTimersByTime(1000);
    deck.tasteHoch(HAUPT.ordnung);
    vi.advanceTimersByTime(HALTEN_MS.netz);
    expect(deck.menue).toBe("haupt");
    expect(s.uebernahme.soll).toBe(false);
  });

  it("Output allein halten schaltet weiter wie bisher", () => {
    deck.tasteRunter(HAUPT.output);
    vi.advanceTimersByTime(HALTEN_MS.output);
    deck.tasteHoch(HAUPT.output);
    expect(s.uebernahme.soll).toBe(true);
  });

  it("richtiger Code öffnet das Menü, falscher führt zurück", () => {
    kombi();
    vi.advanceTimersByTime(HALTEN_MS.netz);
    tippe(1, 3, 5, 7);   // 2 4 6 8
    expect(deck.menue).toBe("netz");

    deck.tasteRunter(NETZ_TASTEN.zurueck);
    kombi();
    vi.advanceTimersByTime(HALTEN_MS.netz);
    tippe(1, 3, 5);
    expect(deck.felder().map((f) => f.wert)).toEqual(["●", "●", "●", "○"]);
    tippe(0);
    expect(deck.menue).toBe("haupt");
  });

  it("Code-Eingabe ohne Tasten läuft ab", () => {
    kombi();
    vi.advanceTimersByTime(HALTEN_MS.netz);
    tippe(0);
    vi.advanceTimersByTime(CODE_WARTEN_MS);
    expect(deck.menue).toBe("haupt");
  });

  it("Entwurf mit Tasten und Reglern, erst Apply wendet an", async () => {
    kombi();
    vi.advanceTimersByTime(HALTEN_MS.netz);
    tippe(1, 3, 5, 7);
    tippe(NETZ_TASTEN.wlan, NETZ_TASTEN.lan, NETZ_TASTEN.praefix);
    deck.drehe(3, 5);                 // 2.0.0.55
    deck.drehe(0, 8);                 // 10.0.0.55
    expect(netz.gesetzt).toEqual([]);
    expect(deck.tastenInhalt(NETZ_TASTEN.uebernehmen).unter).toBe("changes");
    expect(deck.felder().map((f) => f.wert)).toEqual(["10", "0", "0", "55"]);
    tippe(NETZ_TASTEN.uebernehmen);
    await vi.runOnlyPendingTimersAsync();
    expect(netz.gesetzt).toEqual([{ ap: false, lan: { modus: "dhcp", adresse: [10, 0, 0, 55], praefix: 16 } }]);
    expect(deck.tastenInhalt(NETZ_TASTEN.uebernehmen).unter).toBe("applied");
  });

  it("Reset verwirft den Entwurf, Regler bleiben in 0 … 255", () => {
    kombi();
    vi.advanceTimersByTime(HALTEN_MS.netz);
    tippe(1, 3, 5, 7);
    deck.drehe(1, -3);
    deck.drehe(2, 300);
    expect(deck.felder().map((f) => f.wert)).toEqual(["2", "0", "255", "50"]);
    tippe(NETZ_TASTEN.verwerfen);
    expect(deck.felder().map((f) => f.wert)).toEqual(["2", "0", "0", "50"]);
  });

  it("ohne Netz (Mac, Windows) gibt es die Kombination nicht", () => {
    const ohne = new StreamDeckModul(s) as unknown as DeckIntern;
    const ordnung = s.parameter.ordnung;
    ohne.tasteRunter(HAUPT.output);
    ohne.tasteRunter(HAUPT.ordnung);
    vi.advanceTimersByTime(HALTEN_MS.netz);
    expect(ohne.menue).toBe("haupt");
    expect(s.parameter.ordnung).not.toBe(ordnung);   // Order schaltet wie immer
  });
});
