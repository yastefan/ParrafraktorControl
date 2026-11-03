// Zustand des Clients: der letzte Stand vom Server plus lokale Änderungen, die noch unterwegs sind.
//
// Ein Regler soll beim Ziehen nicht springen, wenn ein älterer Stand vom Server ankommt.
// Deshalb gilt eine lokale Änderung so lange, bis der Server sie bestätigt oder sie 1 s alt ist.
import { useEffect, useState } from "preact/hooks";
import type { Parameter } from "@parrafraktor/engine";
import type { ClientNachricht, ServerNachricht, Stand } from "@parrafraktor/protokoll";
import { Verbindung, type VerbindungsZustand } from "./verbindung.js";

const LOKAL_MS = 1000;

type Lokal = { [K in keyof Parameter]?: { wert: Parameter[K]; zeit: number } };

class Laden {
  stand: Stand | null = null;
  verbindung: VerbindungsZustand = "verbinde";
  updateBereit: (() => void) | null = null;
  private lokal: Lokal = {};
  private hoerer = new Set<() => void>();
  private ausstehend: Partial<Parameter> | null = null;
  private readonly ws = new Verbindung(
    (n) => this.empfange(n),
    (z) => { this.verbindung = z; this.melde(); },
  );

  starte(): void {
    this.ws.starte();
  }

  // Parameter mit lokalen, noch nicht bestätigten Änderungen
  get parameter(): Parameter | null {
    if (!this.stand) return null;
    const p = { ...this.stand.parameter } as Record<string, unknown>;
    for (const [k, v] of Object.entries(this.lokal)) if (v) p[k] = v.wert;
    return p as unknown as Parameter;
  }

  get bedienbar(): boolean {
    return this.verbindung === "verbunden" && this.stand !== null;
  }

  // Parameter ändern. Gesendet wird höchstens alle 16 ms. Bewusst setTimeout statt
  // requestAnimationFrame: das pausiert, solange die Seite nicht sichtbar ist.
  setze(teil: Partial<Parameter>): void {
    if (!this.bedienbar) return;
    const zeit = Date.now();
    for (const [k, wert] of Object.entries(teil)) (this.lokal as Record<string, unknown>)[k] = { wert, zeit };
    const erstes = this.ausstehend === null;
    this.ausstehend = { ...this.ausstehend, ...teil };
    if (erstes) {
      window.setTimeout(() => {
        const p = this.ausstehend;
        this.ausstehend = null;
        if (p) this.ws.sende({ typ: "setze", parameter: p });
      }, 16);
    }
    this.melde();
  }

  sende(n: ClientNachricht): void {
    if (this.bedienbar) this.ws.sende(n);
  }

  zeigeUpdate(aktualisieren: () => void): void {
    this.updateBereit = aktualisieren;
    this.melde();
  }

  abonniere(f: () => void): () => void {
    this.hoerer.add(f);
    return () => this.hoerer.delete(f);
  }

  private empfange(n: ServerNachricht): void {
    if (n.typ !== "stand") return;
    this.stand = n;
    // Bestätigte oder zu alte lokale Werte verwerfen
    const jetzt = Date.now();
    for (const [k, v] of Object.entries(this.lokal) as [keyof Parameter, { wert: unknown; zeit: number }][]) {
      if (n.parameter[k] === v.wert || jetzt - v.zeit > LOKAL_MS) delete this.lokal[k];
    }
    this.melde();
  }

  private melde(): void {
    for (const f of this.hoerer) f();
  }
}

export const laden = new Laden();

// Komponente neu zeichnen, wenn sich etwas ändert
export function useLaden(): Laden {
  const [, setZaehler] = useState(0);
  useEffect(() => laden.abonniere(() => setZaehler((z) => z + 1)), []);
  return laden;
}
