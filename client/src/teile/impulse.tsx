// Impulse: Flash-Pads zum Live-Spielen und die Hüllkurve (Attack, Hold, Release, Stärke).
// Pads reagieren wie Flash-Tasten am Pult: drücken fährt hin, halten bleibt, loslassen fährt zurück.
// Mehrere Finger gleichzeitig gehen. Verliert die App die Verbindung, lässt der Server los.
// Der Streifen darunter wirkt wie der Touchstreifen des Stream Decks: Tippen = Flash von dort aus,
// Wischen = Flash läuft in Wischrichtung durch (ohne Halten). Tempo: Ausbreitung.
import {
  ELEMENT_FOLGEN, ELEMENT_FOLGE_NAME, IMPULS_NAME, IMPULS_ZIELE, huellenWert, weich,
  type ImpulsEinstellung, type ImpulsZiel,
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

  return (
    <div class="impulse">
      <div class="impulse-spielen">
        <div class="pads">
          {IMPULS_ZIELE.map((z) => <Pad key={z} ziel={z} />)}
        </div>
        <Streifen />
      </div>
      <div class="huelle-feld">
        <Huelle e={e} setze={setze} fertig={fertig} />
        <div class="huelle-werte">
          <span>Attack <b>{zeigeImpuls("attackS", e.huelle.attackS)}</b></span>
          <span>Release <b>{zeigeImpuls("releaseS", e.huelle.releaseS)}</b></span>
          <span>Stärke <b>{zeigeImpuls("staerke", e.huelle.staerke)}</b></span>
        </div>
        <div class="umschalter">
          {ELEMENT_FOLGEN.map((f) => (
            <button
              type="button" key={f} class={e.elementFolge === f ? "aktiv" : ""} disabled={!l.bedienbar}
              onClick={() => { setze({ ...e, elementFolge: f }); fertig(); }}
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

function Streifen() {
  const l = useLaden();
  const [ziel, setZiel] = useState<ImpulsZiel>("auf");
  const start = useRef<{ id: number; x: number } | null>(null);
  const [blitz, setBlitz] = useState<{ x: number; n: number } | null>(null);
  const anteil = (ev: PointerEvent) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  };
  const loesen = (ursprung: number, zeigen: number) => {
    laden.sende({ typ: "impulsTippen", ziel, ursprung });
    setBlitz((b) => ({ x: zeigen, n: (b?.n ?? 0) + 1 }));
  };
  return (
    <div class="streifen-feld">
      <div
        class={`streifen ${l.bedienbar ? "" : "gesperrt"}`}
        role="button"
        aria-label={`Streifen: ${IMPULS_NAME[ziel]} von hier aus`}
        onPointerDown={(ev) => {
          if (!l.bedienbar) return;
          start.current = { id: ev.pointerId, x: anteil(ev) };
        }}
        onPointerUp={(ev) => {
          const s = start.current;
          if (!s || s.id !== ev.pointerId) return;
          start.current = null;
          const x = anteil(ev), dx = x - s.x;
          if (Math.abs(dx) < WISCHEN) loesen(s.x, s.x);
          else loesen(dx > 0 ? 0 : 1, dx > 0 ? 0 : 1);   // vom Rand in Wischrichtung
        }}
        onPointerCancel={() => { start.current = null; }}
      >
        <span class="streifen-text">tippen oder wischen</span>
        {blitz && <span key={blitz.n} class="streifen-blitz" style={{ left: `${blitz.x * 100}%` }} />}
      </div>
      <div class="umschalter">
        {IMPULS_ZIELE.map((z) => (
          <button type="button" key={z} class={ziel === z ? "aktiv" : ""} onClick={() => setZiel(z)}>
            {IMPULS_NAME[z]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Pad ----------

function Pad({ ziel }: { ziel: ImpulsZiel }) {
  const l = useLaden();
  const [gedrueckt, setGedrueckt] = useState(false);
  const halten = useRef(false);
  const los = () => {
    if (!halten.current) return;
    halten.current = false;
    setGedrueckt(false);
    laden.sende({ typ: "impuls", ziel, gedrueckt: false });
  };
  // App geht in den Hintergrund (iPad gesperrt): sicherheitshalber loslassen
  useEffect(() => {
    const weg = () => { if (document.visibilityState !== "visible") los(); };
    document.addEventListener("visibilitychange", weg);
    return () => document.removeEventListener("visibilitychange", weg);
  }, []);
  const laeuft = l.stand?.impulse.some((i) => i.ziel === ziel) ?? false;
  return (
    <button
      type="button"
      class={`pad ${gedrueckt ? "gedrueckt" : laeuft ? "laeuft" : ""}`}
      disabled={!l.bedienbar}
      onPointerDown={(ev) => {
        try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch { /* Finger schon weg */ }
        halten.current = true;
        setGedrueckt(true);
        laden.sende({ typ: "impuls", ziel, gedrueckt: true });
      }}
      onPointerUp={los}
      onPointerCancel={los}
      onLostPointerCapture={los}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      {IMPULS_NAME[ziel]}
    </button>
  );
}

// ---------- Hüllkurve ----------

// Zeichenfläche: Attack links, Hold (Dauer = solange gedrückt) fest in der Mitte, Release rechts.
// Zeiten wurzelförmig, damit kurze Zeiten fein einstellbar sind.
const B = 320, H = 120, RAND = 12;
const BA = (B - 2 * RAND) * 0.3, BH = (B - 2 * RAND) * 0.16, BR = (B - 2 * RAND) * 0.54;
const ATTACK_MAX = IMPULS_BEREICHE.attackS.max, RELEASE_MAX = IMPULS_BEREICHE.releaseS.max;
const y = (anteil: number) => RAND + (H - 2 * RAND) * (1 - anteil);
const xAttack = (t: number) => RAND + BA * Math.sqrt(Math.min(t, ATTACK_MAX) / ATTACK_MAX);
const holdEnde = (e: ImpulsEinstellung) => xAttack(e.huelle.attackS) + BH;
const xRelease = (e: ImpulsEinstellung, t: number) => holdEnde(e) + BR * Math.sqrt(Math.min(t, RELEASE_MAX) / RELEASE_MAX);

function kurve(e: ImpulsEinstellung): string {
  const { attackS: a, releaseS: r, staerke } = e.huelle;
  const s = staerke / 100;
  const punkte: string[] = [`${RAND},${y(0)}`];
  for (let n = 1; n <= 24; n++) {
    const t = (a * n) / 24;
    punkte.push(`${xAttack(t)},${y(s * (a > 0 ? weich(t / a) : 1))}`);
  }
  punkte.push(`${holdEnde(e)},${y(s)}`);
  for (let n = 1; n <= 24; n++) {
    const t = (r * n) / 24;
    punkte.push(`${xRelease(e, t)},${y(s * (r > 0 ? 1 - weich(t / r) : 0))}`);
  }
  punkte.push(`${B - RAND},${y(0)}`);
  return "M" + punkte.join(" L");
}

interface HuelleProps {
  e: ImpulsEinstellung;
  setze: (e: ImpulsEinstellung) => void;
  fertig: () => void;
}

function Huelle({ e, setze, fertig }: HuelleProps) {
  const l = useLaden();
  const svg = useRef<SVGSVGElement>(null);
  const marke = useRef<SVGCircleElement>(null);
  const griff = useRef<"attack" | "release" | null>(null);
  const eRef = useRef(e);
  eRef.current = e;

  // Punkt, der beim zuletzt gedrückten Impuls auf der Kurve mitläuft (vorderstes Element)
  useEffect(() => {
    let bild = 0;
    const schleife = () => {
      const m = marke.current, st = laden.stand;
      const i = st?.impulse[st.impulse.length - 1];
      if (m && st && i) {
        const ee = eRef.current, h = ee.huelle;
        const t = i.alterS + (performance.now() - laden.standZeit) / 1000;
        const wert = huellenWert(h, t, i.losS) * (h.staerke / 100);
        const x = i.losS === null || t < i.losS
          ? (t < h.attackS ? xAttack(t) : xAttack(h.attackS) + BH / 2)
          : xRelease(ee, t - i.losS);
        m.setAttribute("cx", String(x));
        m.setAttribute("cy", String(y(wert)));
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
  const ziehe = (ev: PointerEvent) => {
    if (!griff.current) return;
    const [px, py] = punkt(ev);
    const ee = eRef.current;
    if (griff.current === "attack") {
      const anteil = Math.min(1, Math.max(0, (px - RAND) / BA));
      const staerke = Math.min(1, Math.max(0, 1 - (py - RAND) / (H - 2 * RAND))) * 100;
      setze({ ...ee, huelle: {
        ...ee.huelle,
        attackS: begrenzeImpuls("attackS", ATTACK_MAX * anteil * anteil),
        staerke: begrenzeImpuls("staerke", staerke),
      } });
    } else {
      const anteil = Math.min(1, Math.max(0, (px - holdEnde(ee)) / BR));
      setze({ ...ee, huelle: { ...ee.huelle, releaseS: begrenzeImpuls("releaseS", RELEASE_MAX * anteil * anteil) } });
    }
  };

  const ax = xAttack(e.huelle.attackS), ay = y(e.huelle.staerke / 100);
  const rx = xRelease(e, e.huelle.releaseS), ry = y(0);
  return (
    <svg
      ref={svg}
      class={`huelle ${l.bedienbar ? "" : "gesperrt"}`}
      viewBox={`0 0 ${B} ${H}`}
      role="img"
      aria-label="Hüllkurve: Attack, Hold, Release"
      onPointerDown={(ev) => {
        if (!l.bedienbar) return;
        const [px, py] = punkt(ev);
        // näheren Griff nehmen
        griff.current = Math.hypot(px - ax, py - ay) <= Math.hypot(px - rx, py - ry) ? "attack" : "release";
        (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
        ziehe(ev);
      }}
      onPointerMove={ziehe}
      onPointerUp={() => { griff.current = null; fertig(); }}
      onPointerCancel={() => { griff.current = null; fertig(); }}
    >
      <line class="huelle-achse" x1={RAND} y1={y(0)} x2={B - RAND} y2={y(0)} />
      <line class="huelle-hold" x1={ax} y1={RAND} x2={ax} y2={y(0)} />
      <line class="huelle-hold" x1={holdEnde(e)} y1={RAND} x2={holdEnde(e)} y2={y(0)} />
      <text class="huelle-text" x={(ax + holdEnde(e)) / 2} y={H - 2}>halten</text>
      <path class="huelle-kurve" d={kurve(e)} />
      <circle class="huelle-griff" cx={ax} cy={ay} r={7} />
      <circle class="huelle-griff" cx={rx} cy={ry} r={7} />
      <circle ref={marke} class="huelle-marke" r={5} cx={RAND} cy={y(0)} />
    </svg>
  );
}
