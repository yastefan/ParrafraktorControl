// Look-Presets: Tippen ruft ab (weiche Überblendung), Halten speichert den aktuellen Look.
// Im Bearbeiten-Modus lassen sich Presets umbenennen und löschen.
// Auto fährt die ausgewählten Presets ab; Auswahl und Zeiten gibt es unter „Auswahl“. Solange Auto
// läuft, leuchtet der Rahmen des Moduls.
import { useRef, useState } from "preact/hooks";
import { AUTO_BEREICHE, PRESET_NAME_MAX, type Preset } from "@parrafraktor/protokoll";
import { useLaden } from "../laden.js";
import { Modul } from "./modul.js";

const SPEICHERN_HALTEN_MS = 800;

const zeigeZeit = (s: number): string =>
  s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} min` : `${Math.round(s)} s`;

export function Presets() {
  const l = useLaden();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [auswahl, setAuswahl] = useState(false);
  const stand = l.stand;
  if (!stand) return null;
  const auto = stand.auto;
  const startbar = stand.presets.filter((p, nr) => p && auto.auswahl[nr]).length >= 2;
  const hinweis = auto.an ? `Auto · noch ${zeigeZeit(Math.max(0, auto.restS))}`
    : bearbeiten ? "Tippen: umbenennen"
    : auswahl ? "Tippen: läuft in Auto mit oder nicht"
    : "Tippen: abrufen · Halten: speichern";
  return (
    <Modul
      titel={auto.an ? "02 Presets // Auto" : "02 Presets"}
      klasse={`m-presets ${auto.an ? "auto-an" : ""}`}
      aktionen={(
        <>
          <span class={`modul-hinweis ${auto.an ? "auto-hinweis" : ""}`}>{hinweis}</span>
          <button
            type="button" class={`aktion haken ${auto.an ? "aktiv" : ""}`} aria-pressed={auto.an}
            disabled={!l.bedienbar || (!auto.an && !startbar)}
            title={startbar ? "Ausgewählte Presets abfahren" : "Mindestens zwei Presets auswählen"}
            onClick={() => l.sende({ typ: "auto", an: !auto.an })}
          >
            Auto
          </button>
          <button
            type="button" class={`aktion ${auswahl ? "aktiv" : ""}`}
            onClick={() => { setAuswahl(!auswahl); setBearbeiten(false); }}
          >
            {auswahl ? "Fertig" : "Auswahl"}
          </button>
          <button
            type="button" class={`aktion ${bearbeiten ? "aktiv" : ""}`}
            onClick={() => { setBearbeiten(!bearbeiten); setAuswahl(false); }}
          >
            {bearbeiten ? "Fertig" : "Bearbeiten"}
          </button>
        </>
      )}
    >
      <div class="presets-raster">
        {stand.presets.map((p, nr) => (
          <PresetPlatz
            key={nr} nr={nr} preset={p} bearbeiten={bearbeiten}
            aktiv={stand.letztesPreset === nr} bedienbar={l.bedienbar}
            auswaehlen={auswahl} zeigeAuswahl={auswahl || auto.an} gewaehlt={auto.auswahl[nr] === true}
          />
        ))}
      </div>
      {(auswahl || auto.an) && (
        <div class="auto-regler">
          <AutoRegler name="Halten" feld="halteS" wert={auto.halteS} />
          <AutoRegler name="Überblenden" feld="blendeS" wert={auto.blendeS} />
        </div>
      )}
    </Modul>
  );
}

function AutoRegler({ name, feld, wert }: { name: string; feld: "halteS" | "blendeS"; wert: number }) {
  const l = useLaden();
  // Beim Ziehen zählt der eigene Wert, damit ein älterer Stand den Griff nicht zurückspringen lässt
  const [zieht, setZieht] = useState<number | null>(null);
  const b = AUTO_BEREICHE[feld];
  const w = zieht ?? wert;
  return (
    <label class="band-regler">
      <span class="name">{name}</span>
      <input
        type="range" min={b.min} max={b.max} step={b.schritt} value={w} disabled={!l.bedienbar}
        style={{ "--fuellung": `${((w - b.min) / (b.max - b.min)) * 100}%` }}
        onInput={(ev) => {
          const neu = Number(ev.currentTarget.value);
          setZieht(neu);
          l.sende({ typ: "autoEinstellung", einstellung: { [feld]: neu } });
        }}
        onChange={() => setZieht(null)}
      />
      <output>{zeigeZeit(w)}</output>
    </label>
  );
}

interface Props {
  nr: number;
  preset: Preset | null;
  aktiv: boolean;
  bearbeiten: boolean;
  bedienbar: boolean;
  auswaehlen: boolean;     // Tippen wählt für Auto aus, statt abzurufen
  zeigeAuswahl: boolean;
  gewaehlt: boolean;
}

function PresetPlatz({ nr, preset, aktiv, bearbeiten, bedienbar, auswaehlen, zeigeAuswahl, gewaehlt }: Props) {
  const l = useLaden();
  const timer = useRef<number>();
  const gespeichert = useRef(false);
  const [haelt, setHaelt] = useState(false);

  if (bearbeiten) {
    return (
      <div class={`preset bearbeiten ${preset ? "" : "leer"}`}>
        <button
          type="button" class="preset-name" disabled={!preset || !bedienbar}
          onClick={() => {
            const name = window.prompt(`Name für Preset ${nr + 1}`, preset?.name ?? "");
            if (name?.trim()) l.sende({ typ: "preset", aktion: "umbenennen", nr, name: name.trim().slice(0, PRESET_NAME_MAX) });
          }}
        >
          <span class="nr">P{String(nr + 1).padStart(2, "0")}</span>
          {preset?.name ?? "–"}
        </button>
        {preset && (
          <button
            type="button" class="preset-loeschen" disabled={!bedienbar} aria-label={`Preset ${nr + 1} löschen`}
            onClick={() => { if (window.confirm(`Preset „${preset.name}“ löschen?`)) l.sende({ typ: "preset", aktion: "loeschen", nr }); }}
          >
            ×
          </button>
        )}
      </div>
    );
  }

  const mitAuto = zeigeAuswahl && preset ? (gewaehlt ? "gewaehlt" : "abgewaehlt") : "";
  if (auswaehlen) {
    return (
      <button
        type="button" class={`preset ${preset ? "" : "leer"} ${aktiv ? "aktiv" : ""} ${mitAuto}`} disabled={!preset || !bedienbar}
        aria-pressed={gewaehlt}
        onClick={() => {
          const liste = [...(l.stand?.auto.auswahl ?? [])];
          liste[nr] = !gewaehlt;
          l.sende({ typ: "autoEinstellung", einstellung: { auswahl: liste } });
        }}
      >
        <span class="nr">P{String(nr + 1).padStart(2, "0")}</span>
        <span class="preset-titel">{preset?.name ?? "–"}</span>
      </button>
    );
  }

  const los = (abrufen: boolean) => {
    window.clearTimeout(timer.current);
    setHaelt(false);
    if (abrufen && !gespeichert.current && preset) l.sende({ typ: "preset", aktion: "abrufen", nr });
  };
  return (
    <button
      type="button"
      class={`preset halt-preset ${preset ? "" : "leer"} ${aktiv ? "aktiv" : ""} ${haelt ? "haelt" : ""} ${mitAuto}`}
      style={{ "--dauer": `${SPEICHERN_HALTEN_MS}ms` }}
      disabled={!bedienbar}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        gespeichert.current = false;
        setHaelt(true);
        timer.current = window.setTimeout(() => {
          gespeichert.current = true;
          setHaelt(false);
          l.sende({ typ: "preset", aktion: "speichern", nr });
        }, SPEICHERN_HALTEN_MS);
      }}
      onPointerUp={() => los(true)}
      onPointerCancel={() => los(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class="nr">P{String(nr + 1).padStart(2, "0")}</span>
      <span class="preset-titel">{preset?.name ?? "–"}</span>
    </button>
  );
}
