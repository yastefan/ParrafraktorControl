import type { Einstellungen } from "@parrafraktor/protokoll";
import type { Ausgabe } from "./ausgabe.js";
import { ArtnetAusgabe } from "./artnet.js";
import { Rs485Ausgabe } from "./rs485.js";
import { SacnAusgabe } from "./sacn.js";

export type { Ausgabe } from "./ausgabe.js";

// Alle eingeschalteten Ausgaben anlegen. Mehrere gleichzeitig sind möglich.
export function erstelleAusgaben(e: Einstellungen): Ausgabe[] {
  const ausgaben: Ausgabe[] = [];
  if (e.artnet.an) ausgaben.push(new ArtnetAusgabe(e.artnet));
  if (e.sacn.an) ausgaben.push(new SacnAusgabe(e.sacn));
  if (e.rs485.an) ausgaben.push(new Rs485Ausgabe(e.rs485));
  return ausgaben;
}
