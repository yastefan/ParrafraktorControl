// Senkrechter Fader. Ziehen verstellt relativ: Antippen allein ändert nichts, damit in der Show kein
// Wert springt. Doppeltippen auf den Namen setzt den Vorgabewert.
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";

interface Props {
  titel: string;
  wert: number;
  min: number;
  max: number;
  schritt: number;
  anzeige: string;
  gesperrt?: boolean;
  zusatz?: ComponentChildren;
  setze: (wert: number) => void;
  vorgabe?: () => void;
}

export function Fader({ titel, wert, min, max, schritt, anzeige, gesperrt, zusatz, setze, vorgabe }: Props) {
  const griff = useRef<{ id: number; y: number; wert: number; hoehe: number } | null>(null);
  const letztesTippen = useRef(0);
  const anteil = Math.min(1, Math.max(0, (wert - min) / (max - min)));
  const runde = (v: number) => +Math.min(max, Math.max(min, Math.round(v / schritt) * schritt)).toFixed(3);
  const tippe = () => {
    const jetzt = Date.now();
    if (vorgabe && jetzt - letztesTippen.current < 350) vorgabe();
    letztesTippen.current = jetzt;
  };
  return (
    <div class="fader">
      <div class="fader-name">
        <span onClick={tippe} title="Doppeltippen: Vorgabewert">{titel}</span>
        {zusatz}
      </div>
      <div
        class={`fader-feld ${gesperrt ? "gesperrt" : ""}`}
        role="slider"
        tabIndex={gesperrt ? -1 : 0}
        aria-label={titel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={wert}
        aria-valuetext={anzeige}
        onPointerDown={(ev) => {
          if (gesperrt) return;
          const feld = ev.currentTarget as HTMLElement;
          griff.current = { id: ev.pointerId, y: ev.clientY, wert, hoehe: feld.getBoundingClientRect().height };
          feld.setPointerCapture(ev.pointerId);
        }}
        onPointerMove={(ev) => {
          const g = griff.current;
          if (!g || g.id !== ev.pointerId) return;
          setze(runde(g.wert + ((g.y - ev.clientY) / g.hoehe) * (max - min)));
        }}
        onPointerUp={() => { griff.current = null; }}
        onPointerCancel={() => { griff.current = null; }}
        onKeyDown={(ev) => {
          if (gesperrt) return;
          const richtung = ev.key === "ArrowUp" || ev.key === "ArrowRight" ? 1 : ev.key === "ArrowDown" || ev.key === "ArrowLeft" ? -1 : 0;
          if (!richtung) return;
          ev.preventDefault();
          setze(runde(wert + richtung * schritt));
        }}
      >
        <div class="fader-spur">
          <div class="fader-fuellung" style={{ height: `${anteil * 100}%` }} />
          <div class="fader-griff" style={{ bottom: `${anteil * 100}%` }} />
        </div>
      </div>
      <output class="fader-wert">{anzeige}</output>
    </div>
  );
}
