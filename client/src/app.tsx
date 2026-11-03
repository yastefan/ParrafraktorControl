import { useEffect, useRef, useState } from "preact/hooks";
import { laden, useLaden } from "./laden.js";
import { Einstellungen } from "./teile/einstellungen.js";
import { Impulse } from "./teile/impulse.js";
import { Kopf } from "./teile/kopf.js";
import { Patterns } from "./teile/patterns.js";
import { Presets } from "./teile/presets.js";
import { Regler } from "./teile/regler.js";
import { Vorschau, type VorderModus } from "./vorschau.js";

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
          {l.stand && <Impulse />}
          {p && <Patterns modus={p.modus} />}
          <Presets />
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

// Spiegel oder Licht in der Vorderansicht: nur für dieses Gerät, deshalb im Browser gemerkt
const MODUS_SCHLUESSEL = "parrafraktor.vorderModus";
function leseModus(): VorderModus {
  try {
    return localStorage.getItem(MODUS_SCHLUESSEL) === "licht" ? "licht" : "spiegel";
  } catch {
    return "spiegel";
  }
}

function VorschauFlaeche() {
  const l = useLaden();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [modus, setModus] = useState<VorderModus>(leseModus);
  const modusRef = useRef(modus);
  modusRef.current = modus;
  useEffect(() => {
    const v = new Vorschau(canvas.current!, () => {
      const parameter = laden.parameter;
      if (!parameter || !laden.stand) return null;
      return {
        parameter,
        live: laden.stand.uebernahme.zustand === "an",
        aufbau: laden.stand.einstellungen.aufbau,
        modus: modusRef.current,
        blende: laden.stand.blende,
        blendeDauer: laden.stand.einstellungen.ueberblendungS,
        impuls: laden.stand.impuls,
        impulse: laden.stand.impulse,
        impulseSeitS: (performance.now() - laden.standZeit) / 1000,
        flash: laden.stand.einstellungen.flash,
      };
    });
    v.starte();
    const ab = laden.abonniere(() => { if (laden.stand) v.gleiche(laden.stand.takt); });
    return () => { ab(); v.stoppe(); };
  }, []);
  const vorn = l.stand?.einstellungen.aufbau.anordnung === "hintereinander";
  const waehle = (m: VorderModus) => {
    setModus(m);
    try { localStorage.setItem(MODUS_SCHLUESSEL, m); } catch { /* ohne Speicher eben nur für jetzt */ }
  };
  return (
    <div class={`vorschau-rahmen ${vorn ? "vorn" : ""}`}>
      <canvas
        ref={canvas}
        class="vorschau"
        role="img"
        aria-label={vorn ? "Vorschau der drei Elemente von vorn" : "Vorschau der 36 Spiegel von oben"}
      />
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
