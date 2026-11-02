import { useLaden } from "../laden.js";
import { HaltKnopf } from "./haltknopf.js";

const UEBERNAHME_HALTEN_MS = 600;

export function Kopf({ beiEinstellungen }: { beiEinstellungen: () => void }) {
  const l = useLaden();
  const u = l.stand?.uebernahme;
  const p = l.parameter;
  const warnungen = l.stand?.warnungen.length ?? 0;

  let uebernahmeText = "MA fährt · halten zum Übernehmen";
  if (u?.zustand === "an") uebernahmeText = "LIVE · halten zum Abgeben";
  else if (u?.zustand === "blendetEin" || u?.zustand === "blendetAus") {
    uebernahmeText = `Überblendung ${Math.round(u.anteil * 100)} %`;
  }

  return (
    <header class="kopf">
      <span class={`punkt ${l.verbindung}`} title={l.verbindung} />
      <h1>Parrafraktor</h1>
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
          Einstellungen{warnungen ? <span class="marke">{warnungen}</span> : null}
        </button>
      </div>
    </header>
  );
}
