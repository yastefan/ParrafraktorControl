// Schieberegler für die Pattern-Parameter. Bereiche kommen aus dem Protokoll, damit Client,
// Stream Deck und später MIDI dieselben Grenzen haben. Doppeltippen auf den Namen setzt den Vorgabewert.
// Regler, die die gewählte Grundbewegung nicht benutzt, sind ausgeblendet.
import { ELEMENTE, type Parameter } from "@parrafraktor/engine";
import {
  BEREICHE, SCHALTER, STUFEN, ZAHL_PARAMETER, begrenze, benutzt, zeigeWert,
  type SchalterParameter, type StufenParameter, type ZahlParameter,
} from "@parrafraktor/protokoll";
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { useLaden } from "../laden.js";

export function Regler({ parameter: p }: { parameter: Parameter }) {
  const l = useLaden();
  return (
    <div class="regler">
      <Offset p={p} />
      {ZAHL_PARAMETER.filter((n) => n !== "offset" && benutzt(p.modus, n)).map((name) => (
        <Schieber key={name} name={name} wert={p[name]} />
      ))}
      <h3 class="regler-titel">Verteilung</h3>
      {(Object.keys(STUFEN) as StufenParameter[]).map((name) => (
        <Stufen key={name} name={name} wert={p[name]} />
      ))}
      <div class="zeile schalter-zeile">
        {(Object.keys(SCHALTER) as SchalterParameter[]).filter((n) => benutzt(p.modus, n)).map((name) => (
          <button
            type="button" key={name} class={`knopf klein ${p[name] ? "an" : ""}`} disabled={!l.bedienbar}
            onClick={() => l.setze({ [name]: !p[name] })}
          >
            {SCHALTER[name]} {p[name] ? "an" : "aus"}
          </button>
        ))}
      </div>
    </div>
  );
}

// Offset: einer für alle, oder mit offenem Schloss je Element
function Offset({ p }: { p: Parameter }) {
  const l = useLaden();
  const schloss = (
    <button
      type="button"
      class={`schloss ${p.offsetGetrennt ? "offen" : ""}`}
      disabled={!l.bedienbar}
      aria-label={p.offsetGetrennt ? "Offset für alle Elemente gleich" : "Offset je Element"}
      title={p.offsetGetrennt ? "für alle gleich" : "je Element"}
      onClick={() => l.setze(p.offsetGetrennt
        ? { offsetGetrennt: false }
        // Schloss öffnen: alle Elemente starten beim gemeinsamen Offset
        : { offsetGetrennt: true, offsetElemente: Array.from({ length: ELEMENTE }, () => p.offset) })}
    >
      {p.offsetGetrennt ? "🔓" : "🔒"}
    </button>
  );
  if (!p.offsetGetrennt) return <Schieber name="offset" wert={p.offset} zusatz={schloss} />;
  return (
    <>
      {p.offsetElemente.map((w, k) => (
        <Schieber
          key={k} name="offset" wert={w} titel={`Offset Element ${k + 1}${k === 0 ? " (vorn)" : ""}`}
          zusatz={k === 0 ? schloss : undefined}
          setze={(v) => l.setze({ offsetElemente: p.offsetElemente.map((x, i) => (i === k ? v : x)) })}
        />
      ))}
    </>
  );
}

function Stufen({ name, wert }: { name: StufenParameter; wert: string }) {
  const l = useLaden();
  const st = STUFEN[name];
  const text = st.text as Record<string, string>;
  return (
    <div class="zeile">
      <span class="name">{st.name}</span>
      <div class="umschalter umbrechen">
        {st.werte.map((w) => (
          <button
            type="button" key={w} class={wert === w ? "aktiv" : ""} disabled={!l.bedienbar}
            onClick={() => l.setze({ [name]: w })}
          >
            {text[w]}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SchieberProps {
  name: ZahlParameter;
  wert: number;
  titel?: string;
  zusatz?: ComponentChildren;
  setze?: (wert: number) => void;
}

function Schieber({ name, wert, titel, zusatz, setze }: SchieberProps) {
  const l = useLaden();
  const b = BEREICHE[name];
  const fuellung = ((wert - b.min) / (b.max - b.min)) * 100;
  const neu = setze ?? ((v: number) => l.setze({ [name]: v }));
  // Doppeltippen selbst erkennen: iOS meldet dblclick nicht zuverlässig
  const letztesTippen = useRef(0);
  const tippe = () => {
    const jetzt = Date.now();
    if (jetzt - letztesTippen.current < 350) {
      if (setze) setze(begrenze(name, b.min + (b.max - b.min) / 2));
      else l.sende({ typ: "vorgabe", name });
    }
    letztesTippen.current = jetzt;
  };
  return (
    <label class="zeile">
      <span class="name">
        <span onClick={tippe} title="Doppeltippen: Vorgabewert">{titel ?? b.name}</span> {zusatz}
      </span>
      <output>{zeigeWert(name, wert)}</output>
      <input
        type="range"
        min={b.min}
        max={b.max}
        step={b.schritt}
        value={wert}
        style={{ "--fuellung": `${fuellung}%` }}
        disabled={!l.bedienbar}
        onInput={(e) => neu(Number((e.currentTarget as HTMLInputElement).value))}
      />
    </label>
  );
}
