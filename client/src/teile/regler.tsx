// Regler der Grundbewegung: Bewegung (Fader) und Verteilung (Umschalter). Bereiche kommen aus dem
// Protokoll, damit Client, Stream Deck und später MIDI dieselben Grenzen haben. Regler, die die
// gewählte Grundbewegung nicht benutzt, sind ausgeblendet.
import { ELEMENTE, type Parameter } from "@parrafraktor/engine";
import {
  BEREICHE, SCHALTER, STUFEN, ZAHL_PARAMETER, begrenze, benutzt, zeigeWert,
  type SchalterParameter, type StufenParameter, type ZahlParameter,
} from "@parrafraktor/protokoll";
import type { ComponentChildren } from "preact";
import { useLaden } from "../laden.js";
import { Fader } from "./fader.js";
import { Modul } from "./modul.js";

const OEFFNUNG_FOLGE: ZahlParameter[] = ["groesse", "weite", "speedVon", "kante", "wabern", "nachlauf"];

export function Bewegung({ parameter: p }: { parameter: Parameter }) {
  const namen = p.modus === "oeffnung"
    ? OEFFNUNG_FOLGE
    : ZAHL_PARAMETER.filter((n) => n !== "offset" && benutzt(p.modus, n));
  // Bei Offset je Element wird es eng: dann die kurzen Namen
  const dicht = p.offsetGetrennt && benutzt(p.modus, "offset");
  return (
    <Modul titel="03 Bewegung" klasse="m-bewegung">
      <div class={`bank ${dicht ? "dicht" : ""}`}>
        {benutzt(p.modus, "offset") && <Offset p={p} />}
        {namen.map((name) => <ZahlFader key={name} name={name} wert={p[name]} titel={dicht ? BEREICHE[name].kurz : undefined} />)}
      </div>
    </Modul>
  );
}

// Stufen und Schalter, die die Grundbewegung benutzt; bei Ruhe gibt es keine
const stufenVon = (p: Parameter) => (Object.keys(STUFEN) as StufenParameter[]).filter((n) => benutzt(p.modus, n));
const schalterVon = (p: Parameter) => (Object.keys(SCHALTER) as SchalterParameter[]).filter((n) => benutzt(p.modus, n));
export const hatVerteilung = (p: Parameter): boolean => stufenVon(p).length + schalterVon(p).length > 0;

export function Verteilung({ parameter: p }: { parameter: Parameter }) {
  const l = useLaden();
  const oeffnung = p.modus === "oeffnung";
  const schalter = schalterVon(p);
  return (
    <Modul titel={oeffnung ? "04 Bahn" : "04 Verteilung"} klasse={`m-verteilung ${oeffnung ? "nur-bahn" : ""}`}>
      <div class="verteilung">
        {stufenVon(p).map((name) => <Stufen key={name} name={name} wert={p[name]} ohneName={oeffnung} />)}
        {schalter.length > 0 && (
          <div class="schalter-reihe">
            {schalter.map((name) => (
              <button
                type="button" key={name} class={`stufe ${p[name] ? "aktiv" : ""}`} disabled={!l.bedienbar}
                aria-pressed={p[name]} onClick={() => l.setze({ [name]: !p[name] })}
              >
                {SCHALTER[name]}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modul>
  );
}

// Offset: einer für alle, oder je Element drei Fader
function Offset({ p }: { p: Parameter }) {
  const l = useLaden();
  const schloss: ComponentChildren = (
    <button
      type="button"
      class={`schloss ${p.offsetGetrennt ? "offen" : ""}`}
      disabled={!l.bedienbar}
      aria-label={p.offsetGetrennt ? "Offset für alle Elemente gleich" : "Offset je Element"}
      title={p.offsetGetrennt ? "für alle gleich" : "je Element"}
      onClick={() => l.setze(p.offsetGetrennt
        ? { offsetGetrennt: false }
        // Öffnen: alle Elemente starten beim gemeinsamen Offset
        : { offsetGetrennt: true, offsetElemente: Array.from({ length: ELEMENTE }, () => p.offset) })}
    >
      {p.offsetGetrennt ? "1×" : "3×"}
    </button>
  );
  if (!p.offsetGetrennt) return <ZahlFader name="offset" wert={p.offset} zusatz={schloss} />;
  return (
    <>
      {p.offsetElemente.map((w, k) => (
        <ZahlFader
          key={k} name="offset" wert={w} titel={`Off. ${k + 1}`}
          zusatz={k === 0 ? schloss : undefined}
          setze={(v) => l.setze({ offsetElemente: p.offsetElemente.map((x, i) => (i === k ? v : x)) })}
        />
      ))}
    </>
  );
}

interface ZahlProps {
  name: ZahlParameter;
  wert: number;
  titel?: string;
  zusatz?: ComponentChildren;
  setze?: (wert: number) => void;
}

function ZahlFader({ name, wert, titel, zusatz, setze }: ZahlProps) {
  const l = useLaden();
  const b = BEREICHE[name];
  return (
    <Fader
      titel={titel ?? b.name} wert={wert} min={b.min} max={b.max} schritt={b.schritt}
      anzeige={zeigeWert(name, wert)} gesperrt={!l.bedienbar} zusatz={zusatz}
      setze={setze ?? ((v) => l.setze({ [name]: v }))}
      vorgabe={() => (setze ? setze(begrenze(name, b.min + (b.max - b.min) / 2)) : l.sende({ typ: "vorgabe", name }))}
    />
  );
}

function Stufen({ name, wert, ohneName }: { name: StufenParameter; wert: string; ohneName?: boolean }) {
  const l = useLaden();
  const st = STUFEN[name];
  const text = st.text as Record<string, string>;
  return (
    <div class={`stufen stufen-${name}`}>
      {!ohneName && <span class="stufen-name">{st.name}</span>}
      <div class="stufen-raster">
        {st.werte.map((w) => (
          <button
            type="button" key={w} class={`stufe ${wert === w ? "aktiv" : ""}`} disabled={!l.bedienbar}
            aria-pressed={wert === w} onClick={() => l.setze({ [name]: w })}
          >
            {text[w]}
          </button>
        ))}
      </div>
    </div>
  );
}
