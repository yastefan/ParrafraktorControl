// Saves settings, presets and the last parameters as JSON in the data directory.
//
// Built for the power going away at any moment (Pi in an exhibition):
// - writes are delayed, into `<name>.tmp` with fsync, then renamed into place;
//   then fsync on the directory, so the rename is on the card too.
// - before that the previous readable file becomes `<name>.bak`. If the main file is empty,
//   broken or missing when reading, the backup applies. Only if both are missing do the
//   defaults apply – so after a power cut the presets are never silently gone.
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { join } from "node:path";
import { errorText, log } from "./log.js";

export class Store {
  private pending = new Map<string, { timer: NodeJS.Timeout; content: unknown }>();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  read(name: string): unknown {
    const target = join(this.dir, name);
    const main = readJson(target);
    if (main.ok) return main.value;
    const backup = readJson(`${target}.bak`);
    if (main.error !== "missing") log("store", `${name} unreadable (${main.error})`);
    if (backup.ok) {
      log("store", `${name}: backup ${name}.bak used`);
      return backup.value;
    }
    if (main.error !== "missing" || backup.error !== "missing") log("store", `${name}: no readable backup, defaults apply`);
    return undefined;
  }

  writeLater(name: string, content: unknown, delayMs = 500): void {
    clearTimeout(this.pending.get(name)?.timer);
    const timer = setTimeout(() => this.write(name, content), delayMs);
    this.pending.set(name, { timer, content });
  }

  // Write what is pending right away (on shutdown)
  flush(): void {
    for (const [name, { content }] of this.pending) this.write(name, content);
  }

  // Write right away, e.g. before another program reads the file
  writeNow(name: string, content: unknown): void {
    this.write(name, content);
  }

  private write(name: string, content: unknown): void {
    clearTimeout(this.pending.get(name)?.timer);
    this.pending.delete(name);
    const target = join(this.dir, name);
    try {
      writeSynced(`${target}.tmp`, JSON.stringify(content, null, 2) + "\n");
      // Only a readable file becomes the backup – otherwise a broken one would overwrite the good one
      if (readJson(target).ok) renameSync(target, `${target}.bak`);
      renameSync(`${target}.tmp`, target);
      syncDir(this.dir);
    } catch (e) {
      log("store", `${name} not saved: ${errorText(e)}`);
    }
  }
}

type ReadResult = { ok: true; value: unknown } | { ok: false; error: string };

function readJson(path: string): ReadResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return { ok: false, error: (e as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : errorText(e) };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: text.trim() ? errorText(e) : "empty" };
  }
}

function writeSynced(path: string, text: string): void {
  const fd = openSync(path, "w");
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

// On Windows a directory cannot be opened – the rename is enough there
function syncDir(dir: string): void {
  let fd: number;
  try {
    fd = openSync(dir, "r");
  } catch {
    return;
  }
  try {
    fsyncSync(fd);
  } catch {
    // some file systems do not know fsync on directories
  } finally {
    closeSync(fd);
  }
}
