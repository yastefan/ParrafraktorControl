// Speichert Einstellungen und die zuletzt eingestellten Parameter als JSON im Datenverzeichnis.
// Geschrieben wird verzögert und über eine temporäre Datei, damit ein Stromausfall
// keine halbe Datei hinterlässt.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fehlerText, log } from "./log.js";

export class Speicher {
  private wartend = new Map<string, { timer: NodeJS.Timeout; inhalt: unknown }>();

  constructor(private readonly verzeichnis: string) {
    mkdirSync(verzeichnis, { recursive: true });
  }

  lies(name: string): unknown {
    try {
      return JSON.parse(readFileSync(join(this.verzeichnis, name), "utf8"));
    } catch {
      return undefined;   // fehlt oder kaputt: Vorgaben gelten
    }
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
      writeFileSync(`${ziel}.tmp`, JSON.stringify(inhalt, null, 2) + "\n");
      renameSync(`${ziel}.tmp`, ziel);
    } catch (e) {
      log("speicher", `${name} nicht gespeichert: ${fehlerText(e)}`);
    }
  }
}
