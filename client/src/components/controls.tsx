// Controls of the base movement: Motion (faders) and Distribution (toggles). Ranges come from the
// protocol, so client, Stream Deck and later MIDI have the same limits. Controls the selected
// base movement does not use are hidden.
import { ELEMENTS, type Parameter } from "@parrafraktor/engine";
import {
  RANGES, SWITCHES, STEPPED, NUMERIC_PARAMETERS, clampParameter, isUsed, offsetsDiffer, shiftOffset, formatValue,
  type SwitchParameter, type SteppedParameter, type NumericParameter,
} from "@parrafraktor/protocol";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useAppState } from "../app-state.js";
import { Fader } from "./fader.js";
import { Module } from "./module.js";

const APERTURE_SEQUENCE: NumericParameter[] = ["groesse", "weite", "speedVon", "kante", "wabern", "puls", "nachlauf"];

export function Motion({ parameter: p }: { parameter: Parameter }) {
  const names = p.modus === "oeffnung"
    ? APERTURE_SEQUENCE
    : NUMERIC_PARAMETERS.filter((n) => n !== "offset" && isUsed(p.modus, n));
  // Offset per element expanded: three faders, then it gets tight and the short names apply
  const [expanded, setExpanded] = useState(false);
  const density = expanded && isUsed(p.modus, "offset");
  return (
    <Module title="03 Motion" className="m-bewegung">
      <div class={`bank ${density ? "dicht" : ""}`}>
        {isUsed(p.modus, "offset") && <Offset p={p} expanded={expanded} toggleExpand={setExpanded} />}
        {names.map((name) => <NumericFader key={name} name={name} value={p[name]} title={density ? RANGES[name].short : undefined} />)}
      </div>
    </Module>
  );
}

// Steps and switches the base movement uses; with Rest there are none
const stepsOf = (p: Parameter) => (Object.keys(STEPPED) as SteppedParameter[]).filter((n) => isUsed(p.modus, n));
const switchOf = (p: Parameter) => (Object.keys(SWITCHES) as SwitchParameter[]).filter((n) => isUsed(p.modus, n));
export const hasDistribution = (p: Parameter): boolean => stepsOf(p).length + switchOf(p).length > 0;

export function Distribution({ parameter: p }: { parameter: Parameter }) {
  const l = useAppState();
  const aperture = p.modus === "oeffnung";
  const toggle = switchOf(p);
  return (
    <Module title={aperture ? "04 Path" : "04 Distribution"} className={`m-verteilung ${aperture ? "nur-bahn" : ""}`}>
      <div class="verteilung">
        {stepsOf(p).map((name) => <Steps key={name} name={name} value={p[name]} unnamed={aperture} />)}
        {toggle.length > 0 && (
          <div class="schalter-reihe">
            {toggle.map((name) => (
              <button
                type="button" key={name} class={`stufe ${p[name] ? "aktiv" : ""}`} disabled={!l.usable}
                aria-pressed={p[name]} onClick={() => l.set({ [name]: !p[name] })}
              >
                {SWITCHES[name]}
              </button>
            ))}
          </div>
        )}
      </div>
    </Module>
  );
}

// Offset: expanded one fader per element. Collapsed, the values of the elements stay: the one
// fader then shifts all by the same amount (distances stay), the marks 1–3 show where the
// elements are. Double tap on the name: reset, all alike again.
function Offset({ p, expanded, toggleExpand }: { p: Parameter; expanded: boolean; toggleExpand: (on: boolean) => void }) {
  const l = useAppState();
  const different = offsetsDiffer(p);
  const lock: ComponentChildren = (
    <button
      type="button"
      class={`schloss ${expanded ? "offen" : ""} ${different ? "verschieden" : ""}`}
      disabled={!l.usable}
      aria-label={expanded ? "Collapse offset per element" : "Offset per element"}
      title={expanded ? "collapse (values per element stay)" : different ? "per element (elements differ)" : "per element"}
      onClick={() => {
        // Erstes Aufklappen: alle Elemente starten beim gemeinsamen Offset
        if (!expanded && !p.offsetGetrennt) {
          l.set({ offsetGetrennt: true, offsetElemente: Array.from({ length: ELEMENTS }, () => p.offset) });
        }
        toggleExpand(!expanded);
      }}
    >
      {expanded ? "1×" : "3×"}
    </button>
  );
  if (!expanded) {
    return (
      <NumericFader
        name="offset" value={p.offset} extra={lock}
        marks={different ? p.offsetElemente : undefined}
        set={(v) => l.set(shiftOffset(p, v))}
        reset={() => l.send({ typ: "vorgabe", name: "offset" })}
      />
    );
  }
  return (
    <>
      {p.offsetElemente.map((w, k) => (
        <NumericFader
          key={k} name="offset" value={w} title={`Off. ${k + 1}`}
          extra={k === 0 ? lock : undefined}
          set={(v) => l.set({ offsetElemente: p.offsetElemente.map((x, i) => (i === k ? v : x)) })}
        />
      ))}
    </>
  );
}

interface NumericProps {
  name: NumericParameter;
  value: number;
  title?: string;
  extra?: ComponentChildren;
  marks?: number[];
  set?: (value: number) => void;
  reset?: () => void;
}

function NumericFader({ name, value, title, extra, marks, set, reset }: NumericProps) {
  const l = useAppState();
  const b = RANGES[name];
  return (
    <Fader
      title={title ?? b.name} value={value} min={b.min} max={b.max} step={b.step}
      display={formatValue(name, value)} locked={!l.usable} extra={extra} marks={marks}
      set={set ?? ((v) => l.set({ [name]: v }))}
      reset={reset ?? (() => (set ? set(clampParameter(name, b.min + (b.max - b.min) / 2)) : l.send({ typ: "vorgabe", name })))}
    />
  );
}

function Steps({ name, value, unnamed }: { name: SteppedParameter; value: string; unnamed?: boolean }) {
  const l = useAppState();
  const st = STEPPED[name];
  const text = st.text as Record<string, string>;
  return (
    <div class={`stufen stufen-${name}`}>
      {!unnamed && <span class="stufen-name">{st.name}</span>}
      <div class="stufen-raster">
        {st.values.map((w) => (
          <button
            type="button" key={w} class={`stufe ${value === w ? "aktiv" : ""}`} disabled={!l.usable}
            aria-pressed={value === w} onClick={() => l.set({ [name]: w })}
          >
            {text[w]}
          </button>
        ))}
      </div>
    </div>
  );
}
