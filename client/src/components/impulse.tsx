// Impulses: choose the kind (Open, Close, Hole, Iris) and trigger it on the strip –
// like the touch strip of the Stream Deck: tap = from there, swipe = runs through in the direction
// of the swipe (speed: spread). The envelope (attack, sustain, release, strength) then runs from
// selbst ab.
import {
  ELEMENT_ORDERS, ELEMENT_ORDER_NAME, IMPULSE_KINDS, IMPULSE_NAME, envelopeValue, isApertureKind, smooth,
  type ImpulseSettings,
} from "@parrafraktor/engine";
import { IMPULSE_RANGES, clampImpulse, impulseValue, withImpulseValue, formatImpulse, type ImpulseControl } from "@parrafraktor/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { appState, useAppState } from "../app-state.js";
import { Module } from "./module.js";

export function Impulses() {
  const l = useAppState();
  const server = l.state!.impuls;
  // While dragging the local draft applies until the server has confirmed it
  const [draft, setDraft] = useState<ImpulseSettings | null>(null);
  const e = draft ?? server;
  const sendTimer = useRef<number>();
  const set = (next: ImpulseSettings) => {
    setDraft(next);
    window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(() => l.send({ typ: "impulsEinstellung", einstellung: next }), 16);
  };
  const done = () => window.setTimeout(() => setDraft(null), 800);
  const immediate = (next: ImpulseSettings) => { set(next); done(); };
  const [more, setMore] = useState(false);

  return (
    <>
      <Module
        title="05 Impulses"
        className="m-impulse"
        actions={(
          <>
            <button
              type="button" class={`aktion ${e.symmetrisch ? "aktiv" : ""}`} disabled={!l.usable}
              aria-pressed={e.symmetrisch}
              title="Also starts at the mirrored point, the left half moves mirrored"
              onClick={() => immediate({ ...e, symmetrisch: !e.symmetrisch })}
            >
              Symmetric
            </button>
            <button type="button" class={`aktion ${more ? "aktiv" : ""}`} aria-expanded={more} onClick={() => setMore(!more)}>
              More
            </button>
          </>
        )}
      >
        <div class="impulse">
          <div class="arten">
            {IMPULSE_KINDS.map((a) => {
              const running = l.state?.impulse.some((i) => i.art === a) ?? false;
              return (
                <button
                  type="button" key={a} disabled={!l.usable}
                  class={`art ${e.art === a ? "aktiv" : running ? "laeuft" : ""}`}
                  onClick={() => immediate({ ...e, art: a })}
                >
                  {IMPULSE_NAME[a]}
                </button>
              );
            })}
          </div>
          <Strip name={IMPULSE_NAME[e.art]} />
          <div class="huelle-feld"><EnvelopeGraph e={e} set={set} done={done} /></div>
          <div class="impuls-regler">
            <Slider name={isApertureKind(e.art) ? "groesse" : "breite"} e={e} set={set} done={done} />
            <Slider name="staerke" e={e} set={set} done={done} />
            <Slider name="ausbreitungS" e={e} set={set} done={done} />
          </div>
        </div>
      </Module>
      {more && (
        <div class="impuls-mehr" role="dialog" aria-label="More impulse controls">
          <div class="impuls-mehr-kopf">
            <h3>Impulses // More</h3>
            <button type="button" class="aktion" onClick={() => setMore(false)}>Close</button>
          </div>
          <span class="stufen-name">Elements</span>
          <div class="stufen-raster folge">
            {ELEMENT_ORDERS.map((f) => (
              <button
                type="button" key={f} class={`stufe ${e.elementFolge === f ? "aktiv" : ""}`} disabled={!l.usable}
                aria-pressed={e.elementFolge === f}
                onClick={() => immediate({ ...e, elementFolge: f })}
              >
                {ELEMENT_ORDER_NAME[f]}
              </button>
            ))}
          </div>
          {e.elementFolge !== "zusammen" && <Slider name="elementVersatzS" e={e} set={set} done={done} />}
          {(["attackS", "sustainS", "releaseS"] as const).map((name) => (
            <Slider key={name} name={name} e={e} set={set} done={done} />
          ))}
        </div>
      )}
    </>
  );
}

function Slider({ name, e, set, done }: { name: ImpulseControl } & EnvelopeGraphProps) {
  const l = useAppState();
  const b = IMPULSE_RANGES[name], w = impulseValue(e, name);
  return (
    <label class="band-regler">
      <span class="name">{b.short}</span>
      <input
        type="range" min={b.min} max={b.max} step={b.step} value={w} disabled={!l.usable}
        style={{ "--fuellung": `${((w - b.min) / (b.max - b.min)) * 100}%` }}
        onInput={(ev) => set(withImpulseValue(e, name, Number((ev.currentTarget as HTMLInputElement).value)))}
        onChange={done}
      />
      <output>{formatImpulse(name, w)}</output>
    </label>
  );
}

// ---------- Streifen ----------

const SWIPE = 0.08;   // from this distance (fraction of the width) on it counts as a swipe

function Strip({ name }: { name: string }) {
  const l = useAppState();
  const start = useRef<{ id: number; x: number } | null>(null);
  const [blink, setBlink] = useState<{ x: number; n: number } | null>(null);
  const fraction = (ev: PointerEvent) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  };
  const release = (origin: number, swipe: boolean) => {
    appState.send({ typ: "impulsTippen", ursprung: origin, wischen: swipe });
    setBlink((b) => ({ x: origin, n: (b?.n ?? 0) + 1 }));
  };
  return (
    <div
      class={`streifen ${l.usable ? "" : "gesperrt"}`}
      role="button"
      aria-label={`${name} from here`}
      onPointerDown={(ev) => {
        if (!l.usable) return;
        start.current = { id: ev.pointerId, x: fraction(ev) };
      }}
      onPointerUp={(ev) => {
        const s = start.current;
        if (!s || s.id !== ev.pointerId) return;
        start.current = null;
        const dx = fraction(ev) - s.x;
        // Tap: from there; swipe: from the edge in the direction of the swipe
        if (Math.abs(dx) < SWIPE) release(s.x, false);
        else release(dx > 0 ? 0 : 1, true);
      }}
      onPointerCancel={() => { start.current = null; }}
    >
      <span class="streifen-text">[ {name} // tap or swipe ]</span>
      {blink && <span key={blink.n} class="streifen-blitz" style={{ left: `${blink.x * 100}%` }} />}
    </div>
  );
}



// ---------- Envelope ----------

// Drawing area: attack, sustain and release side by side, times on a square-root scale, so short
// times can be set finely. Handles: attack/strength, end of sustain, end of release.
const B = 320, H = 72, MARGIN = 8;
const WIDTH = B - 2 * MARGIN;
const BA = WIDTH * 0.28, BS = WIDTH * 0.24, BR = WIDTH * 0.48;
const MAX = { attackS: IMPULSE_RANGES.attackS.max, sustainS: IMPULSE_RANGES.sustainS.max, releaseS: IMPULSE_RANGES.releaseS.max };
const root = (t: number, max: number) => Math.sqrt(Math.min(Math.max(t, 0), max) / max);
const y = (fraction: number) => MARGIN + (H - 2 * MARGIN) * (1 - fraction);
const xAttack = (t: number) => MARGIN + BA * root(t, MAX.attackS);
const xSustain = (e: ImpulseSettings, t: number) => xAttack(e.huelle.attackS) + BS * root(t, MAX.sustainS);
const xRelease = (e: ImpulseSettings, t: number) => xSustain(e, e.huelle.sustainS) + BR * root(t, MAX.releaseS);

// Position on the time axis for t seconds since the start
function xTime(e: ImpulseSettings, t: number): number {
  const { attackS: a, sustainS: s } = e.huelle;
  if (t < a) return xAttack(t);
  if (t < a + s) return xSustain(e, t - a);
  return xRelease(e, t - a - s);
}

function curve(e: ImpulseSettings): string {
  const { attackS: a, sustainS: s, releaseS: r, staerke } = e.huelle;
  const st = staerke / 100;
  const points: string[] = [`${MARGIN},${y(0)}`];
  for (let n = 1; n <= 24; n++) {
    const t = (a * n) / 24;
    points.push(`${xAttack(t)},${y(st * (a > 0 ? smooth(t / a) : 1))}`);
  }
  points.push(`${xSustain(e, s)},${y(st)}`);
  for (let n = 1; n <= 24; n++) {
    const t = (r * n) / 24;
    points.push(`${xRelease(e, t)},${y(st * (r > 0 ? 1 - smooth(t / r) : 0))}`);
  }
  points.push(`${B - MARGIN},${y(0)}`);
  return "M" + points.join(" L");
}

interface EnvelopeGraphProps {
  e: ImpulseSettings;
  set: (e: ImpulseSettings) => void;
  done: () => void;
}

type Handle = "attack" | "sustain" | "release";

function EnvelopeGraph({ e, set, done }: EnvelopeGraphProps) {
  const l = useAppState();
  const svg = useRef<SVGSVGElement>(null);
  const mark = useRef<SVGCircleElement>(null);
  const handle = useRef<Handle | null>(null);
  const eRef = useRef(e);
  eRef.current = e;

  // Point that runs along the curve with the impulse started last (frontmost element)
  useEffect(() => {
    let image = 0;
    const loop = () => {
      const m = mark.current, st = appState.state;
      const i = st?.impulse[st.impulse.length - 1];
      const ee = eRef.current, h = ee.huelle;
      const t = i ? i.alterS + (performance.now() - appState.stateTime) / 1000 : 0;
      if (m && i && t > 0 && t < h.attackS + h.sustainS + h.releaseS) {
        m.setAttribute("cx", String(xTime(ee, t)));
        m.setAttribute("cy", String(y(envelopeValue(h, t) * (h.staerke / 100))));
        m.style.opacity = "1";
      } else if (m) {
        m.style.opacity = "0";
      }
      image = requestAnimationFrame(loop);
    };
    image = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(image);
  }, []);

  const point = (ev: PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * B, ((ev.clientY - r.top) / r.height) * H];
  };
  // Time from the position within a section (inverse of the square root)
  const time = (px: number, from: number, width: number, max: number) => {
    const fraction = Math.min(1, Math.max(0, (px - from) / width));
    return max * fraction * fraction;
  };
  const drag = (ev: PointerEvent) => {
    if (!handle.current) return;
    const [px, py] = point(ev);
    const ee = eRef.current, h = ee.huelle;
    if (handle.current === "attack") {
      const strength = Math.min(1, Math.max(0, 1 - (py - MARGIN) / (H - 2 * MARGIN))) * 100;
      set({ ...ee, huelle: {
        ...h,
        attackS: clampImpulse("attackS", time(px, MARGIN, BA, MAX.attackS)),
        staerke: clampImpulse("staerke", strength),
      } });
    } else if (handle.current === "sustain") {
      set({ ...ee, huelle: { ...h, sustainS: clampImpulse("sustainS", time(px, xAttack(h.attackS), BS, MAX.sustainS)) } });
    } else {
      set({ ...ee, huelle: { ...h, releaseS: clampImpulse("releaseS", time(px, xSustain(ee, h.sustainS), BR, MAX.releaseS)) } });
    }
  };

  const ax = xAttack(e.huelle.attackS), ay = y(e.huelle.staerke / 100);
  const sx = xSustain(e, e.huelle.sustainS);
  const rx = xRelease(e, e.huelle.releaseS), ry = y(0);
  const handles: [Handle, number, number][] = [["attack", ax, ay], ["sustain", sx, ay], ["release", rx, ry]];
  return (
    <svg
      ref={svg}
      class={`huelle ${l.usable ? "" : "gesperrt"}`}
      viewBox={`0 0 ${B} ${H}`}
      role="img"
      aria-label="Envelope: attack, sustain, release"
      onPointerDown={(ev) => {
        if (!l.usable) return;
        const [px, py] = point(ev);
        // take the nearest handle
        handle.current = handles.reduce((a, b) => (Math.hypot(px - b[1], py - b[2]) < Math.hypot(px - a[1], py - a[2]) ? b : a))[0];
        (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
        drag(ev);
      }}
      onPointerMove={drag}
      onPointerUp={() => { handle.current = null; done(); }}
      onPointerCancel={() => { handle.current = null; done(); }}
    >
      <line class="huelle-achse" x1={MARGIN} y1={y(0)} x2={B - MARGIN} y2={y(0)} />
      <line class="huelle-hold" x1={ax} y1={MARGIN} x2={ax} y2={y(0)} />
      <line class="huelle-hold" x1={sx} y1={MARGIN} x2={sx} y2={y(0)} />
      <text class="huelle-text" x={(ax + sx) / 2} y={H - 2}>Sustain</text>
      <path class="huelle-kurve" d={curve(e)} />
      {handles.map(([name, gx, gy]) => <circle key={name} class="huelle-griff" cx={gx} cy={gy} r={6} />)}
      <circle ref={mark} class="huelle-marke" r={4} cx={MARGIN} cy={y(0)} />
    </svg>
  );
}
