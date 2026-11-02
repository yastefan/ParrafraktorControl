import { useEffect, useRef, useState } from "preact/hooks";
import { laden, useLaden } from "./laden.js";
import { Einstellungen } from "./teile/einstellungen.js";
import { Kopf } from "./teile/kopf.js";
import { Patterns } from "./teile/patterns.js";
import { Regler } from "./teile/regler.js";
import { Vorschau } from "./vorschau.js";

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

function VorschauFlaeche() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const v = new Vorschau(
      canvas.current!,
      () => laden.parameter,
      () => laden.stand?.uebernahme.zustand === "an",
    );
    v.starte();
    const ab = laden.abonniere(() => { if (laden.stand) v.gleiche(laden.stand.takt); });
    return () => { ab(); v.stoppe(); };
  }, []);
  return <canvas ref={canvas} class="vorschau" role="img" aria-label="Vorschau der 36 Spiegel von oben" />;
}
