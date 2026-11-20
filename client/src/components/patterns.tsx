import { MODES_SELECTABLE, MODE_NAME, type Mode } from "@parrafraktor/engine";
import { useAppState } from "../app-state.js";
import { Module } from "./module.js";

export function Patterns({ mode }: { mode: Mode }) {
  const l = useAppState();
  return (
    <Module title="01 Pattern" className="m-pattern">
      <div class="patterns">
        {MODES_SELECTABLE.map((m, n) => (
          <button
            type="button"
            key={m}
            class={`pattern ${m === mode ? "aktiv" : ""}`}
            disabled={!l.usable}
            onClick={() => l.send({ typ: "pattern", modus: m })}
          >
            <span class="nr">{String(n + 1).padStart(2, "0")}</span>
            {MODE_NAME[m]}
          </button>
        ))}
      </div>
    </Module>
  );
}
