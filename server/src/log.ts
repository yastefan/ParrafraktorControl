// Einfaches Log mit Uhrzeit und Modulname
export function log(modul: string, ...text: unknown[]): void {
  const zeit = new Date().toLocaleTimeString("de-DE", { hour12: false });
  console.log(`${zeit} [${modul}]`, ...text);
}

export function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
