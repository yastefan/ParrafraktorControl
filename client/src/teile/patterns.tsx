import { MODI, MODUS_NAME, type Modus } from "@parrafraktor/engine";
import { useLaden } from "../laden.js";

export function Patterns({ modus }: { modus: Modus }) {
  const l = useLaden();
  return (
    <div class="patterns">
      {MODI.map((m) => (
        <button
          type="button"
          key={m}
          class={`pattern ${m === modus ? "aktiv" : ""}`}
          disabled={!l.bedienbar}
          onClick={() => l.sende({ typ: "pattern", modus: m })}
        >
          {MODUS_NAME[m]}
        </button>
      ))}
    </div>
  );
}
