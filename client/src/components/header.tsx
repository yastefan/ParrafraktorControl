import { useAppState } from "../app-state.js";
import { HoldButton } from "./hold-button.js";

const OUTPUT_HOLD_MS = 600;

export function Header({ onSettings }: { onSettings: () => void }) {
  const l = useAppState();
  const u = l.state?.uebernahme;
  const p = l.parameter;
  const warnings = l.state?.warnungen.length ?? 0;

  // Output: whether the app drives the mirrors (internally "takeover"). Off = the MA drives.
  let outputText = "Output off // hold";
  if (u?.zustand === "an") outputText = "Output on // hold";
  else if (u?.zustand === "blendetEin" || u?.zustand === "blendetAus") {
    outputText = `Output fading ${Math.round(u.anteil * 100)} %`;
  }
  const CONNECTION: Record<string, string> = { verbunden: "Link OK", verbinde: "Connecting …", getrennt: "Disconnected" };

  return (
    <header class="kopf">
      <h1>Parrafraktor</h1>
      <span class="status"><span class={`punkt ${l.connection}`} />{CONNECTION[l.connection] ?? l.connection}</span>
      {l.updateReady && (
        <button type="button" class="knopf klein" onClick={l.updateReady}>New version</button>
      )}
      <div class="kopf-rechts">
        <button
          type="button"
          class={`knopf ${p && !p.laeuft ? "an" : ""}`}
          disabled={!l.usable}
          onClick={() => p && l.set({ laeuft: !p.laeuft })}
        >
          {p?.laeuft === false ? "Resume" : "Pause"}
        </button>
        <HoldButton
          class={`uebernahme ${u?.zustand ?? "aus"}`}
          durationMs={OUTPUT_HOLD_MS}
          disabled={!l.usable}
          trigger={() => l.send({ typ: "uebernahme", an: !u?.soll })}
        >
          {outputText}
        </HoldButton>
        {l.state?.einstellungen.autostart.output && (
          <span class="autostart" title="Autostart output is on (settings): the app takes the mirrors after every restart">
            Autostart
          </span>
        )}
        <button type="button" class="knopf" onClick={onSettings} aria-label="Settings">
          Setup{warnings ? <span class="marke">{warnings}</span> : null}
        </button>
      </div>
    </header>
  );
}
