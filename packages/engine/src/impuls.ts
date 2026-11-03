// Impulse: live gespielte Ereignisse über der Grundbewegung, wie Flash-Tasten am Lichtpult.
// Drücken = Attack (hinfahren), Halten = Hold (bleiben), Loslassen = Release (zurück).
// Ein Flash fährt alle Spiegel zu einer Ziel-Stellung ("auf" oder "zu", Winkel aus den Einstellungen).
// Mit Element-Folge gehen die Elemente nacheinander auf und in derselben Folge wieder zurück.
// Server (Takt) und Client (Vorschau) rechnen damit gleich.
import { ELEMENTE, SPIEGEL_N } from "./aufbau.js";
import { weich, type Stellung } from "./pattern.js";

export const IMPULS_ZIELE = ["auf", "zu"] as const;
export type ImpulsZiel = (typeof IMPULS_ZIELE)[number];
export const IMPULS_NAME: Record<ImpulsZiel, string> = { auf: "Flash auf", zu: "Flash zu" };
export const istImpulsZiel = (x: unknown): x is ImpulsZiel => (IMPULS_ZIELE as readonly unknown[]).includes(x);

// Reihenfolge der Elemente (Element 1 = vorn)
export const ELEMENT_FOLGEN = ["zusammen", "vorneHinten", "hintenVorne"] as const;
export type ElementFolge = (typeof ELEMENT_FOLGEN)[number];
export const ELEMENT_FOLGE_NAME: Record<ElementFolge, string> = {
  zusammen: "zusammen",
  vorneHinten: "vorn → hinten",
  hintenVorne: "hinten → vorn",
};

export interface Huelle {
  attackS: number;    // Zeit bis zum vollen Ausschlag
  releaseS: number;   // Zeit zurück nach dem Loslassen
  staerke: number;    // %, wie weit zur Ziel-Stellung (100 = ganz)
}

export interface ImpulsEinstellung {
  huelle: Huelle;
  elementFolge: ElementFolge;
  elementVersatzS: number;   // Zeit zwischen zwei Elementen
}

export const IMPULS_VORGABE: Readonly<ImpulsEinstellung> = {
  huelle: { attackS: 0.4, releaseS: 1.5, staerke: 100 },
  elementFolge: "zusammen",
  elementVersatzS: 0.3,
};

// Ein laufender Impuls, Zeiten in Sekunden seit dem Drücken
export interface LaufenderImpuls {
  id: number;
  ziel: ImpulsZiel;
  alterS: number;            // seit dem Drücken
  losS: number | null;       // losgelassen nach so vielen Sekunden, null = wird gehalten
}

// Ziel-Winkel (Tilt in Grad) der Flashes
export type FlashZiele = Record<ImpulsZiel, number>;

// Ausschlag der Hüllkurve 0 … 1. t: Sekunden seit dem Start (bei diesem Element),
// los: Haltezeit oder null. Wird schon während des Attack losgelassen, fährt der Spiegel
// von dort zurück.
export function huellenWert(h: Huelle, t: number, los: number | null): number {
  if (t <= 0) return 0;
  const hin = (x: number) => (h.attackS > 0 ? weich(x / h.attackS) : 1);
  if (los === null || t < los) return hin(t);
  const zurueck = h.releaseS > 0 ? 1 - weich((t - los) / h.releaseS) : 0;
  return hin(los) * zurueck;
}

// Verzögerung des Elements k (Sekunden) gemäß Element-Folge
export function elementVerzug(e: ImpulsEinstellung, k: number): number {
  switch (e.elementFolge) {
    case "vorneHinten": return k * e.elementVersatzS;
    case "hintenVorne": return (ELEMENTE - 1 - k) * e.elementVersatzS;
    default: return 0;
  }
}

// Ist der Impuls vorbei (losgelassen und auch das letzte Element zurück)?
export function impulsFertig(e: ImpulsEinstellung, i: Pick<LaufenderImpuls, "alterS" | "losS">): boolean {
  if (i.losS === null) return false;
  const letzter = Math.max(...Array.from({ length: ELEMENTE }, (_, k) => elementVerzug(e, k)));
  return i.alterS >= Math.max(i.losS, 0) + letzter + e.huelle.releaseS;
}

// Impulse über die Stellungen legen, in der Reihenfolge des Drückens (der letzte liegt oben).
// TiltRotate wird während eines Flashs angehalten, damit der Spiegel wirklich im Ziel steht.
export function wendeImpulseAn(
  stellungen: readonly Stellung[],
  impulse: readonly LaufenderImpuls[],
  e: ImpulsEinstellung,
  ziele: FlashZiele,
): Stellung[] {
  const aus = stellungen.map((s) => ({ ...s }));
  const staerke = e.huelle.staerke / 100;
  for (const i of impulse) {
    const ziel = ziele[i.ziel];
    for (let k = 0; k < ELEMENTE; k++) {
      // Release in derselben Folge wie Attack: jedes Element hält gleich lang
      const f = huellenWert(e.huelle, i.alterS - elementVerzug(e, k), i.losS) * staerke;
      if (f <= 0) continue;
      for (let s = k * SPIEGEL_N; s < (k + 1) * SPIEGEL_N; s++) {
        const st = aus[s]!;
        st.tilt += (ziel - st.tilt) * f;
        st.upm *= 1 - f;
      }
    }
  }
  return aus;
}
