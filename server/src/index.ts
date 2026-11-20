// ParrafraktorControl – server.
// Computes the patterns, sends the mirror positions (Art-Net/sACN, later RS485), connects the
// controls on the computer (Stream Deck+, later MIDI/OSC) and serves the PWA client.
//
// Environment variables (names stay German, they are set by pi/setup.sh):
//   PORT                 HTTP(S) port, default 8080
//   PARRAFRAKTOR_DATEN   data directory for settings, default ./daten
//   TLS_CERT, TLS_KEY    certificate and key (PEM) for HTTPS – needed for the offline cache on the iPad
//   HTTP_PORT            with HTTPS additionally unencrypted on this port (fallback for certificate trouble)
//   STREAMDECK=off       do not use the Stream Deck ("aus" works too)
//   PARRAFRAKTOR_NETZ_CODE  Pi: four-digit code (keys 1–8) for the network menu on the Stream Deck, without: no menu
//   PARRAFRAKTOR_NETZ_BEFEHL, PARRAFRAKTOR_NETZ_SCHNITTSTELLE  helper (via sudo) and LAN port
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNELS_PER_ELEMENT } from "@parrafraktor/engine";
import {
  PROTOCOL_VERSION, patchWarning, checkSettings, checkAuto, checkImpulse, checkPresets,
  type Settings, type ModuleStatus, type NetworkInterface, type State,
} from "@parrafraktor/protocol";
import { createOutputs, type Output } from "./output/index.js";
import type { InputModule } from "./input/input.js";
import { StreamDeckModule } from "./input/streamdeck/index.js";
import { errorText, log } from "./log.js";
import { MaListener } from "./ma-listener.js";
import { networkFromEnv } from "./network.js";
import { Store } from "./store.js";
import { Controller, parameterOff } from "./controller.js";
import { Ticker } from "./ticker.js";
import { WebServer } from "./web/server.js";

const port = Number(process.env.PORT ?? 8080);
const dataDir = resolve(process.env.PARRAFRAKTOR_DATEN ?? "daten");
// server/src or server/dist → client/dist
const clientDir = fileURLToPath(new URL("../../client/dist", import.meta.url));
const tls = process.env.TLS_CERT && process.env.TLS_KEY ? { cert: process.env.TLS_CERT, key: process.env.TLS_KEY } : undefined;

const store = new Store(dataDir);
const controller = new Controller(
  parameterOff(store.read("parameter.json")),
  checkSettings(store.read("einstellungen.json")),
  checkPresets(store.read("presets.json")),
  checkImpulse(store.read("impuls.json")),
  undefined,
  checkAuto(store.read("auto.json")),
);

// ---------- Outputs and MA listener: recreated on every change of the settings ----------

let outputs: Output[] = [];
let maListener: MaListener | null = null;
let restart = Promise.resolve();

function startOutputs(e: Settings): void {
  restart = restart.then(async () => {
    const old = outputs, oldListener = maListener;
    outputs = [];
    maListener = null;
    // Close the old ones first: releases the stream with sACN, the new ones take over in the next tick
    await Promise.all(old.map((o) => o.close().catch(() => {})));
    await oldListener?.close().catch(() => {});
    try {
      outputs = createOutputs(e);
      maListener = new MaListener(e);
    } catch (err) {
      log("output", errorText(err));
    }
    log("output", outputs.length ? outputs.map((o) => o.name).join(", ") : "no output active");
    controller.changed();
  });
}

const ticker = new Ticker(controller, { outputs: () => outputs, maListener: () => maListener });

// ---------- Controls on the computer ----------

const inputs: InputModule[] = [];
// Network menu on the Stream Deck only if pi/setup.sh turned it on (PARRAFRAKTOR_NETZ_CODE)
const network = networkFromEnv(store);
if (network) log("network", "network menu on the Stream Deck on");
if (process.env.STREAMDECK !== "aus" && process.env.STREAMDECK !== "off") inputs.push(new StreamDeckModule(controller, network));
// Add further modules (MIDI, OSC) here, see input/midi.ts and input/osc.ts

// ---------- State for the clients ----------
// Field names of State are the protocol and stay German.

const interfaces = (): NetworkInterface[] =>
  Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, adresse: a.address })),
  );

let web: WebServer;

function state(): State {
  const e = controller.settings;
  const module: ModuleStatus[] = [
    ...outputs.map((o) => o.status()),
    ...(maListener ? [maListener.status()] : []),
    ...inputs.map((m) => m.status()),
    { name: "Clients", art: "eingabe", zustand: web?.clientCount ? "aktiv" : "bereit", text: `${web?.clientCount ?? 0} connected` },
  ];
  const warnings: string[] = [];
  const patch = patchWarning(e.patch, CHANNELS_PER_ELEMENT);
  if (patch) warnings.push(patch);
  if (!outputs.length) warnings.push("No output active – the mirrors receive nothing.");
  if (e.artnet.an && e.sacn.an) warnings.push("Art-Net and sACN active at the same time.");
  if (e.autostart.output) warnings.push("Autostart output is on: after every restart the app drives the mirrors at once, the MA cannot take them.");
  return {
    typ: "stand",
    version: PROTOCOL_VERSION,
    rev: controller.rev,
    parameter: { ...controller.parameter },
    uebernahme: { ...controller.takeover },
    einstellungen: e,
    module,
    netzwerk: interfaces(),
    takt: {
      umlaufVon: ticker.engine.referenceCycles,
      umlauf: Array.from(ticker.engine.cycles),
      tempo: Array.from(ticker.engine.tempo),
      schub: Array.from(ticker.engine.kick),
    },
    presets: [...controller.presets],
    letztesPreset: controller.lastPreset,
    blende: controller.fade ? { ...controller.fade } : null,
    blendeDauerS: controller.fadeDurationS,
    auto: { ...controller.auto, an: controller.autoOn, restS: controller.autoRemainingS },
    impuls: controller.impulse,
    impulse: controller.impulses(),
    warnungen: warnings,
  };
}

// ---------- Start ----------

controller.on("parameter", (p) => store.writeLater("parameter.json", p, 2000));
controller.on("presets", (p) => store.writeLater("presets.json", p));
controller.on("impulse", (i) => store.writeLater("impuls.json", i));
controller.on("auto", (a) => store.writeLater("auto.json", a));
// Only restart the outputs when network or patch change. A restart briefly hands over to the MA
// with sACN – that must not happen just because someone changes the cross-fade or the preview.
const outputPart = (e: Settings) => JSON.stringify([e.artnet, e.sacn, e.rs485, e.patch]);
let lastOutput = outputPart(controller.settings);
controller.on("settings", (e) => {
  store.writeLater("einstellungen.json", e);
  const part = outputPart(e);
  if (part === lastOutput) return;
  lastOutput = part;
  startOutputs(e);
});

// npm run dev sets PARRAFRAKTOR_VITE_PORT: then this port forwards page requests to Vite
const vitePort = Number(process.env.PARRAFRAKTOR_VITE_PORT) || undefined;
const httpPort = Number(process.env.HTTP_PORT) || undefined;
web = new WebServer({ port, clientDir, tls, httpPort, vitePort }, controller, state);
if (vitePort) log("web", `development: pages on this port forward to Vite (port ${vitePort})`);
startOutputs(controller.settings);
// Autostart (running without MA) before the first tick, so it sends at once
for (const t of controller.autostart()) log("autostart", t);
ticker.start();
await web.start();
log("server", `data in ${dataDir}`);
// Start the controls in the background: searching for devices must not hold up the server
for (const m of inputs) m.start().catch((e) => log(m.name, errorText(e)));

let stopped = false;
async function shutdown(): Promise<void> {
  if (stopped) return;
  stopped = true;
  log("server", "shutting down …");
  ticker.stop();
  // Hand the mirrors back to the MA before the process ends
  for (const o of outputs) o.release();
  await Promise.allSettled([
    ...inputs.map((m) => m.close()),
    ...outputs.map((o) => o.close()),
    maListener?.close(),
    web.close(),
  ]);
  store.flush();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
