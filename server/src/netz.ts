// Netz-Einstellungen des Pi, bedient über das Netz-Menü am Stream Deck: eigenes WLAN an/aus,
// LAN-Buchse per DHCP (mit Rückfall auf die feste IP) oder fest, feste IP.
//
// Nur aktiv, wenn pi/setup.sh es einschaltet (PARRAFRAKTOR_NETZ_CODE); der Server fragt nie,
// auf welchem System er läuft (docs/platforms.md).
//
// Der Server merkt sich nur den Wunsch (netz.json im Datenverzeichnis, überlebt den Schreibschutz).
// Anwenden tut ein kleines Hilfsprogramm als root (/usr/local/sbin/parrafraktor-netz, aus pi/network.sh),
// das der Dienst per sudo aufrufen darf – nur dieses eine, mit festem Argument. Es liest netz.json
// selbst und prüft jeden Wert; beim Hochfahren wendet derselbe Befehl den Wunsch erneut an.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { fehlerText, log } from "./log.js";
import type { Speicher } from "./speicher.js";

const ausfuehren = promisify(execFile);

export const NETZ_DATEI = "netz.json";

export type LanModus = "dhcp" | "fest";

export interface NetzWunsch {
  ap: boolean;                       // eigenes WLAN
  lan: {
    modus: LanModus;                 // dhcp: erst DHCP, ohne Antwort die feste IP
    adresse: [number, number, number, number];
    praefix: number;                 // Netzmaske als Präfix, z. B. 8 für 255.0.0.0
  };
}

export interface NetzStatus {
  kabel: boolean | null;             // null = unbekannt
  lanAdressen: string[];             // aktuelle IPv4-Adressen der LAN-Buchse mit Präfix
  apAn: boolean;
  dhcpAktiv: boolean;                // LAN läuft gerade über DHCP (sonst feste IP)
}

export const PRAEFIXE = [8, 16, 24] as const;

export const NETZ_VORGABE: Readonly<NetzWunsch> = {
  ap: true,
  lan: { modus: "fest", adresse: [2, 0, 0, 50], praefix: 8 },
};

type Roh = Record<string, unknown>;
const objekt = (x: unknown): Roh => (typeof x === "object" && x !== null ? (x as Roh) : {});
const oktett = (x: unknown, alt: number): number =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 255 ? x : alt;

// Wunsch aus Datei oder Bedienung prüfen; ungültige Teile behalten den alten Wert
export function pruefeNetz(roh: unknown, basis: NetzWunsch = NETZ_VORGABE): NetzWunsch {
  const r = objekt(roh), l = objekt(r.lan);
  const a = Array.isArray(l.adresse) && l.adresse.length === 4 ? l.adresse : [];
  const p = l.praefix;
  return {
    ap: typeof r.ap === "boolean" ? r.ap : basis.ap,
    lan: {
      modus: l.modus === "dhcp" || l.modus === "fest" ? l.modus : basis.lan.modus,
      adresse: [0, 1, 2, 3].map((i) => oktett(a[i], basis.lan.adresse[i]!)) as NetzWunsch["lan"]["adresse"],
      praefix: typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 30 ? p : basis.lan.praefix,
    },
  };
}

// Code: vier Tasten 1 … 8 (oben links 1, unten rechts 8)
export const istNetzCode = (code: string): boolean => /^[1-8]{4}$/.test(code);

export const zeigeAdresse = (w: NetzWunsch): string => `${w.lan.adresse.join(".")}/${w.lan.praefix}`;

export const gleicherWunsch = (a: NetzWunsch, b: NetzWunsch): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface Netz {
  readonly code: string;
  readonly wunsch: NetzWunsch;
  readonly status: NetzStatus;
  readonly wendetAn: boolean;
  readonly meldung: string;          // Ergebnis des letzten Anwendens, z. B. Fehler
  aktualisiere(): Promise<void>;
  setze(w: NetzWunsch): Promise<void>;
}

export interface NetzOptionen {
  code: string;
  befehl: string;                    // Hilfsprogramm, per sudo aufgerufen
  schnittstelle: string;             // LAN-Buchse, z. B. eth0
}

export class NetzPi implements Netz {
  private _wunsch: NetzWunsch;
  private _status: NetzStatus = { kabel: null, lanAdressen: [], apAn: false, dhcpAktiv: false };
  private _wendetAn = false;
  private _meldung = "";

  constructor(private readonly speicher: Speicher, private readonly o: NetzOptionen) {
    this._wunsch = pruefeNetz(speicher.lies(NETZ_DATEI));
  }

  get code(): string { return this.o.code; }
  get wunsch(): NetzWunsch { return this._wunsch; }
  get status(): NetzStatus { return this._status; }
  get wendetAn(): boolean { return this._wendetAn; }
  get meldung(): string { return this._meldung; }

  // Nur lesen, das darf der Dienst ohne root
  async aktualisiere(): Promise<void> {
    const s = this.o.schnittstelle;
    let kabel: boolean | null = null;
    try {
      kabel = readFileSync(`/sys/class/net/${s}/carrier`, "utf8").trim() === "1";
    } catch {
      // Buchse ohne Verbindung meldet hier einen Fehler statt 0
      kabel = false;
    }
    const [adressen, aktiv] = await Promise.all([
      ausfuehren("ip", ["-4", "-o", "addr", "show", "dev", s]).then((r) => r.stdout, () => ""),
      ausfuehren("nmcli", ["-t", "-f", "NAME", "connection", "show", "--active"]).then((r) => r.stdout, () => ""),
    ]);
    const namen = aktiv.split("\n").map((z) => z.trim());
    this._status = {
      kabel,
      lanAdressen: [...adressen.matchAll(/inet (\d+\.\d+\.\d+\.\d+\/\d+)/g)].map((m) => m[1]!),
      apAn: namen.includes("parrafraktor-ap"),
      dhcpAktiv: namen.includes("lichtnetz-dhcp"),
    };
  }

  async setze(w: NetzWunsch): Promise<void> {
    if (this._wendetAn) return;
    this._wunsch = pruefeNetz(w, this._wunsch);
    this.speicher.schreibeJetzt(NETZ_DATEI, this._wunsch);
    this._wendetAn = true;
    this._meldung = "";
    try {
      await ausfuehren("sudo", ["-n", this.o.befehl, "anwenden"], { timeout: 60_000 });
      this._meldung = "applied";
      log("netz", `angewendet: WLAN ${this._wunsch.ap ? "an" : "aus"}, LAN ${this._wunsch.lan.modus} ${zeigeAdresse(this._wunsch)}`);
    } catch (e) {
      const text = (e as { stderr?: string }).stderr?.trim().split("\n").pop() || fehlerText(e);
      this._meldung = `error: ${text}`;
      log("netz", `Anwenden fehlgeschlagen: ${text}`);
    } finally {
      this._wendetAn = false;
    }
    await this.aktualisiere().catch(() => {});
  }
}

// Aus der Umgebung (pi/setup.sh setzt sie im Dienst); ohne gültigen Code kein Netz-Menü
export function netzAusUmgebung(speicher: Speicher, env: NodeJS.ProcessEnv = process.env): Netz | null {
  const code = env.PARRAFRAKTOR_NETZ_CODE ?? "";
  if (!code) return null;
  if (!istNetzCode(code)) {
    log("netz", "PARRAFRAKTOR_NETZ_CODE ungültig (vier Ziffern 1–8) – Netz-Menü aus");
    return null;
  }
  return new NetzPi(speicher, {
    code,
    befehl: env.PARRAFRAKTOR_NETZ_BEFEHL || "/usr/local/sbin/parrafraktor-netz",
    schnittstelle: env.PARRAFRAKTOR_NETZ_SCHNITTSTELLE || "eth0",
  });
}
