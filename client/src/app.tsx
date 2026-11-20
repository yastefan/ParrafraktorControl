import { useEffect, useRef, useState } from "preact/hooks";
import { appState, useAppState } from "./app-state.js";
import { SettingsPanel } from "./components/settings.js";
import { Impulses } from "./components/impulse.js";
import { Header } from "./components/header.js";
import { Patterns } from "./components/patterns.js";
import { Presets } from "./components/presets.js";
import { Motion, Distribution, hasDistribution } from "./components/controls.js";
import { Module } from "./components/module.js";
import { HAZE_LAMP_DEFAULT, HAZE_DEPTH, HAZE_ZOOM_DEFAULT, type HazeLamp, type MirrorSide } from "./haze.js";
import { LAMP_DEFAULT, Preview, ZOOM, type View, type FrontMode } from "./preview.js";

export function App() {
  const l = useAppState();
  const [settings, setSettings] = useState(false);
  const p = l.parameter;
  const live = l.state?.uebernahme.zustand !== undefined && l.state.uebernahme.zustand !== "aus";

  return (
    <div class={`app ${live ? "live" : ""}`}>
      <Header onSettings={() => setSettings(true)} />
      {!l.usable && <Hint />}
      <main class={`pult ${p && !hasDistribution(p) ? "ohne-verteilung" : ""} ${p?.modus === "oeffnung" ? "bahn" : ""}`}>
        <div class="pult-oben">
          <PreviewArea />
          <div class="pult-rechts">
            {p && <Patterns mode={p.modus} />}
            <Presets />
          </div>
        </div>
        <div class="pult-mitte">
          {p && <Motion parameter={p} />}
          {p && hasDistribution(p) && <Distribution parameter={p} />}
        </div>
        {l.state && <Impulses />}
      </main>
      {settings && l.state && <SettingsPanel state={l.state} close={() => setSettings(false)} />}
    </div>
  );
}

function Hint() {
  const l = useAppState();
  const text = l.state
    ? "No connection to the server – reconnecting …"
    : "Connecting to the server …";
  return <div class={`hinweis ${l.connection}`}>{text}</div>;
}

// View and mirror/light in the front view: only for this device, so remembered in the browser
const MODE_KEY = "parrafraktor.vorderModus";
const VIEW_KEY = "parrafraktor.ansicht";
const PHASER_ELEMENTS_KEY = "parrafraktor.phaserElemente";
const VIEW_NAME: Record<View, string> = { bild: "Simple", phaser: "Phaser", reflexion: "Reflection" };

const LAMP_KEY = "parrafraktor.lampe";
const ZOOM_KEY = "parrafraktor.zoom";
const HAZE_KEY = "parrafraktor.nebel";
const HAZE_LAMP_KEY = "parrafraktor.nebelLampeVorn";   // new name: the default is now in front of the elements
const HAZE_ZOOM_KEY = "parrafraktor.nebelZoom";
const HAZE_SIDE_KEY = "parrafraktor.nebelSeiteVorn";
const SIDE_NAME: Record<MirrorSide, string> = { hinten: "Back", vorn: "Front", beide: "Both" };
function readZoom(storageKey = ZOOM_KEY, fallback: number = ZOOM.default): number {
  const z = Number(read(storageKey));
  return read(storageKey) !== null && Number.isFinite(z) ? Math.min(ZOOM.max, Math.max(ZOOM.min, z)) : fallback;
}
function readHazeLamp(): HazeLamp {
  try {
    const l = JSON.parse(read(HAZE_LAMP_KEY) ?? "null");
    if (Number.isFinite(l?.x) && Number.isFinite(l?.y) && Number.isFinite(l?.z)) return { x: l.x, y: l.y, z: l.z };
  } catch { /* Vorgabe */ }
  return { ...HAZE_LAMP_DEFAULT };
}
// Readable depth: relative to the frontmost (z = 1) and the backmost element (z = 0)
const depthText = (z: number): string =>
  z >= 1 ? `${(z - 1).toFixed(1)} m in front` : z <= 0 ? `${(-z).toFixed(1)} m behind` : "inside";
function readSide(): MirrorSide {
  const s = read(HAZE_SIDE_KEY);
  return s === "hinten" || s === "beide" ? s : "vorn";
}
function readLamp(): { x: number; y: number } {
  try {
    const l = JSON.parse(read(LAMP_KEY) ?? "null");
    if (Number.isFinite(l?.x) && Number.isFinite(l?.y)) return { x: l.x, y: l.y };
  } catch { /* Vorgabe */ }
  return { ...LAMP_DEFAULT };
}
// "licht" was the name of the mode that Stage replaces now
function readMode(): FrontMode {
  const m = read(MODE_KEY);
  return m === "licht" || m === "buehne" ? "buehne" : m === "waerme" ? "waerme" : "spiegel";
}
const MODE_NAME: Record<FrontMode, string> = { spiegel: "Mirror", buehne: "Stage", waerme: "Thermal" };
function read(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
function remember(storageKey: string, value: string): void {
  try { localStorage.setItem(storageKey, value); } catch { /* without storage just for now */ }
}

function PreviewArea() {
  const l = useAppState();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<FrontMode>(readMode);
  const [view, setView] = useState<View>(() => {
    const a = read(VIEW_KEY);
    return a === "phaser" || a === "reflexion" ? a : "bild";
  });
  const [phaserElements, setPhaserElements] = useState(() => read(PHASER_ELEMENTS_KEY) === "ja");
  const phaserElementsRef = useRef(phaserElements);
  phaserElementsRef.current = phaserElements;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const viewRef = useRef(view);
  viewRef.current = view;
  const preview = useRef<Preview>();
  const [zoom, setZoom] = useState(() => readZoom());
  const [haze, setHaze] = useState(() => read(HAZE_KEY) === "ja");
  const hazeRef = useRef(haze);
  hazeRef.current = haze;
  const [hazeZoom, setHazeZoom] = useState(() => readZoom(HAZE_ZOOM_KEY, HAZE_ZOOM_DEFAULT));
  const [side, setSide] = useState<MirrorSide>(readSide);
  const [depth, setDepth] = useState(() => readHazeLamp().z);
  const sideRef = useRef(side);
  sideRef.current = side;
  const dragging = useRef<number | null>(null);
  useEffect(() => {
    const v = new Preview(canvas.current!, () => {
      const parameter = appState.parameter;
      if (!parameter || !appState.state) return null;
      return {
        parameter,
        live: appState.state.uebernahme.zustand === "an",
        layout: appState.state.einstellungen.aufbau,
        rotateMaxRpm: appState.state.einstellungen.rotateMaxUpm,
        mode: modeRef.current,
        view: viewRef.current,
        phaserElements: phaserElementsRef.current,
        haze: hazeRef.current,
        hazeSide: sideRef.current,
        fade: appState.state.blende,
        fadeDuration: appState.state.blendeDauerS,
        impulse: appState.state.impuls,
        impulses: appState.state.impulse,
        impulsesSinceS: (performance.now() - appState.stateTime) / 1000,
        flash: appState.state.einstellungen.flash,
      };
    });
    v.lamp = readLamp();
    v.zoom = readZoom();
    v.hazeLamp = readHazeLamp();
    v.hazeZoom = readZoom(HAZE_ZOOM_KEY, HAZE_ZOOM_DEFAULT);
    preview.current = v;
    v.start();
    const unsubscribe = appState.subscribe(() => { if (appState.state) v.sync(appState.state.takt); });
    return () => { unsubscribe(); v.stop(); };
  }, []);
  const front = view === "bild" && l.state?.einstellungen.aufbau.anordnung === "hintereinander";
  const select = (m: FrontMode) => { setMode(m); remember(MODE_KEY, m); };
  const show = (a: View) => { setView(a); remember(VIEW_KEY, a); };
  const toggles = (
    <>
      {view === "phaser" && (
        <button
          type="button" class={`aktion haken ${phaserElements ? "aktiv" : ""}`} aria-pressed={phaserElements}
          title="Front view of the elements in the background"
          onClick={() => { setPhaserElements(!phaserElements); remember(PHASER_ELEMENTS_KEY, phaserElements ? "nein" : "ja"); }}
        >
          Elements
        </button>
      )}
      {view === "reflexion" && (
        <button
          type="button" class={`aktion haken ${haze ? "aktiv" : ""}`} aria-pressed={haze}
          title="Beams in haze, seen from the front, slightly offset"
          onClick={() => { setHaze(!haze); remember(HAZE_KEY, haze ? "nein" : "ja"); }}
        >
          Haze
        </button>
      )}
      {(["bild", "phaser", "reflexion"] as const).map((a) => (
        <button type="button" key={a} class={`aktion ${view === a ? "aktiv" : ""}`} aria-pressed={view === a} onClick={() => show(a)}>
          {VIEW_NAME[a]}
        </button>
      ))}
    </>
  );
  const title = view === "phaser" ? "Phaser" : view === "reflexion" ? (haze ? "Haze" : "Reflection") : front && mode !== "spiegel" ? MODE_NAME[mode] : "Simple";
  return (
    <Module title={`Live // ${title}`} className="m-vorschau" actions={toggles}>
    <div class={`vorschau-rahmen ${front ? "vorn" : ""} ${view} ${view === "reflexion" && haze ? "nebel" : ""}`}>
      <canvas
        ref={canvas}
        class="vorschau"
        // Reflection: drag the spotlight; the device remembers its position
        onPointerDown={(ev) => {
          const v = preview.current;
          if (view !== "reflexion" || !v) return;
          const r = ev.currentTarget.getBoundingClientRect();
          if (!v.onLamp(ev.clientX - r.left, ev.clientY - r.top)) return;
          dragging.current = ev.pointerId;
          ev.currentTarget.setPointerCapture(ev.pointerId);
        }}
        onPointerMove={(ev) => {
          const v = preview.current;
          if (!v || dragging.current !== ev.pointerId) return;
          const r = ev.currentTarget.getBoundingClientRect();
          v.dragLamp(ev.clientX - r.left, ev.clientY - r.top);
        }}
        onPointerUp={() => {
          if (dragging.current === null) return;
          dragging.current = null;
          const v = preview.current;
          if (v) {
            if (haze) remember(HAZE_LAMP_KEY, JSON.stringify(v.hazeLamp));
            else remember(LAMP_KEY, JSON.stringify(v.lamp));
          }
        }}
        onPointerCancel={() => { dragging.current = null; }}
        role="img"
        aria-label={view === "phaser"
          ? "Angles of the 36 mirrors as a chart"
          : view === "reflexion" ? (haze ? "Beams in haze, seen from the front, slightly offset" : "Top view with spotlight and reflected beams")
          : front ? "Preview of the three elements from the front" : "Preview of the 36 mirrors from above"}
      />
      {view === "reflexion" && (
        <label class="vorschau-zoom">
          <span>Zoom</span>
          <input
            type="range" min={ZOOM.min} max={ZOOM.max} step={1} value={haze ? hazeZoom : zoom}
            style={{ "--fuellung": `${(((haze ? hazeZoom : zoom) - ZOOM.min) / (ZOOM.max - ZOOM.min)) * 100}%` }}
            onInput={(ev) => {
              const z = Number(ev.currentTarget.value);
              const v = preview.current;
              if (haze) { setHazeZoom(z); if (v) v.hazeZoom = z; }
              else { setZoom(z); if (v) v.zoom = z; }
            }}
            onChange={(ev) => remember(haze ? HAZE_ZOOM_KEY : ZOOM_KEY, ev.currentTarget.value)}
          />
          <output>{haze ? hazeZoom : zoom}°</output>
        </label>
      )}
      {view === "reflexion" && haze && (
        <label class="vorschau-zoom vorschau-tiefe">
          <span>Depth</span>
          <input
            type="range" min={HAZE_DEPTH.min} max={HAZE_DEPTH.max} step={0.1} value={depth}
            style={{ "--fuellung": `${((depth - HAZE_DEPTH.min) / (HAZE_DEPTH.max - HAZE_DEPTH.min)) * 100}%` }}
            onInput={(ev) => {
              const z = Number(ev.currentTarget.value);
              setDepth(z);
              preview.current?.setLampDepth(z);
            }}
            onChange={() => { if (preview.current) remember(HAZE_LAMP_KEY, JSON.stringify(preview.current.hazeLamp)); }}
          />
          <output>{depthText(depth)}</output>
        </label>
      )}
      {view === "reflexion" && haze && (
        // Which side reflects is still open on the real mirror; the other one swallows the light
        <div class="umschalter vorschau-seite" title="Where the mirroring side faces at tilt 0">
          <span>Mirror</span>
          {(["hinten", "vorn", "beide"] as const).map((s) => (
            <button type="button" key={s} class={side === s ? "aktiv" : ""} aria-pressed={side === s} onClick={() => { setSide(s); remember(HAZE_SIDE_KEY, s); }}>
              {SIDE_NAME[s]}
            </button>
          ))}
        </div>
      )}
      {front && (
        <div class="umschalter vorschau-modus">
          {(["spiegel", "buehne", "waerme"] as const).map((m) => (
            <button type="button" key={m} class={mode === m ? "aktiv" : ""} onClick={() => select(m)}>
              {MODE_NAME[m]}
            </button>
          ))}
        </div>
      )}
      <div class="scan" />
    </div>
    </Module>
  );
}
