// Impulse: live gespielte Ereignisse über der Grundbewegung, wie Flash-Tasten am Lichtpult.
// Man wählt die Art und löst sie auf dem Touchstreifen aus: Tippen startet sie an dieser Stelle
// (Ursprung 0 = links … 1 = rechts), Wischen vom Rand in Wischrichtung. Danach läuft die Hüllkurve
// ab: Attack (hin), Sustain (bleiben), Release (zurück) – der Streifen kennt kein Halten.
//
//   Flash auf/zu  alle Spiegel zu einer Ziel-Stellung (Winkel aus den Einstellungen)
//   Stoß          ein Ruck läuft als Welle vom Ursprung durch die Reihe, wird an den Enden
//                 zurückgeworfen und schwingt aus
//   Glitzern      einzelne Spiegel zucken nach Zufall, solange die Hüllkurve offen ist
//
// Ausbreitung: Zeit, bis der Impuls ein Element durchquert hat (0 = alle Spiegel zugleich).
// Breite: Beim Tippen wirkt der Impuls nur auf so viele Spiegel um den Startpunkt (0 = alle);
// Wischen läuft immer durch das ganze Element.
// Symmetrisch: Der Impuls startet zugleich am gespiegelten Punkt, die linke Hälfte ist gespiegelt
// (wie Gegenlauf): Flash-Ziel und Ausschlag mit umgekehrtem Vorzeichen.
// Element-Folge: die Elemente nacheinander, mit Element-Versatz.
// Server (Takt) und Client (Vorschau) rechnen damit gleich.
import { ELEMENTE, SPIEGEL_N, elementRang, type ElementFolge } from "./aufbau.js";
import { gitter, weich, type Stellung } from "./pattern.js";

export const IMPULS_ARTEN = ["auf", "zu", "stoss", "glitzern"] as const;
export type ImpulsArt = (typeof IMPULS_ARTEN)[number];
export const IMPULS_NAME: Record<ImpulsArt, string> = { auf: "Flash auf", zu: "Flash zu", stoss: "Stoß", glitzern: "Glitzern" };
export const istImpulsArt = (x: unknown): x is ImpulsArt => (IMPULS_ARTEN as readonly unknown[]).includes(x);

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
  breite: number;            // Spiegel um den Startpunkt beim Tippen, 0 = alle
  symmetrisch: boolean;      // zugleich vom gespiegelten Punkt aus, linke Hälfte gespiegelt
}

export const IMPULS_VORGABE: Readonly<ImpulsEinstellung> = {
  art: "auf",
  huelle: { attackS: 0.4, sustainS: 0.5, releaseS: 1.5, staerke: 100 },
  elementFolge: "zusammen",
  elementVersatzS: 0.3,
  ausbreitungS: 0,
  breite: 0,
  symmetrisch: false,
};

// Ein laufender Impuls, Zeiten in Sekunden seit dem Start
export interface LaufenderImpuls {
  id: number;
  art: ImpulsArt;
  alterS: number;
  ursprung: number;   // 0 … 1 quer über das Element
  breite: number;     // Spiegel um den Ursprung, 0 = alle (beim Start festgehalten)
}

// Winkel aus den Einstellungen: Ziel der Flashs, Ausschlag von Stoß und Glitzern (Grad)
export interface ImpulsWinkel {
  auf: number;
  zu: number;
  ausschlag: number;
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

// ---------- Stoß ----------

const STOSS_LAUF_S = 0.8;      // ohne Ausbreitung: so lange braucht der Stoß quer über ein Element
const STOSS_REFLEXION = 0.6;   // so viel kommt an einem Ende zurück
const STOSS_ECHOS = 3;         // so oft wird höchstens zurückgeworfen

// Ein Ruck: eine weich beginnende, gedämpfte Schwingung; die Periode wächst mit dem Attack
function ruck(h: Huelle, t: number): number {
  if (t <= 0) return 0;
  const periode = Math.max(0.3, 4 * h.attackS);
  return Math.sin((2 * Math.PI * t) / periode) * weich(t / (periode / 4)) * Math.exp(-t / periode);
}

// Auslenkung an der Lage x (0 … 1), t Sekunden nach dem Stoß. Die Enden werfen zurück
// (Spiegelquellen jenseits der Enden), jedes Echo schwächer. Nach dem Sustain blendet der
// Release alles aus.
// Bei mehreren Startpunkten (symmetrisch) überlagern sich die Stöße.
export function stossWert(e: ImpulsEinstellung, x: number, urspruenge: readonly number[], t: number): number {
  const lauf = e.ausbreitungS || STOSS_LAUF_S;
  let summe = 0;
  for (const ursprung of urspruenge) {
    for (let n = -STOSS_ECHOS; n <= STOSS_ECHOS; n++) {
      // Quelle bei ursprung + 2n (gerade Zahl Echos) und −ursprung + 2n (ungerade)
      const quellen: [number, number][] = [[ursprung + 2 * n, Math.abs(2 * n)], [-ursprung + 2 * n, Math.abs(2 * n - 1)]];
      for (const [quelle, echos] of quellen) {
        if (echos > STOSS_ECHOS) continue;
        summe += STOSS_REFLEXION ** echos * ruck(e.huelle, t - Math.abs(x - quelle) * lauf);
      }
    }
  }
  // Treffen sich Stöße und Echos (Ursprung am Rand, symmetrisch), wird es weich begrenzt
  return (Math.tanh(1.6 * summe) / Math.tanh(1.6)) * huellenWert({ ...e.huelle, attackS: 0 }, t);
}

// ---------- Glitzern ----------

const GLITZER_S = 0.35;       // Dauer eines Zuckens
const GLITZER_ANTEIL = 0.3;   // so viele Zeitfenster eines Spiegels haben ein Zucken

// Zucken des Spiegels g (−1 … 1), t Sekunden seit dem Start bei diesem Spiegel. Immer gleich für
// denselben Impuls, damit Server und Vorschau dasselbe zeigen.
export function glitzerWert(id: number, g: number, t: number): number {
  if (t <= 0) return 0;
  const lauf = t / GLITZER_S + gitter(g, id * 7919);
  const nr = Math.floor(lauf);
  if (gitter(g * 31 + id, nr) > GLITZER_ANTEIL) return 0;
  const richtung = gitter(nr, g * 17 + id) < 0.5 ? -1 : 1;
  return (richtung * (1 - Math.cos(2 * Math.PI * (lauf - nr)))) / 2;
}

// ---------- Ablauf ----------

// Wie lange ein Impuls ab dem Start dauert, bis auch der letzte Spiegel zurück ist
export function impulsDauer(e: ImpulsEinstellung, art: ImpulsArt): number {
  const elemente = Math.max(...Array.from({ length: ELEMENTE }, (_, k) => elementVerzug(e, k)));
  // Stoß: die Echos laufen weiter hin und her, aber Sustain und Release blenden ihn aus
  return elemente + (art === "stoss" ? 0 : e.ausbreitungS) + huellenDauer(e.huelle);
}

export const impulsFertig = (e: ImpulsEinstellung, i: Pick<LaufenderImpuls, "alterS" | "art">): boolean =>
  i.alterS >= impulsDauer(e, i.art);

// Impulse über die Stellungen legen, in der Reihenfolge des Startens (der letzte liegt oben).
// TiltRotate wird während eines Flashs angehalten, damit der Spiegel wirklich im Ziel steht.
export function wendeImpulseAn(
  stellungen: readonly Stellung[],
  impulse: readonly LaufenderImpuls[],
  e: ImpulsEinstellung,
  winkel: ImpulsWinkel,
): Stellung[] {
  const aus = stellungen.map((s) => ({ ...s }));
  const staerke = e.huelle.staerke / 100;
  for (const i of impulse) {
    for (let k = 0; k < ELEMENTE; k++) {
      const tElement = i.alterS - elementVerzug(e, k);
      if (tElement <= 0) continue;
      for (let s = 0; s < SPIEGEL_N; s++) {
        const g = k * SPIEGEL_N + s;
        const st = aus[g]!;
        const breite = breitenFaktor(e, i, s);
        if (breite <= 0) continue;
        if (i.art === "stoss") {
          const w = stossWert(e, lageVon(s), urspruenge(e, i.ursprung), tElement);
          st.tilt += winkel.ausschlag * staerke * breite * seite(e, s) * w;
          continue;
        }
        const t = tElement - spiegelVerzug(e, i.ursprung, s);
        const f = huellenWert(e.huelle, t) * staerke * breite;
        if (f <= 0) continue;
        if (i.art === "glitzern") {
          // symmetrisch: der gespiegelte Spiegel zuckt gleich, nur umgekehrt
          const vorbild = seite(e, s) < 0 ? k * SPIEGEL_N + SPIEGEL_N - 1 - s : g;
          st.tilt += winkel.ausschlag * f * seite(e, s) * glitzerWert(i.id, vorbild, t);
        } else {
          st.tilt += (seite(e, s) * winkel[i.art] - st.tilt) * f;
          st.upm *= 1 - f;
        }
      }
    }
  }
  return aus;
}
