// ParrafraktorControl – Server.
// Rechnet die Pattern, sendet die Spiegelstellungen (Art-Net/sACN, später RS485), bindet die
// Bedienungen am Rechner an (Stream Deck+, später MIDI/OSC) und liefert den PWA-Client aus.
//
// Umgebungsvariablen:
//   PORT                 HTTP(S)-Port, Vorgabe 8080
//   PARRAFRAKTOR_DATEN   Datenverzeichnis für Einstellungen, Vorgabe ./daten
//   TLS_CERT, TLS_KEY    Zertifikat und Schlüssel (PEM) für HTTPS – nötig für den Offline-Cache auf dem iPad
//   STREAMDECK=aus       Stream Deck nicht ansprechen
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KANAELE_PRO_ELEMENT } from "@parrafraktor/engine";
import {
  PROTOKOLL_VERSION, patchWarnung, pruefeEinstellungen,
  type Einstellungen, type ModulStatus, type Netzwerkschnittstelle, type Stand,
} from "@parrafraktor/protokoll";
import { erstelleAusgaben, type Ausgabe } from "./ausgabe/index.js";
import type { Eingabemodul } from "./eingabe/eingabe.js";
import { StreamDeckModul } from "./eingabe/streamdeck/index.js";
import { fehlerText, log } from "./log.js";
import { Mitlesen } from "./mitlesen.js";
import { Speicher } from "./speicher.js";
import { Steuerung, parameterAus } from "./steuerung.js";
import { Takt } from "./takt.js";
import { WebServer } from "./web/server.js";

const port = Number(process.env.PORT ?? 8080);
const datenVerzeichnis = resolve(process.env.PARRAFRAKTOR_DATEN ?? "daten");
// server/src oder server/dist → client/dist
const clientVerzeichnis = fileURLToPath(new URL("../../client/dist", import.meta.url));
const tls = process.env.TLS_CERT && process.env.TLS_KEY ? { cert: process.env.TLS_CERT, key: process.env.TLS_KEY } : undefined;

const speicher = new Speicher(datenVerzeichnis);
const steuerung = new Steuerung(
  parameterAus(speicher.lies("parameter.json")),
  pruefeEinstellungen(speicher.lies("einstellungen.json")),
);

// ---------- Ausgaben und Mitlesen: bei jeder Änderung der Einstellungen neu ----------

let ausgaben: Ausgabe[] = [];
let mitlesen: Mitlesen | null = null;
let neustart = Promise.resolve();

function starteAusgaben(e: Einstellungen): void {
  neustart = neustart.then(async () => {
    const alt = ausgaben, altMitlesen = mitlesen;
    ausgaben = [];
    mitlesen = null;
    // Alte zuerst schließen: gibt bei sACN den Stream frei, die neuen übernehmen im nächsten Takt
    await Promise.all(alt.map((a) => a.schliesse().catch(() => {})));
    await altMitlesen?.schliesse().catch(() => {});
    try {
      ausgaben = erstelleAusgaben(e);
      mitlesen = new Mitlesen(e);
    } catch (err) {
      log("ausgabe", fehlerText(err));
    }
    log("ausgabe", ausgaben.length ? ausgaben.map((a) => a.name).join(", ") : "keine Ausgabe aktiv");
    steuerung.geaendert();
  });
}

const takt = new Takt(steuerung, { ausgaben: () => ausgaben, mitlesen: () => mitlesen });

// ---------- Bedienungen am Rechner ----------

const eingaben: Eingabemodul[] = [];
if (process.env.STREAMDECK !== "aus") eingaben.push(new StreamDeckModul(steuerung));
// Weitere Module (MIDI, OSC) hier eintragen, siehe eingabe/midi.ts und eingabe/osc.ts

// ---------- Stand für die Clients ----------

const netzwerk = (): Netzwerkschnittstelle[] =>
  Object.entries(networkInterfaces()).flatMap(([name, liste]) =>
    (liste ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, adresse: a.address })),
  );

let web: WebServer;

function stand(): Stand {
  const e = steuerung.einstellungen;
  const module: ModulStatus[] = [
    ...ausgaben.map((a) => a.status()),
    ...(mitlesen ? [mitlesen.status()] : []),
    ...eingaben.map((m) => m.status()),
    { name: "Clients", art: "eingabe", zustand: web?.anzahlClients ? "aktiv" : "bereit", text: `${web?.anzahlClients ?? 0} verbunden` },
  ];
  const warnungen: string[] = [];
  const patch = patchWarnung(e.patch, KANAELE_PRO_ELEMENT);
  if (patch) warnungen.push(patch);
  if (!ausgaben.length) warnungen.push("Keine Ausgabe aktiv – die Spiegel bekommen nichts.");
  if (e.artnet.an && e.sacn.an) warnungen.push("Art-Net und sACN gleichzeitig aktiv.");
  return {
    typ: "stand",
    version: PROTOKOLL_VERSION,
    rev: steuerung.rev,
    parameter: { ...steuerung.parameter },
    uebernahme: { ...steuerung.uebernahme },
    einstellungen: e,
    module,
    netzwerk: netzwerk(),
    takt: { umlaufVon: takt.engine.umlaufVon, umlauf: Array.from(takt.engine.umlauf) },
    warnungen,
  };
}

// ---------- Start ----------

steuerung.on("parameter", (p) => speicher.schreibeSpaeter("parameter.json", p, 2000));
steuerung.on("einstellungen", (e) => {
  speicher.schreibeSpaeter("einstellungen.json", e);
  starteAusgaben(e);
});

web = new WebServer({ port, clientVerzeichnis, tls }, steuerung, stand);
starteAusgaben(steuerung.einstellungen);
takt.starte();
await web.starte();
log("server", `Daten in ${datenVerzeichnis}`);
// Bedienungen im Hintergrund starten: Gerätesuche soll den Server nicht aufhalten
for (const m of eingaben) m.starte().catch((e) => log(m.name, fehlerText(e)));

let beendet = false;
async function beende(): Promise<void> {
  if (beendet) return;
  beendet = true;
  log("server", "beende …");
  takt.stoppe();
  // Spiegel an die MA zurückgeben, bevor der Prozess endet
  for (const a of ausgaben) a.gibFrei();
  await Promise.allSettled([
    ...eingaben.map((m) => m.schliesse()),
    ...ausgaben.map((a) => a.schliesse()),
    mitlesen?.schliesse(),
    web.schliesse(),
  ]);
  speicher.leere();
  process.exit(0);
}
process.on("SIGINT", () => void beende());
process.on("SIGTERM", () => void beende());
