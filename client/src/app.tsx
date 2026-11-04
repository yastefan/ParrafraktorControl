import { useEffect, useRef, useState } from "preact/hooks";
import { laden, useLaden } from "./laden.js";
import { Einstellungen } from "./teile/einstellungen.js";
import { Impulse } from "./teile/impulse.js";
import { Kopf } from "./teile/kopf.js";
import { Patterns } from "./teile/patterns.js";
import { Presets } from "./teile/presets.js";
import { Regler } from "./teile/regler.js";
import { LAMPE_VORGABE, Vorschau, type Ansicht, type VorderModus } from "./vorschau.js";

export function App() {
  const l = useLaden();
  const [einstellungen, setEinstellungen] = useState(false);
  const p = l.parameter;
  const live = l.stand?.uebernahme.zustand !== undefined && l.stand.uebernahme.zustand !== "aus";

  return (
    <div class={`app ${live ? "live" : ""}`}>
      <Kopf beiEinstellungen={() => setEinstellungen(true)} />
      {!l.bedienbar && <Hinweis />}
      <main class="haupt">
        <section class="links">
          <VorschauFlaeche />
          {p && <Patterns modus={p.modus} />}
          <Presets />
          {l.stand && <Impulse />}
        </section>
        <section class="rechts">{p && <Regler parameter={p} />}</section>
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
const ANSICHT_NAME: Record<Ansicht, string> = { bild: "Simple", phaser: "Phaser", reflexion: "Reflexion" };
const LAMPE_SCHLUESSEL = "parrafraktor.lampe";
function leseLampe(): { x: number; y: number } {
  try {
    const l = JSON.parse(lese(LAMPE_SCHLUESSEL) ?? "null");
    if (Number.isFinite(l?.x) && Number.isFinite(l?.y)) return { x: l.x, y: l.y };
  } catch { /* Vorgabe */ }
  return { ...LAMPE_VORGABE };
}
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
  const [modus, setModus] = useState<VorderModus>(() => (lese(MODUS_SCHLUESSEL) === "licht" ? "licht" : "spiegel"));
  const [ansicht, setAnsicht] = useState<Ansicht>(() => {
    const a = lese(ANSICHT_SCHLUESSEL);
    return a === "phaser" || a === "reflexion" ? a : "bild";
  });
  const modusRef = useRef(modus);
  modusRef.current = modus;
  const ansichtRef = useRef(ansicht);
  ansichtRef.current = ansicht;
  const vorschau = useRef<Vorschau>();
  const zieht = useRef<number | null>(null);
  useEffect(() => {
    const v = new Vorschau(canvas.current!, () => {
      const parameter = laden.parameter;
      if (!parameter || !laden.stand) return null;
      return {
        parameter,
        live: laden.stand.uebernahme.zustand === "an",
        aufbau: laden.stand.einstellungen.aufbau,
        modus: modusRef.current,
        ansicht: ansichtRef.current,
        blende: laden.stand.blende,
        blendeDauer: laden.stand.einstellungen.ueberblendungS,
        impuls: laden.stand.impuls,
        impulse: laden.stand.impulse,
        impulseSeitS: (performance.now() - laden.standZeit) / 1000,
        flash: laden.stand.einstellungen.flash,
      };
    });
    v.lampe = leseLampe();
    vorschau.current = v;
    v.starte();
    const ab = laden.abonniere(() => { if (laden.stand) v.gleiche(laden.stand.takt); });
    return () => { ab(); v.stoppe(); };
  }, []);
  const vorn = ansicht === "bild" && l.stand?.einstellungen.aufbau.anordnung === "hintereinander";
  const waehle = (m: VorderModus) => { setModus(m); merke(MODUS_SCHLUESSEL, m); };
  const zeige = (a: Ansicht) => { setAnsicht(a); merke(ANSICHT_SCHLUESSEL, a); };
  return (
    <div class={`vorschau-rahmen ${vorn ? "vorn" : ""} ${ansicht}`}>
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
          v.lampe = v.raumPunkt(ev.clientX - r.left, ev.clientY - r.top);
        }}
        onPointerUp={() => {
          if (zieht.current === null) return;
          zieht.current = null;
          if (vorschau.current) merke(LAMPE_SCHLUESSEL, JSON.stringify(vorschau.current.lampe));
        }}
        onPointerCancel={() => { zieht.current = null; }}
        role="img"
        aria-label={ansicht === "phaser"
          ? "Winkel der 36 Spiegel als Diagramm"
          : ansicht === "reflexion" ? "Draufsicht mit Scheinwerfer und reflektierten Strahlen"
          : vorn ? "Vorschau der drei Elemente von vorn" : "Vorschau der 36 Spiegel von oben"}
      />
      <div class="umschalter vorschau-ansicht">
        {(["bild", "phaser", "reflexion"] as const).map((a) => (
          <button type="button" key={a} class={ansicht === a ? "aktiv" : ""} onClick={() => zeige(a)}>
            {ANSICHT_NAME[a]}
          </button>
        ))}
      </div>
      {vorn && (
        <div class="umschalter vorschau-modus">
          {(["spiegel", "licht"] as const).map((m) => (
            <button type="button" key={m} class={modus === m ? "aktiv" : ""} onClick={() => waehle(m)}>
              {m === "spiegel" ? "Spiegel" : "Licht"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
