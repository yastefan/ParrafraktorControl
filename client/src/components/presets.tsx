// Look presets: tap recalls (smooth cross-fade), hold stores the current look.
// In edit mode presets can be renamed and deleted.
// Auto plays the selected presets; selection and times are under "Select". While Auto
// runs, the frame of the module lights up.
import { useRef, useState } from "preact/hooks";
import { AUTO_RANGES, PRESET_NAME_MAX, type Preset } from "@parrafraktor/protocol";
import { useAppState } from "../app-state.js";
import { Module } from "./module.js";

const STORE_HOLD_MS = 800;

const showTime = (s: number): string =>
  s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} min` : `${Math.round(s)} s`;

export function Presets() {
  const l = useAppState();
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState(false);
  const state = l.state;
  if (!state) return null;
  const auto = state.auto;
  const startable = state.presets.filter((p, nr) => p && auto.auswahl[nr]).length >= 2;
  const hint = auto.an ? `Auto · ${showTime(Math.max(0, auto.restS))}`
    : editing ? "Tap: rename"
    : selection ? "Tap: include in Auto or not"
    : "Tap: recall · Hold: store";
  return (
    <Module
      title={auto.an ? "02 Presets // Auto" : "02 Presets"}
      className={`m-presets ${auto.an ? "auto-an" : ""}`}
      actions={(
        <>
          <span class={`modul-hinweis ${auto.an ? "auto-hinweis" : ""}`}>{hint}</span>
          <button
            type="button" class={`aktion haken ${auto.an ? "aktiv" : ""}`} aria-pressed={auto.an}
            disabled={!l.usable || (!auto.an && !startable)}
            title={startable ? "Run through the selected presets" : "Select at least two presets"}
            onClick={() => l.send({ typ: "auto", an: !auto.an })}
          >
            Auto
          </button>
          <button
            type="button" class={`aktion ${selection ? "aktiv" : ""}`}
            onClick={() => { setSelection(!selection); setEditing(false); }}
          >
            {selection ? "Done" : "Select"}
          </button>
          <button
            type="button" class={`aktion ${editing ? "aktiv" : ""}`}
            onClick={() => { setEditing(!editing); setSelection(false); }}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </>
      )}
    >
      <div class="presets-raster">
        {state.presets.map((p, nr) => (
          <PresetSlot
            key={nr} nr={nr} preset={p} editing={editing}
            active={state.letztesPreset === nr} usable={l.usable}
            select={selection} showSelection={selection || auto.an} selected={auto.auswahl[nr] === true}
          />
        ))}
      </div>
      {(selection || auto.an) && (
        <div class="auto-regler">
          <AutoControls name="Hold" field="halteS" value={auto.halteS} />
          <AutoControls name="Fade" field="blendeS" value={auto.blendeS} />
        </div>
      )}
    </Module>
  );
}

function AutoControls({ name, field, value }: { name: string; field: "halteS" | "blendeS"; value: number }) {
  const l = useAppState();
  // While dragging the own value counts, so an older state does not make the handle jump back
  const [dragging, setDragging] = useState<number | null>(null);
  const b = AUTO_RANGES[field];
  const w = dragging ?? value;
  return (
    <label class="band-regler">
      <span class="name">{name}</span>
      <input
        type="range" min={b.min} max={b.max} step={b.step} value={w} disabled={!l.usable}
        style={{ "--fuellung": `${((w - b.min) / (b.max - b.min)) * 100}%` }}
        onInput={(ev) => {
          const next = Number(ev.currentTarget.value);
          setDragging(next);
          l.send({ typ: "autoEinstellung", einstellung: { [field]: next } });
        }}
        onChange={() => setDragging(null)}
      />
      <output>{showTime(w)}</output>
    </label>
  );
}

interface Props {
  nr: number;
  preset: Preset | null;
  active: boolean;
  editing: boolean;
  usable: boolean;
  select: boolean;     // Tap selects for Auto instead of recalling
  showSelection: boolean;
  selected: boolean;
}

function PresetSlot({ nr, preset, active, editing, usable, select, showSelection, selected }: Props) {
  const l = useAppState();
  const timer = useRef<number>();
  const saved = useRef(false);
  const [holding, setHolding] = useState(false);

  if (editing) {
    return (
      <div class={`preset bearbeiten ${preset ? "" : "leer"}`}>
        <button
          type="button" class="preset-name" disabled={!preset || !usable}
          onClick={() => {
            const name = window.prompt(`Name for preset ${nr + 1}`, preset?.name ?? "");
            if (name?.trim()) l.send({ typ: "preset", aktion: "umbenennen", nr, name: name.trim().slice(0, PRESET_NAME_MAX) });
          }}
        >
          <span class="nr">P{String(nr + 1).padStart(2, "0")}</span>
          {preset?.name ?? "–"}
        </button>
        {preset && (
          <button
            type="button" class="preset-loeschen" disabled={!usable} aria-label={`Delete preset ${nr + 1}`}
            onClick={() => { if (window.confirm(`Delete preset “${preset.name}”?`)) l.send({ typ: "preset", aktion: "loeschen", nr }); }}
          >
            ×
          </button>
        )}
      </div>
    );
  }

  const withAuto = showSelection && preset ? (selected ? "gewaehlt" : "abgewaehlt") : "";
  if (select) {
    return (
      <button
        type="button" class={`preset ${preset ? "" : "leer"} ${active ? "aktiv" : ""} ${withAuto}`} disabled={!preset || !usable}
        aria-pressed={selected}
        onClick={() => {
          const list = [...(l.state?.auto.auswahl ?? [])];
          list[nr] = !selected;
          l.send({ typ: "autoEinstellung", einstellung: { auswahl: list } });
        }}
      >
        <span class="nr">P{String(nr + 1).padStart(2, "0")}</span>
        <span class="preset-titel">{preset?.name ?? "–"}</span>
      </button>
    );
  }

  const go = (recall: boolean) => {
    window.clearTimeout(timer.current);
    setHolding(false);
    if (recall && !saved.current && preset) l.send({ typ: "preset", aktion: "abrufen", nr });
  };
  return (
    <button
      type="button"
      class={`preset halt-preset ${preset ? "" : "leer"} ${active ? "aktiv" : ""} ${holding ? "haelt" : ""} ${withAuto}`}
      style={{ "--dauer": `${STORE_HOLD_MS}ms` }}
      disabled={!usable}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        saved.current = false;
        setHolding(true);
        timer.current = window.setTimeout(() => {
          saved.current = true;
          setHolding(false);
          l.send({ typ: "preset", aktion: "speichern", nr });
        }, STORE_HOLD_MS);
      }}
      onPointerUp={() => go(true)}
      onPointerCancel={() => go(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class="nr">P{String(nr + 1).padStart(2, "0")}</span>
      <span class="preset-titel">{preset?.name ?? "–"}</span>
    </button>
  );
}
