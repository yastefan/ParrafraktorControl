import { MODI, MODUS_NAME, type Modus } from "@parrafraktor/engine";
import { useLaden } from "../laden.js";
import { Modul } from "./modul.js";

export function Patterns({ modus }: { modus: Modus }) {
  const l = useLaden();
  return (
    <Modul titel="01 Pattern" klasse="m-pattern">
      <div class="patterns">
        {MODI.map((m, n) => (
          <button
            type="button"
            key={m}
            class={`pattern ${m === modus ? "aktiv" : ""}`}
            disabled={!l.bedienbar}
            onClick={() => l.sende({ typ: "pattern", modus: m })}
          >
            <span class="nr">{String(n + 1).padStart(2, "0")}</span>
            {MODUS_NAME[m]}
          </button>
        ))}
      </div>
    </Modul>
  );
}
