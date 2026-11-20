// Simple log with time and module name
export function log(module: string, ...text: unknown[]): void {
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  console.log(`${time} [${module}]`, ...text);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
