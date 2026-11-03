// Impulse: Art wählen (Flash auf, Flash zu, Stoß, Glitzern) und auf dem Streifen auslösen –
// wie der Touchstreifen des Stream Decks: Tippen = von dort aus, Wischen = läuft in Wischrichtung
// durch (Tempo: Ausbreitung). Die Hüllkurve (Attack, Sustain, Release, Stärke) läuft danach von
// selbst ab.
import {
  ELEMENT_FOLGEN, ELEMENT_FOLGE_NAME, IMPULS_ARTEN, IMPULS_NAME, huellenWert, weich,
  type ImpulsEinstellung,
} from "@parrafraktor/engine";
import { IMPULS_BEREICHE, begrenzeImpuls, impulsWert, mitImpulsWert, zeigeImpuls, type ImpulsRegler } from "@parrafraktor/protokoll";
import { useEffect, useRef, useState } from "preact/hooks";
import { laden, useLaden } from "../laden.js";

export function Impulse() {
  const l = useLaden();
  const server = l.stand!.impuls;
  // Beim Ziehen gilt der lokale Entwurf, bis der Server ihn bestätigt hat
  const [entwurf, setEntwurf] = useState<ImpulsEinstellung | null>(null);
  const e = entwurf ?? server;
  const sendeTimer = useRef<number>();
  const setze = (neu: ImpulsEinstellung) => {
    setEntwurf(neu);
    window.clearTimeout(sendeTimer.current);
    sendeTimer.current = window.setTimeout(() => l.sende({ typ: "impulsEinstellung", einstellung: neu }), 16);
  };
  const fertig = () => window.setTimeout(() => setEntwurf(null), 800);
  const sofort = (neu: ImpulsEinstellung) => { setze(neu); fertig(); };

  return (
    <div class="impulse">
      <div class="impulse-spielen">
        <div class="arten">
          {IMPULS_ARTEN.map((a) => {
            const laeuft = l.stand?.impulse.some((i) => i.art === a) ?? false;
            return (
              <button
                type="button" key={a} disabled={!l.bedienbar}
                class={`art ${e.art === a ? "aktiv" : laeuft ? "laeuft" : ""}`}
                onClick={() => sofort({ ...e, art: a })}
              >
                {IMPULS_NAME[a]}
              </button>
            );
          })}
        </div>
        <Streifen name={IMPULS_NAME[e.art]} />
      </div>
      <div class="huelle-feld">
        <Huelle e={e} setze={setze} fertig={fertig} />
        <div class="huelle-werte">
          <span>Attack <b>{zeigeImpuls("attackS", e.huelle.attackS)}</b></span>
          <span>Sustain <b>{zeigeImpuls("sustainS", e.huelle.sustainS)}</b></span>
          <span>Release <b>{zeigeImpuls("releaseS", e.huelle.releaseS)}</b></span>
          <span>Stärke <b>{zeigeImpuls("staerke", e.huelle.staerke)}</b></span>
        </div>
        <div class="umschalter">
          {ELEMENT_FOLGEN.map((f) => (
            <button
              type="button" key={f} class={e.elementFolge === f ? "aktiv" : ""} disabled={!l.bedienbar}
              onClick={() => sofort({ ...e, elementFolge: f })}
            >
              {ELEMENT_FOLGE_NAME[f]}
            </button>
          ))}
        </div>
        {e.elementFolge !== "zusammen" && <Schieber name="elementVersatzS" e={e} setze={setze} fertig={fertig} />}
        <Schieber name="ausbreitungS" e={e} setze={setze} fertig={fertig} />
      </div>
    </div>
  );
}

function Schieber({ name, e, setze, fertig }: { name: ImpulsRegler } & HuelleProps) {
  const l = useLaden();
  const b = IMPULS_BEREICHE[name], w = impulsWert(e, name);
  return (
    <label class="zeile">
      <span class="name">{b.name}</span>
      <output>{zeigeImpuls(name, w)}</output>
      <input
        type="range" min={b.min} max={b.max} step={b.schritt} value={w} disabled={!l.bedienbar}
        style={{ "--fuellung": `${((w - b.min) / (b.max - b.min)) * 100}%` }}
        onInput={(ev) => setze(mitImpulsWert(e, name, Number((ev.currentTarget as HTMLInputElement).value)))}
        onChange={fertig}
      />
    </label>
  );
}

// ---------- Streifen ----------

const WISCHEN = 0.08;   // ab so viel Weg (Anteil der Breite) gilt es als Wischen

function Streifen({ name }: { name: string }) {
  const l = useLaden();
  const start = useRef<{ id: number; x: number } | null>(null);
  const [blitz, setBlitz] = useState<{ x: number; n: number } | null>(null);
  const anteil = (ev: PointerEvent) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  };
  const loesen = (ursprung: number) => {
    laden.sende({ typ: "impulsTippen", ursprung });
    setBlitz((b) => ({ x: ursprung, n: (b?.n ?? 0) + 1 }));
  };
  return (
    <div
      class={`streifen ${l.bedienbar ? "" : "gesperrt"}`}
      role="button"
      aria-label={`${name} von hier aus`}
      onPointerDown={(ev) => {
        if (!l.bedienbar) return;
        start.current = { id: ev.pointerId, x: anteil(ev) };
      }}
      onPointerUp={(ev) => {
        const s = start.current;
        if (!s || s.id !== ev.pointerId) return;
        start.current = null;
        const dx = anteil(ev) - s.x;
        // Tippen: von dort aus; Wischen: vom Rand in Wischrichtung
        loesen(Math.abs(dx) < WISCHEN ? s.x : dx > 0 ? 0 : 1);
      }}
      onPointerCancel={() => { start.current = null; }}
    >
      <span class="streifen-text">{name} · tippen oder wischen</span>
      {blitz && <span key={blitz.n} class="streifen-blitz" style={{ left: `${blitz.x * 100}%` }} />}
    </div>
  );
}



// ---------- Hüllkurve ----------

// Zeichenfläche: Attack, Sustain und Release nebeneinander, Zeiten wurzelförmig, damit kurze
// Zeiten fein einstellbar sind. Griffe: Attack/Stärke, Ende Sustain, Ende Release.
const B = 320, H = 120, RAND = 12;
const BREITE = B - 2 * RAND;
const BA = BREITE * 0.28, BS = BREITE * 0.24, BR = BREITE * 0.48;
const MAX = { attackS: IMPULS_BEREICHE.attackS.max, sustainS: IMPULS_BEREICHE.sustainS.max, releaseS: IMPULS_BEREICHE.releaseS.max };
const wurzel = (t: number, max: number) => Math.sqrt(Math.min(Math.max(t, 0), max) / max);
const y = (anteil: number) => RAND + (H - 2 * RAND) * (1 - anteil);
const xAttack = (t: number) => RAND + BA * wurzel(t, MAX.attackS);
const xSustain = (e: ImpulsEinstellung, t: number) => xAttack(e.huelle.attackS) + BS * wurzel(t, MAX.sustainS);
const xRelease = (e: ImpulsEinstellung, t: number) => xSustain(e, e.huelle.sustainS) + BR * wurzel(t, MAX.releaseS);

// Lage auf der Zeitachse für t Sekunden seit dem Start
function xZeit(e: ImpulsEinstellung, t: number): number {
  const { attackS: a, sustainS: s } = e.huelle;
  if (t < a) return xAttack(t);
  if (t < a + s) return xSustain(e, t - a);
  return xRelease(e, t - a - s);
}

function kurve(e: ImpulsEinstellung): string {
  const { attackS: a, sustainS: s, releaseS: r, staerke } = e.huelle;
  const st = staerke / 100;
  const punkte: string[] = [`${RAND},${y(0)}`];
  for (let n = 1; n <= 24; n++) {
    const t = (a * n) / 24;
    punkte.push(`${xAttack(t)},${y(st * (a > 0 ? weich(t / a) : 1))}`);
  }
  punkte.push(`${xSustain(e, s)},${y(st)}`);
  for (let n = 1; n <= 24; n++) {
    const t = (r * n) / 24;
    punkte.push(`${xRelease(e, t)},${y(st * (r > 0 ? 1 - weich(t / r) : 0))}`);
  }
  punkte.push(`${B - RAND},${y(0)}`);
  return "M" + punkte.join(" L");
}

interface HuelleProps {
  e: ImpulsEinstellung;
  setze: (e: ImpulsEinstellung) => void;
  fertig: () => void;
}

type Griff = "attack" | "sustain" | "release";

function Huelle({ e, setze, fertig }: HuelleProps) {
  const l = useLaden();
  const svg = useRef<SVGSVGElement>(null);
  const marke = useRef<SVGCircleElement>(null);
  const griff = useRef<Griff | null>(null);
  const eRef = useRef(e);
  eRef.current = e;

  // Punkt, der beim zuletzt gestarteten Impuls auf der Kurve mitläuft (vorderstes Element)
  useEffect(() => {
    let bild = 0;
    const schleife = () => {
      const m = marke.current, st = laden.stand;
      const i = st?.impulse[st.impulse.length - 1];
      const ee = eRef.current, h = ee.huelle;
      const t = i ? i.alterS + (performance.now() - laden.standZeit) / 1000 : 0;
      if (m && i && t > 0 && t < h.attackS + h.sustainS + h.releaseS) {
        m.setAttribute("cx", String(xZeit(ee, t)));
        m.setAttribute("cy", String(y(huellenWert(h, t) * (h.staerke / 100))));
        m.style.opacity = "1";
      } else if (m) {
        m.style.opacity = "0";
      }
      bild = requestAnimationFrame(schleife);
    };
    bild = requestAnimationFrame(schleife);
    return () => cancelAnimationFrame(bild);
  }, []);

  const punkt = (ev: PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * B, ((ev.clientY - r.top) / r.height) * H];
  };
  // Zeit aus der Lage innerhalb eines Abschnitts (Umkehrung der Wurzel)
  const zeit = (px: number, von: number, breite: number, max: number) => {
    const anteil = Math.min(1, Math.max(0, (px - von) / breite));
    return max * anteil * anteil;
  };
  const ziehe = (ev: PointerEvent) => {
    if (!griff.current) return;
    const [px, py] = punkt(ev);
    const ee = eRef.current, h = ee.huelle;
    if (griff.current === "attack") {
      const staerke = Math.min(1, Math.max(0, 1 - (py - RAND) / (H - 2 * RAND))) * 100;
      setze({ ...ee, huelle: {
        ...h,
        attackS: begrenzeImpuls("attackS", zeit(px, RAND, BA, MAX.attackS)),
        staerke: begrenzeImpuls("staerke", staerke),
      } });
    } else if (griff.current === "sustain") {
      setze({ ...ee, huelle: { ...h, sustainS: begrenzeImpuls("sustainS", zeit(px, xAttack(h.attackS), BS, MAX.sustainS)) } });
    } else {
      setze({ ...ee, huelle: { ...h, releaseS: begrenzeImpuls("releaseS", zeit(px, xSustain(ee, h.sustainS), BR, MAX.releaseS)) } });
    }
  };

  const ax = xAttack(e.huelle.attackS), ay = y(e.huelle.staerke / 100);
  const sx = xSustain(e, e.huelle.sustainS);
  const rx = xRelease(e, e.huelle.releaseS), ry = y(0);
  const griffe: [Griff, number, number][] = [["attack", ax, ay], ["sustain", sx, ay], ["release", rx, ry]];
  return (
    <svg
      ref={svg}
      class={`huelle ${l.bedienbar ? "" : "gesperrt"}`}
      viewBox={`0 0 ${B} ${H}`}
      role="img"
      aria-label="Hüllkurve: Attack, Sustain, Release"
      onPointerDown={(ev) => {
        if (!l.bedienbar) return;
        const [px, py] = punkt(ev);
        // nächsten Griff nehmen
        griff.current = griffe.reduce((a, b) => (Math.hypot(px - b[1], py - b[2]) < Math.hypot(px - a[1], py - a[2]) ? b : a))[0];
        (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
        ziehe(ev);
      }}
      onPointerMove={ziehe}
      onPointerUp={() => { griff.current = null; fertig(); }}
      onPointerCancel={() => { griff.current = null; fertig(); }}
    >
      <line class="huelle-achse" x1={RAND} y1={y(0)} x2={B - RAND} y2={y(0)} />
      <line class="huelle-hold" x1={ax} y1={RAND} x2={ax} y2={y(0)} />
      <line class="huelle-hold" x1={sx} y1={RAND} x2={sx} y2={y(0)} />
      <text class="huelle-text" x={(ax + sx) / 2} y={H - 2}>Sustain</text>
      <path class="huelle-kurve" d={kurve(e)} />
      {griffe.map(([name, gx, gy]) => <circle key={name} class="huelle-griff" cx={gx} cy={gy} r={7} />)}
      <circle ref={marke} class="huelle-marke" r={5} cx={RAND} cy={y(0)} />
    </svg>
  );
}
