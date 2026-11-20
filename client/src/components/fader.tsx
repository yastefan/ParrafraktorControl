// Vertical fader. Dragging adjusts relatively: a tap alone changes nothing, so no value jumps
// in the show. Double tap on the name sets the default. The mouse wheel over the fader adjusts
// by 2 % of the range per detent (usually 100 pixels), with Shift by the smallest step. Marks show more values
// on the track, e.g. the offset per element.
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";

interface Props {
  title: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  locked?: boolean;
  extra?: ComponentChildren;
  marks?: number[];
  set: (value: number) => void;
  reset?: () => void;
}

// Mouse wheel: pixels per detent, so mouse (detents) and trackpad (many small steps) act the same
const WHEEL_PIXELS = 50;

export function Fader({ title, value, min, max, step, display, locked, extra, marks, set, reset }: Props) {
  const handle = useRef<{ id: number; y: number; value: number; height: number } | null>(null);
  const rad = useRef(0);
  const lastTap = useRef(0);
  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const round = (v: number) => +Math.min(max, Math.max(min, Math.round(v / step) * step)).toFixed(3);
  const tap = () => {
    const now = Date.now();
    if (reset && now - lastTap.current < 350) reset();
    lastTap.current = now;
  };
  return (
    <div class="fader">
      <div class="fader-name">
        <span onClick={tap} title="Double-tap: default">{title}</span>
        {extra}
      </div>
      <div
        class={`fader-feld ${locked ? "gesperrt" : ""}`}
        role="slider"
        tabIndex={locked ? -1 : 0}
        aria-label={title}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        onPointerDown={(ev) => {
          if (locked) return;
          const field = ev.currentTarget as HTMLElement;
          handle.current = { id: ev.pointerId, y: ev.clientY, value, height: field.getBoundingClientRect().height };
          field.setPointerCapture(ev.pointerId);
        }}
        onPointerMove={(ev) => {
          const g = handle.current;
          if (!g || g.id !== ev.pointerId) return;
          set(round(g.value + ((g.y - ev.clientY) / g.height) * (max - min)));
        }}
        onWheel={(ev) => {
          if (locked) return;
          ev.preventDefault();
          const pixels = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaMode === 2 ? ev.deltaY * 400 : ev.deltaY;
          rad.current -= pixels;   // nach oben drehen = mehr
          const detents = Math.trunc(rad.current / WHEEL_PIXELS);
          if (!detents) return;
          rad.current -= detents * WHEEL_PIXELS;
          const size = ev.shiftKey ? step : Math.max(step, Math.round((max - min) / 100 / step) * step);
          set(round(value + detents * size));
        }}
        onPointerUp={() => { handle.current = null; }}
        onPointerCancel={() => { handle.current = null; }}
        onKeyDown={(ev) => {
          if (locked) return;
          const direction = ev.key === "ArrowUp" || ev.key === "ArrowRight" ? 1 : ev.key === "ArrowDown" || ev.key === "ArrowLeft" ? -1 : 0;
          if (!direction) return;
          ev.preventDefault();
          set(round(value + direction * step));
        }}
      >
        <div class="fader-spur">
          <div class="fader-fuellung" style={{ height: `${fraction * 100}%` }} />
          {marks?.map((m, i) => (
            <div key={i} class="fader-marke" style={{ bottom: `${Math.min(1, Math.max(0, (m - min) / (max - min))) * 100}%` }}>
              {i + 1}
            </div>
          ))}
          <div class="fader-griff" style={{ bottom: `${fraction * 100}%` }} />
        </div>
      </div>
      <output class="fader-wert">{display}</output>
    </div>
  );
}
