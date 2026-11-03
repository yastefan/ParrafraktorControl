// Look-Presets: Tippen ruft ab (weiche Überblendung), Halten speichert den aktuellen Look.
// Im Bearbeiten-Modus lassen sich Presets umbenennen und löschen.
import { useRef, useState } from "preact/hooks";
import { PRESET_NAME_MAX, type Preset } from "@parrafraktor/protokoll";
import { useLaden } from "../laden.js";

const SPEICHERN_HALTEN_MS = 800;

export function Presets() {
  const l = useLaden();
  const [bearbeiten, setBearbeiten] = useState(false);
  const stand = l.stand;
  if (!stand) return null;
  return (
    <section class="presets">
      <header class="presets-kopf">
        <h2>Presets</h2>
        <span class="leise">{bearbeiten ? "Tippen: umbenennen" : "Tippen: abrufen · Halten: speichern"}</span>
        <button type="button" class={`knopf klein ${bearbeiten ? "an" : ""}`} onClick={() => setBearbeiten(!bearbeiten)}>
          {bearbeiten ? "Fertig" : "Bearbeiten"}
        </button>
      </header>
      <div class="presets-raster">
        {stand.presets.map((p, nr) => (
          <PresetPlatz
            key={nr} nr={nr} preset={p} bearbeiten={bearbeiten}
            aktiv={stand.letztesPreset === nr} bedienbar={l.bedienbar}
          />
        ))}
      </div>
    </section>
  );
}

interface Props {
  nr: number;
  preset: Preset | null;
  aktiv: boolean;
  bearbeiten: boolean;
  bedienbar: boolean;
}

function PresetPlatz({ nr, preset, aktiv, bearbeiten, bedienbar }: Props) {
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
          <span class="nr">{nr + 1}</span>
          {preset?.name ?? "leer"}
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

  const los = (abrufen: boolean) => {
    window.clearTimeout(timer.current);
    setHaelt(false);
    if (abrufen && !gespeichert.current && preset) l.sende({ typ: "preset", aktion: "abrufen", nr });
  };
  return (
    <button
      type="button"
      class={`preset halt-preset ${preset ? "" : "leer"} ${aktiv ? "aktiv" : ""} ${haelt ? "haelt" : ""}`}
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
      <span class="nr">{nr + 1}</span>
      <span class="preset-titel">{preset?.name ?? "leer"}</span>
    </button>
  );
}
