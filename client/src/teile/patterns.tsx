import { MODES_SELECTABLE, MODE_NAME, type Mode } from "@parrafraktor/engine";
import { useLaden } from "../laden.js";
import { Modul } from "./modul.js";

export function Patterns({ modus }: { modus: Mode }) {
  const l = useLaden();
  return (
    <Modul titel="01 Pattern" klasse="m-pattern">
      <div class="patterns">
        {MODES_SELECTABLE.map((m, n) => (
          <button
            type="button"
            key={m}
            class={`pattern ${m === modus ? "aktiv" : ""}`}
            disabled={!l.bedienbar}
            onClick={() => l.sende({ typ: "pattern", modus: m })}
          >
            <span class="nr">{String(n + 1).padStart(2, "0")}</span>
            {MODE_NAME[m]}
          </button>
        ))}
      </div>
    </Modul>
  );
}
