import { useLaden } from "../laden.js";
import { HaltKnopf } from "./haltknopf.js";

const UEBERNAHME_HALTEN_MS = 600;

export function Kopf({ beiEinstellungen }: { beiEinstellungen: () => void }) {
  const l = useLaden();
  const u = l.stand?.uebernahme;
  const p = l.parameter;
  const warnungen = l.stand?.warnungen.length ?? 0;

  // Output: ob die App die Spiegel fährt (intern "Übernahme"). Aus = die MA fährt.
  let uebernahmeText = "Output aus // halten";
  if (u?.zustand === "an") uebernahmeText = "Output aktiv // halten";
  else if (u?.zustand === "blendetEin" || u?.zustand === "blendetAus") {
    uebernahmeText = `Output blendet ${Math.round(u.anteil * 100)} %`;
  }
  const VERBINDUNG: Record<string, string> = { verbunden: "Link OK", verbinde: "Verbinde …", getrennt: "Getrennt" };

  return (
    <header class="kopf">
      <h1>Parrafraktor</h1>
      <span class="status"><span class={`punkt ${l.verbindung}`} />{VERBINDUNG[l.verbindung] ?? l.verbindung}</span>
      {l.updateBereit && (
        <button type="button" class="knopf klein" onClick={l.updateBereit}>Neue Version</button>
      )}
      <div class="kopf-rechts">
        <button
          type="button"
          class={`knopf ${p && !p.laeuft ? "an" : ""}`}
          disabled={!l.bedienbar}
          onClick={() => p && l.setze({ laeuft: !p.laeuft })}
        >
          {p?.laeuft === false ? "Weiter" : "Pause"}
        </button>
        <HaltKnopf
          class={`uebernahme ${u?.zustand ?? "aus"}`}
          dauerMs={UEBERNAHME_HALTEN_MS}
          disabled={!l.bedienbar}
          ausloesen={() => l.sende({ typ: "uebernahme", an: !u?.soll })}
        >
          {uebernahmeText}
        </HaltKnopf>
        <button type="button" class="knopf" onClick={beiEinstellungen} aria-label="Einstellungen">
          Setup{warnungen ? <span class="marke">{warnungen}</span> : null}
        </button>
      </div>
    </header>
  );
}
