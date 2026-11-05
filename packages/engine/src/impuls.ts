// Impulse: live gespielte Ereignisse über der Grundbewegung, wie Flash-Tasten am Lichtpult.
// Man wählt die Art und löst sie auf dem Touchstreifen aus: Tippen startet sie an dieser Stelle
// (Ursprung 0 = links … 1 = rechts), Wischen vom Rand in Wischrichtung. Danach läuft die Hüllkurve
// ab: Attack (hin), Sustain (bleiben), Release (zurück) – der Streifen kennt kein Halten.
//
//   Flash auf/zu  alle Spiegel zu einer Ziel-Stellung (Winkel aus den Einstellungen)
//   Loch          alles schließt sich bis auf ein Loch (wie die Grundbewegung Öffnung): Jedes Element
//                 öffnet einen Schlitz, die sich am Ursprung kreuzen. Gewischt fährt das Loch quer durchs Bild.
//   Iris          wie Loch, aber es wächst mit der Hüllkurve aus einem Punkt
//
// Ausbreitung: Flash: Zeit, bis der Impuls ein Element durchquert hat (0 = alle Spiegel zugleich);
// Öffnung: Zeit, die das gewischte Loch quer durchs Bild braucht (0 = die ganze Hülle lang).
// Breite (Flash): Beim Tippen wirkt der Impuls nur auf so viele Spiegel um den Startpunkt (0 = alle);
// Wischen läuft immer durch das ganze Element. Größe (Öffnung): Radius des Lochs.
// Symmetrisch: Der Impuls startet zugleich am gespiegelten Punkt, die linke Hälfte ist gespiegelt
// (wie Gegenlauf): Ziel mit umgekehrtem Vorzeichen. Öffnungen werden zu zwei Löchern.
// Element-Folge: die Elemente nacheinander, mit Element-Versatz.
// Server (Takt) und Client (Vorschau) rechnen damit gleich.
import { ELEMENTE, SPIEGEL_N, elementRang, type ElementFolge } from "./aufbau.js";
import { schlitzOffen, weich, type Stellung } from "./pattern.js";

export const IMPULS_ARTEN = ["auf", "zu", "loch", "iris"] as const;
export type ImpulsArt = (typeof IMPULS_ARTEN)[number];
export const IMPULS_NAME: Record<ImpulsArt, string> = { auf: "Flash auf", zu: "Flash zu", loch: "Loch", iris: "Iris" };
export const istImpulsArt = (x: unknown): x is ImpulsArt => (IMPULS_ARTEN as readonly unknown[]).includes(x);
export const istOeffnungArt = (art: ImpulsArt): boolean => art === "loch" || art === "iris";

export interface Huelle {
  attackS: number;    // Zeit bis zum vollen Ausschlag
  sustainS: number;   // so lange bleibt der volle Ausschlag
  releaseS: number;   // Zeit zurück
  staerke: number;    // %, wie weit zur Ziel-Stellung bzw. wie viel vom Ausschlag (100 = ganz)
}

export interface ImpulsEinstellung {
  art: ImpulsArt;            // was der Touchstreifen auslöst
  huelle: Huelle;
  elementFolge: ElementFolge;
  elementVersatzS: number;   // Zeit zwischen zwei Elementen
  ausbreitungS: number;      // Zeit, bis der Impuls ein Element durchquert hat (0 = alle Spiegel zugleich)
  breite: number;            // Flash: Spiegel um den Startpunkt beim Tippen, 0 = alle
  groesse: number;           // Loch und Iris: Radius in cm
  symmetrisch: boolean;      // zugleich vom gespiegelten Punkt aus, linke Hälfte gespiegelt
}

export const IMPULS_VORGABE: Readonly<ImpulsEinstellung> = {
  art: "auf",
  huelle: { attackS: 0.4, sustainS: 0.5, releaseS: 1.5, staerke: 100 },
  elementFolge: "zusammen",
  elementVersatzS: 0.3,
  ausbreitungS: 0,
  breite: 0,
  groesse: 30,
  symmetrisch: false,
};

// Ein laufender Impuls, Zeiten in Sekunden seit dem Start
export interface LaufenderImpuls {
  id: number;
  art: ImpulsArt;
  alterS: number;
  ursprung: number;   // 0 … 1 quer über das Element
  breite: number;     // Spiegel um den Ursprung, 0 = alle (beim Start festgehalten)
  wischt: boolean;    // gewischt: Loch und Iris fahren vom Ursprung zur anderen Seite
}

// Winkel aus den Einstellungen: Ziel der Flashs (Grad)
export interface ImpulsWinkel {
  auf: number;
  zu: number;
}

// Ausschlag der Hüllkurve 0 … 1, t: Sekunden seit dem Start (bei diesem Spiegel)
export function huellenWert(h: Huelle, t: number): number {
  if (t <= 0) return 0;
  if (t < h.attackS) return weich(t / h.attackS);
  const r = t - h.attackS - h.sustainS;
  if (r <= 0) return 1;
  return h.releaseS > 0 ? 1 - weich(r / h.releaseS) : 0;
}

export const huellenDauer = (h: Huelle): number => h.attackS + h.sustainS + h.releaseS;

// Verzögerung des Elements k (Sekunden) gemäß Element-Folge
export function elementVerzug(e: ImpulsEinstellung, k: number): number {
  return (elementRang(e.elementFolge, k) ?? 0) * e.elementVersatzS;
}

// Lage des Spiegels i (0 … 11) quer über das Element, 0 = links … 1 = rechts
const lageVon = (i: number): number => i / (SPIEGEL_N - 1);

// Startpunkte: der Ursprung, symmetrisch auch sein Spiegelbild
const urspruenge = (e: ImpulsEinstellung, u: number): number[] => (e.symmetrisch ? [u, 1 - u] : [u]);

// Abstand des Spiegels i zum nächsten Startpunkt (Anteil der Elementbreite)
const abstand = (e: ImpulsEinstellung, u: number, i: number): number =>
  Math.min(...urspruenge(e, u).map((x) => Math.abs(lageVon(i) - x)));

// Verzögerung des Spiegels i: Abstand zum Startpunkt mal Ausbreitung
export const spiegelVerzug = (e: ImpulsEinstellung, ursprung: number, i: number): number =>
  abstand(e, ursprung, i) * e.ausbreitungS;

// Wie stark der Spiegel i mitmacht (0 … 1): voll innerhalb der Breite, am Rand ein Spiegel als Übergang
export function breitenFaktor(e: ImpulsEinstellung, i: Pick<LaufenderImpuls, "ursprung" | "breite">, s: number): number {
  if (i.breite <= 0) return 1;
  const spiegel = abstand(e, i.ursprung, s) * (SPIEGEL_N - 1);
  return weich(i.breite / 2 + 0.5 - spiegel);
}

// Gespiegelte Hälfte bei Symmetrie: links wie beim Gegenlauf
const seite = (e: ImpulsEinstellung, s: number): number => (e.symmetrisch && s < SPIEGEL_N / 2 ? -1 : 1);

// ---------- Öffnungen ----------

const KANTE_M = 0.12;      // weicher Rand, damit das Loch zwischen den Spiegelreihen gleitet
const BILD_HALB_M = 0.6;   // so weit von der Mitte liegen die Enden des Streifens im Bild

// Waagrechte Lage des Lochs (Meter), t Sekunden nach dem Start beim Element. Getippt bleibt es an
// seinem Punkt, gewischt fährt es zur anderen Seite (Ausbreitung, sonst die ganze Hülle lang).
function lochLage(e: ImpulsEinstellung, i: LaufenderImpuls, t: number): number {
  let lage = i.ursprung;
  if (i.wischt) {
    const dauer = e.ausbreitungS || huellenDauer(e.huelle);
    const f = dauer > 0 ? Math.min(1, t / dauer) : 1;
    lage = i.ursprung + (1 - 2 * i.ursprung) * f;
  }
  return (lage - 0.5) * 2 * BILD_HALB_M;
}

// Wie weit Spiegel s von Element k für die Öffnung offen steht (0 … 1). Symmetrisch öffnet jedes
// Element zwei Schlitze, sie ergeben zwei Löcher an gespiegelten Stellen.
function oeffnungWert(e: ImpulsEinstellung, i: LaufenderImpuls, t: number, drehung: number, s: number): number {
  const r = (e.groesse / 100) * (i.art === "iris" ? huellenWert(e.huelle, t) : 1);
  const a = (drehung * Math.PI) / 180;
  const mitte = lochLage(e, i, t) * Math.cos(a);
  const offen = schlitzOffen(s, mitte, r, KANTE_M);
  return e.symmetrisch ? Math.max(offen, schlitzOffen(s, -mitte, r, KANTE_M)) : offen;
}

// ---------- Ablauf ----------

// Wie lange ein Impuls ab dem Start dauert, bis auch der letzte Spiegel zurück ist
export function impulsDauer(e: ImpulsEinstellung, art: ImpulsArt): number {
  const elemente = Math.max(...Array.from({ length: ELEMENTE }, (_, k) => elementVerzug(e, k)));
  // Öffnung: Die Ausbreitung ist hier die Fahrt des Lochs, sie läuft innerhalb der Hülle
  return elemente + (istOeffnungArt(art) ? 0 : e.ausbreitungS) + huellenDauer(e.huelle);
}

export const impulsFertig = (e: ImpulsEinstellung, i: Pick<LaufenderImpuls, "alterS" | "art">): boolean =>
  i.alterS >= impulsDauer(e, i.art);

// Impulse über die Stellungen legen, in der Reihenfolge des Startens (der letzte liegt oben).
// TiltRotate wird währenddessen angehalten, damit der Spiegel wirklich im Ziel steht.
// drehung: Drehung der Elemente in ihrer Ebene, Loch und Iris rechnen damit.
export function wendeImpulseAn(
  stellungen: readonly Stellung[],
  impulse: readonly LaufenderImpuls[],
  e: ImpulsEinstellung,
  winkel: ImpulsWinkel,
  drehung: readonly number[] = [0, 45, 90],
): Stellung[] {
  const aus = stellungen.map((s) => ({ ...s }));
  const staerke = e.huelle.staerke / 100;
  for (const i of impulse) {
    for (let k = 0; k < ELEMENTE; k++) {
      const tElement = i.alterS - elementVerzug(e, k);
      if (tElement <= 0) continue;
      for (let s = 0; s < SPIEGEL_N; s++) {
        const st = aus[k * SPIEGEL_N + s]!;
        if (i.art === "loch" || i.art === "iris") {
          // Alles fährt zum Bild mit dem Loch: Lochspiegel hochkant, die anderen zu
          const f = huellenWert(e.huelle, tElement) * staerke;
          if (f <= 0) continue;
          const ziel = seite(e, s) * 90 * oeffnungWert(e, i, tElement, drehung[k] ?? 0, s);
          st.tilt += (ziel - st.tilt) * f;
          st.upm *= 1 - f;
          continue;
        }
        const f = huellenWert(e.huelle, tElement - spiegelVerzug(e, i.ursprung, s)) * staerke * breitenFaktor(e, i, s);
        if (f <= 0) continue;
        st.tilt += (seite(e, s) * winkel[i.art] - st.tilt) * f;
        st.upm *= 1 - f;
      }
    }
  }
  return aus;
}
