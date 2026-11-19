// Speichert Einstellungen, Presets und die zuletzt eingestellten Parameter als JSON im Datenverzeichnis.
//
// Ausgelegt darauf, dass jederzeit der Strom weg sein kann (Pi in der Ausstellung):
// - geschrieben wird verzögert in `<name>.tmp`, mit fsync, dann per rename an die Stelle;
//   danach fsync aufs Verzeichnis, damit auch der rename auf der Karte steht.
// - vorher wird die bisherige, lesbare Datei zu `<name>.bak`. Ist die Hauptdatei beim
//   Lesen leer, kaputt oder fehlt sie, gilt die Sicherung. Erst wenn beide fehlen, gelten
//   die Vorgaben – so sind nach einem Stromausfall nie stillschweigend alle Presets weg.
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { join } from "node:path";
import { fehlerText, log } from "./log.js";

export class Speicher {
  private wartend = new Map<string, { timer: NodeJS.Timeout; inhalt: unknown }>();

  constructor(private readonly verzeichnis: string) {
    mkdirSync(verzeichnis, { recursive: true });
  }

  lies(name: string): unknown {
    const ziel = join(this.verzeichnis, name);
    const haupt = leseJson(ziel);
    if (haupt.ok) return haupt.wert;
    const sicherung = leseJson(`${ziel}.bak`);
    if (haupt.fehler !== "fehlt") log("speicher", `${name} unlesbar (${haupt.fehler})`);
    if (sicherung.ok) {
      log("speicher", `${name}: Sicherung ${name}.bak verwendet`);
      return sicherung.wert;
    }
    if (haupt.fehler !== "fehlt" || sicherung.fehler !== "fehlt") log("speicher", `${name}: keine lesbare Sicherung, Vorgaben gelten`);
    return undefined;
  }

  schreibeSpaeter(name: string, inhalt: unknown, verzoegerungMs = 500): void {
    clearTimeout(this.wartend.get(name)?.timer);
    const timer = setTimeout(() => this.schreibe(name, inhalt), verzoegerungMs);
    this.wartend.set(name, { timer, inhalt });
  }

  // Ausstehendes sofort schreiben (beim Beenden)
  leere(): void {
    for (const [name, { inhalt }] of this.wartend) this.schreibe(name, inhalt);
  }

  private schreibe(name: string, inhalt: unknown): void {
    clearTimeout(this.wartend.get(name)?.timer);
    this.wartend.delete(name);
    const ziel = join(this.verzeichnis, name);
    try {
      schreibeSynchron(`${ziel}.tmp`, JSON.stringify(inhalt, null, 2) + "\n");
      // Nur eine lesbare Datei wird zur Sicherung – sonst überschriebe eine kaputte die gute
      if (leseJson(ziel).ok) renameSync(ziel, `${ziel}.bak`);
      renameSync(`${ziel}.tmp`, ziel);
      syncVerzeichnis(this.verzeichnis);
    } catch (e) {
      log("speicher", `${name} nicht gespeichert: ${fehlerText(e)}`);
    }
  }
}

type Gelesen = { ok: true; wert: unknown } | { ok: false; fehler: string };

function leseJson(pfad: string): Gelesen {
  let text: string;
  try {
    text = readFileSync(pfad, "utf8");
  } catch (e) {
    return { ok: false, fehler: (e as NodeJS.ErrnoException).code === "ENOENT" ? "fehlt" : fehlerText(e) };
  }
  try {
    return { ok: true, wert: JSON.parse(text) };
  } catch (e) {
    return { ok: false, fehler: text.trim() ? fehlerText(e) : "leer" };
  }
}

function schreibeSynchron(pfad: string, text: string): void {
  const fd = openSync(pfad, "w");
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

// Unter Windows lässt sich ein Verzeichnis nicht öffnen – dort reicht das rename
function syncVerzeichnis(verzeichnis: string): void {
  let fd: number;
  try {
    fd = openSync(verzeichnis, "r");
  } catch {
    return;
  }
  try {
    fsyncSync(fd);
  } catch {
    // manche Dateisysteme kennen fsync auf Verzeichnisse nicht
  } finally {
    closeSync(fd);
  }
}
