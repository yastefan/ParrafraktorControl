import { useEffect, useRef, useState } from "preact/hooks";
import { laden, useLaden } from "./laden.js";
import { Einstellungen } from "./teile/einstellungen.js";
import { Impulse } from "./teile/impulse.js";
import { Kopf } from "./teile/kopf.js";
import { Patterns } from "./teile/patterns.js";
import { Presets } from "./teile/presets.js";
import { Bewegung, Verteilung, hatVerteilung } from "./teile/regler.js";
import { Modul } from "./teile/modul.js";
import { NEBEL_LAMPE_VORGABE, NEBEL_TIEFE, NEBEL_ZOOM_VORGABE, type NebelLampe, type SpiegelSeite } from "./nebel.js";
import { LAMPE_VORGABE, Vorschau, ZOOM, type Ansicht, type VorderModus } from "./vorschau.js";

export function App() {
  const l = useLaden();
  const [einstellungen, setEinstellungen] = useState(false);
  const p = l.parameter;
  const live = l.stand?.uebernahme.zustand !== undefined && l.stand.uebernahme.zustand !== "aus";

  return (
    <div class={`app ${live ? "live" : ""}`}>
      <Kopf beiEinstellungen={() => setEinstellungen(true)} />
      {!l.bedienbar && <Hinweis />}
      <main class={`pult ${p && !hatVerteilung(p) ? "ohne-verteilung" : ""} ${p?.modus === "oeffnung" ? "bahn" : ""}`}>
        <div class="pult-oben">
          <VorschauFlaeche />
          <div class="pult-rechts">
            {p && <Patterns modus={p.modus} />}
            <Presets />
          </div>
        </div>
        <div class="pult-mitte">
          {p && <Bewegung parameter={p} />}
          {p && hatVerteilung(p) && <Verteilung parameter={p} />}
        </div>
        {l.stand && <Impulse />}
      </main>
      {einstellungen && l.stand && <Einstellungen stand={l.stand} schliessen={() => setEinstellungen(false)} />}
    </div>
  );
}

function Hinweis() {
  const l = useLaden();
  const text = l.stand
    ? "Keine Verbindung zum Server – verbinde neu …"
    : "Verbinde mit dem Server …";
  return <div class={`hinweis ${l.verbindung}`}>{text}</div>;
}

// Ansicht und Spiegel/Licht in der Vorderansicht: nur für dieses Gerät, deshalb im Browser gemerkt
const MODUS_SCHLUESSEL = "parrafraktor.vorderModus";
const ANSICHT_SCHLUESSEL = "parrafraktor.ansicht";
const PHASER_ELEMENTE_SCHLUESSEL = "parrafraktor.phaserElemente";
const ANSICHT_NAME: Record<Ansicht, string> = { bild: "Simple", phaser: "Phaser", reflexion: "Reflexion" };

const LAMPE_SCHLUESSEL = "parrafraktor.lampe";
const ZOOM_SCHLUESSEL = "parrafraktor.zoom";
const NEBEL_SCHLUESSEL = "parrafraktor.nebel";
const NEBEL_LAMPE_SCHLUESSEL = "parrafraktor.nebelLampeVorn";   // neuer Name: Vorgabe ist jetzt vor den Elementen
const NEBEL_ZOOM_SCHLUESSEL = "parrafraktor.nebelZoom";
const NEBEL_SEITE_SCHLUESSEL = "parrafraktor.nebelSeiteVorn";
const SEITE_NAME: Record<SpiegelSeite, string> = { hinten: "Hinten", vorn: "Vorn", beide: "Beide" };
function leseZoom(schluessel = ZOOM_SCHLUESSEL, vorgabe: number = ZOOM.vorgabe): number {
  const z = Number(lese(schluessel));
  return lese(schluessel) !== null && Number.isFinite(z) ? Math.min(ZOOM.max, Math.max(ZOOM.min, z)) : vorgabe;
}
function leseNebelLampe(): NebelLampe {
  try {
    const l = JSON.parse(lese(NEBEL_LAMPE_SCHLUESSEL) ?? "null");
    if (Number.isFinite(l?.x) && Number.isFinite(l?.y) && Number.isFinite(l?.z)) return { x: l.x, y: l.y, z: l.z };
  } catch { /* Vorgabe */ }
  return { ...NEBEL_LAMPE_VORGABE };
}
// Tiefe lesbar: bezogen auf das vorderste (z = 1) und hinterste Element (z = 0)
const tiefeText = (z: number): string =>
  z >= 1 ? `${(z - 1).toFixed(1)} m vorn` : z <= 0 ? `${(-z).toFixed(1)} m hinten` : "im Aufbau";
function leseSeite(): SpiegelSeite {
  const s = lese(NEBEL_SEITE_SCHLUESSEL);
  return s === "hinten" || s === "beide" ? s : "vorn";
}
function leseLampe(): { x: number; y: number } {
  try {
    const l = JSON.parse(lese(LAMPE_SCHLUESSEL) ?? "null");
    if (Number.isFinite(l?.x) && Number.isFinite(l?.y)) return { x: l.x, y: l.y };
  } catch { /* Vorgabe */ }
  return { ...LAMPE_VORGABE };
}
// "licht" hieß früher der Modus, den jetzt Bühne ersetzt
function leseModus(): VorderModus {
  const m = lese(MODUS_SCHLUESSEL);
  return m === "licht" || m === "buehne" ? "buehne" : m === "waerme" ? "waerme" : "spiegel";
}
const MODUS_NAME: Record<VorderModus, string> = { spiegel: "Spiegel", buehne: "Bühne", waerme: "Wärmebild" };
function lese(schluessel: string): string | null {
  try {
    return localStorage.getItem(schluessel);
  } catch {
    return null;
  }
}
function merke(schluessel: string, wert: string): void {
  try { localStorage.setItem(schluessel, wert); } catch { /* ohne Speicher eben nur für jetzt */ }
}

function VorschauFlaeche() {
  const l = useLaden();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [modus, setModus] = useState<VorderModus>(leseModus);
  const [ansicht, setAnsicht] = useState<Ansicht>(() => {
    const a = lese(ANSICHT_SCHLUESSEL);
    return a === "phaser" || a === "reflexion" ? a : "bild";
  });
  const [phaserElemente, setPhaserElemente] = useState(() => lese(PHASER_ELEMENTE_SCHLUESSEL) === "ja");
  const phaserElementeRef = useRef(phaserElemente);
  phaserElementeRef.current = phaserElemente;
  const modusRef = useRef(modus);
  modusRef.current = modus;
  const ansichtRef = useRef(ansicht);
  ansichtRef.current = ansicht;
  const vorschau = useRef<Vorschau>();
  const [zoom, setZoom] = useState(() => leseZoom());
  const [nebel, setNebel] = useState(() => lese(NEBEL_SCHLUESSEL) === "ja");
  const nebelRef = useRef(nebel);
  nebelRef.current = nebel;
  const [nebelZoom, setNebelZoom] = useState(() => leseZoom(NEBEL_ZOOM_SCHLUESSEL, NEBEL_ZOOM_VORGABE));
  const [seite, setSeite] = useState<SpiegelSeite>(leseSeite);
  const [tiefe, setTiefe] = useState(() => leseNebelLampe().z);
  const seiteRef = useRef(seite);
  seiteRef.current = seite;
  const zieht = useRef<number | null>(null);
  useEffect(() => {
    const v = new Vorschau(canvas.current!, () => {
      const parameter = laden.parameter;
      if (!parameter || !laden.stand) return null;
      return {
        parameter,
        live: laden.stand.uebernahme.zustand === "an",
        aufbau: laden.stand.einstellungen.aufbau,
        rotateMaxUpm: laden.stand.einstellungen.rotateMaxUpm,
        modus: modusRef.current,
        ansicht: ansichtRef.current,
        phaserElemente: phaserElementeRef.current,
        nebel: nebelRef.current,
        nebelSeite: seiteRef.current,
        blende: laden.stand.blende,
        blendeDauer: laden.stand.blendeDauerS,
        impuls: laden.stand.impuls,
        impulse: laden.stand.impulse,
        impulseSeitS: (performance.now() - laden.standZeit) / 1000,
        flash: laden.stand.einstellungen.flash,
      };
    });
    v.lampe = leseLampe();
    v.zoom = leseZoom();
    v.nebelLampe = leseNebelLampe();
    v.nebelZoom = leseZoom(NEBEL_ZOOM_SCHLUESSEL, NEBEL_ZOOM_VORGABE);
    vorschau.current = v;
    v.starte();
    const ab = laden.abonniere(() => { if (laden.stand) v.gleiche(laden.stand.takt); });
    return () => { ab(); v.stoppe(); };
  }, []);
  const vorn = ansicht === "bild" && l.stand?.einstellungen.aufbau.anordnung === "hintereinander";
  const waehle = (m: VorderModus) => { setModus(m); merke(MODUS_SCHLUESSEL, m); };
  const zeige = (a: Ansicht) => { setAnsicht(a); merke(ANSICHT_SCHLUESSEL, a); };
  const umschalter = (
    <>
      {ansicht === "phaser" && (
        <button
          type="button" class={`aktion haken ${phaserElemente ? "aktiv" : ""}`} aria-pressed={phaserElemente}
          title="Vorderansicht der Elemente im Hintergrund"
          onClick={() => { setPhaserElemente(!phaserElemente); merke(PHASER_ELEMENTE_SCHLUESSEL, phaserElemente ? "nein" : "ja"); }}
        >
          Elemente
        </button>
      )}
      {ansicht === "reflexion" && (
        <button
          type="button" class={`aktion haken ${nebel ? "aktiv" : ""}`} aria-pressed={nebel}
          title="Strahlen im Nebel, von vorn leicht versetzt"
          onClick={() => { setNebel(!nebel); merke(NEBEL_SCHLUESSEL, nebel ? "nein" : "ja"); }}
        >
          Nebel
        </button>
      )}
      {(["bild", "phaser", "reflexion"] as const).map((a) => (
        <button type="button" key={a} class={`aktion ${ansicht === a ? "aktiv" : ""}`} aria-pressed={ansicht === a} onClick={() => zeige(a)}>
          {ANSICHT_NAME[a]}
        </button>
      ))}
    </>
  );
  const titel = ansicht === "phaser" ? "Phaser" : ansicht === "reflexion" ? (nebel ? "Nebel" : "Reflexion") : vorn && modus !== "spiegel" ? MODUS_NAME[modus] : "Simple";
  return (
    <Modul titel={`Live // ${titel}`} klasse="m-vorschau" aktionen={umschalter}>
    <div class={`vorschau-rahmen ${vorn ? "vorn" : ""} ${ansicht} ${ansicht === "reflexion" && nebel ? "nebel" : ""}`}>
      <canvas
        ref={canvas}
        class="vorschau"
        // Reflexion: den Scheinwerfer ziehen; die Lage merkt sich das Gerät
        onPointerDown={(ev) => {
          const v = vorschau.current;
          if (ansicht !== "reflexion" || !v) return;
          const r = ev.currentTarget.getBoundingClientRect();
          if (!v.aufLampe(ev.clientX - r.left, ev.clientY - r.top)) return;
          zieht.current = ev.pointerId;
          ev.currentTarget.setPointerCapture(ev.pointerId);
        }}
        onPointerMove={(ev) => {
          const v = vorschau.current;
          if (!v || zieht.current !== ev.pointerId) return;
          const r = ev.currentTarget.getBoundingClientRect();
          v.zieheLampe(ev.clientX - r.left, ev.clientY - r.top);
        }}
        onPointerUp={() => {
          if (zieht.current === null) return;
          zieht.current = null;
          const v = vorschau.current;
          if (v) {
            if (nebel) merke(NEBEL_LAMPE_SCHLUESSEL, JSON.stringify(v.nebelLampe));
            else merke(LAMPE_SCHLUESSEL, JSON.stringify(v.lampe));
          }
        }}
        onPointerCancel={() => { zieht.current = null; }}
        role="img"
        aria-label={ansicht === "phaser"
          ? "Winkel der 36 Spiegel als Diagramm"
          : ansicht === "reflexion" ? (nebel ? "Strahlen im Nebel, von vorn leicht versetzt" : "Draufsicht mit Scheinwerfer und reflektierten Strahlen")
          : vorn ? "Vorschau der drei Elemente von vorn" : "Vorschau der 36 Spiegel von oben"}
      />
      {ansicht === "reflexion" && (
        <label class="vorschau-zoom">
          <span>Zoom</span>
          <input
            type="range" min={ZOOM.min} max={ZOOM.max} step={1} value={nebel ? nebelZoom : zoom}
            style={{ "--fuellung": `${(((nebel ? nebelZoom : zoom) - ZOOM.min) / (ZOOM.max - ZOOM.min)) * 100}%` }}
            onInput={(ev) => {
              const z = Number(ev.currentTarget.value);
              const v = vorschau.current;
              if (nebel) { setNebelZoom(z); if (v) v.nebelZoom = z; }
              else { setZoom(z); if (v) v.zoom = z; }
            }}
            onChange={(ev) => merke(nebel ? NEBEL_ZOOM_SCHLUESSEL : ZOOM_SCHLUESSEL, ev.currentTarget.value)}
          />
          <output>{nebel ? nebelZoom : zoom}°</output>
        </label>
      )}
      {ansicht === "reflexion" && nebel && (
        <label class="vorschau-zoom vorschau-tiefe">
          <span>Tiefe</span>
          <input
            type="range" min={NEBEL_TIEFE.min} max={NEBEL_TIEFE.max} step={0.1} value={tiefe}
            style={{ "--fuellung": `${((tiefe - NEBEL_TIEFE.min) / (NEBEL_TIEFE.max - NEBEL_TIEFE.min)) * 100}%` }}
            onInput={(ev) => {
              const z = Number(ev.currentTarget.value);
              setTiefe(z);
              vorschau.current?.setzeLampenTiefe(z);
            }}
            onChange={() => { if (vorschau.current) merke(NEBEL_LAMPE_SCHLUESSEL, JSON.stringify(vorschau.current.nebelLampe)); }}
          />
          <output>{tiefeText(tiefe)}</output>
        </label>
      )}
      {ansicht === "reflexion" && nebel && (
        // Welche Seite spiegelt, ist am echten Spiegel noch zu klären; die andere schluckt das Licht
        <div class="umschalter vorschau-seite" title="Wohin die spiegelnde Seite bei Tilt 0 zeigt">
          <span>Spiegel</span>
          {(["hinten", "vorn", "beide"] as const).map((s) => (
            <button type="button" key={s} class={seite === s ? "aktiv" : ""} aria-pressed={seite === s} onClick={() => { setSeite(s); merke(NEBEL_SEITE_SCHLUESSEL, s); }}>
              {SEITE_NAME[s]}
            </button>
          ))}
        </div>
      )}
      {vorn && (
        <div class="umschalter vorschau-modus">
          {(["spiegel", "buehne", "waerme"] as const).map((m) => (
            <button type="button" key={m} class={modus === m ? "aktiv" : ""} onClick={() => waehle(m)}>
              {MODUS_NAME[m]}
            </button>
          ))}
        </div>
      )}
      <div class="scan" />
    </div>
    </Modul>
  );
}
