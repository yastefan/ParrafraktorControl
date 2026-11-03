// Schieberegler für die Pattern-Parameter. Bereiche kommen aus dem Protokoll, damit Client,
// Stream Deck und später MIDI dieselben Grenzen haben. Doppeltippen auf den Namen setzt den Vorgabewert.
import type { Parameter } from "@parrafraktor/engine";
import { BEREICHE, STUFEN, ZAHL_PARAMETER, zeigeWert, type StufenParameter, type ZahlParameter } from "@parrafraktor/protokoll";
import { useRef } from "preact/hooks";
import { useLaden } from "../laden.js";

export function Regler({ parameter }: { parameter: Parameter }) {
  const l = useLaden();
  return (
    <div class="regler">
      {ZAHL_PARAMETER.map((name) => (
        <Schieber key={name} name={name} wert={parameter[name]} />
      ))}
      {(Object.keys(STUFEN) as StufenParameter[]).map((name) => (
        <Stufen key={name} name={name} wert={parameter[name]} />
      ))}
      <div class="zeile">
        <span class="name">Reihenfolge</span>
        <div class="umschalter">
          {([false, true] as const).map((je) => (
            <button
              type="button"
              key={String(je)}
              class={parameter.jeElement === je ? "aktiv" : ""}
              disabled={!l.bedienbar}
              onClick={() => l.setze({ jeElement: je })}
            >
              {je ? "je Element" : "alle 36"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stufen({ name, wert }: { name: StufenParameter; wert: string }) {
  const l = useLaden();
  const st = STUFEN[name];
  const text = st.text as Record<string, string>;
  return (
    <div class="zeile">
      <span class="name">{st.name}</span>
      <div class="umschalter">
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

function Schieber({ name, wert }: { name: ZahlParameter; wert: number }) {
  const l = useLaden();
  const b = BEREICHE[name];
  const fuellung = ((wert - b.min) / (b.max - b.min)) * 100;
  // Doppeltippen selbst erkennen: iOS meldet dblclick nicht zuverlässig
  const letztesTippen = useRef(0);
  const tippe = () => {
    const jetzt = Date.now();
    if (jetzt - letztesTippen.current < 350) l.sende({ typ: "vorgabe", name });
    letztesTippen.current = jetzt;
  };
  return (
    <label class="zeile">
      <span class="name" onClick={tippe} title="Doppeltippen: Vorgabewert">
        {b.name}
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
        onInput={(e) => l.setze({ [name]: Number((e.currentTarget as HTMLInputElement).value) })}
      />
    </label>
  );
}
