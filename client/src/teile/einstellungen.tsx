// Einstellungsmenü: Aufbau, Übernahme, Spiegel, Patch, Ausgaben, Status.
// Aufbau und Regler (Überblendung, Drehzahl) wirken sofort. Patch und Netzwerk werden gesammelt und erst mit
// "Speichern" geschickt, weil der Server dafür die Ausgaben neu startet.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ELEMENTE } from "@parrafraktor/engine";
import { GRENZEN, istIpv4, type Anordnung, type Einstellungen as E, type Stand } from "@parrafraktor/protokoll";
import { laden } from "../laden.js";

interface Props {
  stand: Stand;
  schliessen: () => void;
}

export function Einstellungen({ stand, schliessen }: Props) {
  const server = stand.einstellungen;
  const [entwurf, setEntwurf] = useState<E>(server);
  const [geaendert, setGeaendert] = useState(false);
  // Ändert jemand anderes die Einstellungen, den Entwurf nachziehen, solange hier nichts offen ist
  useEffect(() => { if (!geaendert) setEntwurf(server); }, [JSON.stringify(server)]);

  const aendere = (f: (e: E) => E) => {
    setEntwurf((e) => f(structuredClone(e)));
    setGeaendert(true);
  };
  const sofort = (teil: Partial<E>) => {
    setEntwurf((e) => ({ ...e, ...teil }));
    laden.sende({ typ: "einstellungen", einstellungen: teil });
  };
  const fehler = pruefe(entwurf);
  const speichern = () => {
    laden.sende({ typ: "einstellungen", einstellungen: entwurf });
    setGeaendert(false);
  };

  return (
    <div class="schicht" onClick={(e) => e.target === e.currentTarget && schliessen()}>
      <div class="blatt" role="dialog" aria-label="Einstellungen">
        <header class="blatt-kopf">
          <h2>Einstellungen</h2>
          <button type="button" class="knopf" onClick={schliessen}>Fertig</button>
        </header>

        {stand.warnungen.length > 0 && (
          <ul class="warnungen">{stand.warnungen.map((w) => <li key={w}>{w}</li>)}</ul>
        )}

        <Gruppe titel="Aufbau">
          <label class="feldzeile">
            <span class="name">Elemente</span>
            <select value={entwurf.aufbau.anordnung} onChange={(ev) => sofort({
              aufbau: { ...entwurf.aufbau, anordnung: (ev.currentTarget as HTMLSelectElement).value as Anordnung },
            })}>
              <option value="reihe">nebeneinander (Draufsicht)</option>
              <option value="hintereinander">hintereinander, gedreht (Vorderansicht)</option>
            </select>
          </label>
          {entwurf.aufbau.anordnung === "hintereinander" && (
            <>
              <div class="feldzeile">
                <span class="name">Drehung</span>
                {Array.from({ length: ELEMENTE }, (_, k) => (
                  <Zahl
                    key={k} name={k === 0 ? "1 vorn" : k === ELEMENTE - 1 ? `${k + 1} hinten` : String(k + 1)}
                    grenzen={GRENZEN.drehung} wert={entwurf.aufbau.drehung[k] ?? 0} schmal
                    setze={(v) => sofort({ aufbau: { ...entwurf.aufbau, drehung: entwurf.aufbau.drehung.map((d, i) => (i === k ? v : d)) } })}
                  />
                ))}
              </div>
              <p class="hilfe">
                Drehung jedes Elements in seiner Ebene, in Grad. Betrifft nur die Vorschau. Für diesen Aufbau passt
                meist die Reihenfolge „je Element“.
              </p>
            </>
          )}
        </Gruppe>

        <Gruppe titel="Überblendung">
          <Schieber
            name="Dauer" einheit=" s" schritt={0.1} grenzen={GRENZEN.ueberblendungS}
            wert={entwurf.ueberblendungS} setze={(v) => sofort({ ueberblendungS: v })}
            hilfe="Beim Wechsel der Form, beim Abrufen eines Presets und beim Ein- und Ausschalten des Outputs. Für den Output blendet die App von bzw. zur Stellung der MA – nur wenn sie die MA mitlesen kann, sonst springen die Spiegel."
          />
        </Gruppe>

        <Gruppe titel="Spiegel">
          <Schieber
            name="TiltRotate max." einheit=" U/min" schritt={1} grenzen={GRENZEN.rotateMaxUpm}
            wert={entwurf.rotateMaxUpm} setze={(v) => sofort({ rotateMaxUpm: v })}
            hilfe="Drehzahl bei DMX 0 bzw. 255. Platzhalter, bis die Spiegel-Firmware bekannt ist."
          />
        </Gruppe>

        <Gruppe titel="Flash">
          <Schieber
            name="Flash auf" einheit="°" schritt={1} grenzen={GRENZEN.tilt}
            wert={entwurf.flash.auf} setze={(v) => sofort({ flash: { ...entwurf.flash, auf: v } })}
          />
          <Schieber
            name="Flash zu" einheit="°" schritt={1} grenzen={GRENZEN.tilt}
            wert={entwurf.flash.zu} setze={(v) => sofort({ flash: { ...entwurf.flash, zu: v } })}
            hilfe="Tilt, auf den die Flash-Pads die Spiegel fahren. „Auf“ für Licht von hinten, „Zu“ für Licht von außen. Platzhalter, bis die Winkel am Aufbau bestimmt sind."
          />
        </Gruppe>

        <Gruppe titel="Patch (Fixture Gobbesso Parrafraktor, 37 Kanäle)">
          {Array.from({ length: ELEMENTE }, (_, k) => (
            <div class="feldzeile" key={k}>
              <span class="name">Element {k + 1}</span>
              <Zahl
                name="Universe" grenzen={GRENZEN.universe} wert={entwurf.patch[k]!.universe}
                setze={(v) => aendere((e) => { e.patch[k]!.universe = v; return e; })}
              />
              <Zahl
                name="Adresse" grenzen={GRENZEN.adresse} wert={entwurf.patch[k]!.adresse}
                setze={(v) => aendere((e) => { e.patch[k]!.adresse = v; return e; })}
              />
            </div>
          ))}
        </Gruppe>

        <Gruppe titel="Art-Net">
          <Schalter name="Senden" an={entwurf.artnet.an} setze={(an) => aendere((e) => { e.artnet.an = an; return e; })} />
          <Text name="Ziel-IP" wert={entwurf.artnet.ziel} setze={(v) => aendere((e) => { e.artnet.ziel = v; return e; })}
            hilfe="Broadcast (z. B. 2.255.255.255) oder IP des Nodes" />
          <Schnittstelle stand={stand} wert={entwurf.artnet.quelle} setze={(v) => aendere((e) => { e.artnet.quelle = v; return e; })} />
          <label class="feldzeile">
            <span class="name">Zählung</span>
            <select value={entwurf.artnet.versatz} onChange={(ev) => aendere((e) => {
              e.artnet.versatz = Number((ev.currentTarget as HTMLSelectElement).value);
              return e;
            })}>
              <option value={-1}>Universe 1 = Art-Net 0</option>
              <option value={0}>Universe 1 = Art-Net 1</option>
            </select>
          </label>
          <p class="hilfe">Art-Net hat keine Priority: Läuft die MA parallel, entscheidet der Merge im Node.</p>
        </Gruppe>

        <Gruppe titel="sACN">
          <Schalter name="Senden" an={entwurf.sacn.an} setze={(an) => aendere((e) => { e.sacn.an = an; return e; })} />
          <Zahl name="Priority" grenzen={GRENZEN.priority} wert={entwurf.sacn.priority}
            setze={(v) => aendere((e) => { e.sacn.priority = v; return e; })} />
          <Schalter name="Multicast" an={entwurf.sacn.multicast} setze={(an) => aendere((e) => { e.sacn.multicast = an; return e; })} />
          {!entwurf.sacn.multicast && (
            <Text name="Ziel-IP" wert={entwurf.sacn.ziel} setze={(v) => aendere((e) => { e.sacn.ziel = v; return e; })} />
          )}
          <Schnittstelle stand={stand} wert={entwurf.sacn.quelle} setze={(v) => aendere((e) => { e.sacn.quelle = v; return e; })} />
          <p class="hilfe">Die MA sendet mit Priority 100. Schaltet man den Output aus, fällt der Node sofort auf die MA zurück.</p>
        </Gruppe>

        <Gruppe titel="DMX über RS485 (Raspberry Pi)">
          <Schalter name="Senden" an={entwurf.rs485.an} setze={(an) => aendere((e) => { e.rs485.an = an; return e; })} />
          <Text name="Gerät" wert={entwurf.rs485.geraet} setze={(v) => aendere((e) => { e.rs485.geraet = v; return e; })} />
          <p class="hilfe">Noch nicht umgesetzt.</p>
        </Gruppe>

        {geaendert && (
          <div class="speichern">
            {fehler && <span class="fehler">{fehler}</span>}
            <button type="button" class="knopf" onClick={() => { setEntwurf(server); setGeaendert(false); }}>Verwerfen</button>
            <button type="button" class="knopf haupt-knopf" disabled={!!fehler || !laden.bedienbar} onClick={speichern}>
              Speichern
            </button>
          </div>
        )}

        <Gruppe titel="Status">
          <ul class="module">
            {stand.module.map((m) => (
              <li key={m.name}>
                <span class={`punkt ${m.zustand}`} />
                <b>{m.name}</b> <span class="leise">{m.text}</span>
              </li>
            ))}
          </ul>
        </Gruppe>
      </div>
    </div>
  );
}

function pruefe(e: E): string | null {
  if (!istIpv4(e.artnet.ziel)) return "Art-Net: Ziel-IP ungültig";
  if (e.sacn.an && !e.sacn.multicast && !istIpv4(e.sacn.ziel)) return "sACN: Ziel-IP für Unicast fehlt";
  return null;
}

// ---------- Felder ----------

const Gruppe = ({ titel, children }: { titel: string; children: ComponentChildren }) => (
  <section class="gruppe">
    <h3>{titel}</h3>
    {children}
  </section>
);

interface Grenzen { min: number; max: number }

function Schieber(p: {
  name: string; einheit: string; schritt: number; grenzen: Grenzen; wert: number; hilfe?: string; setze: (v: number) => void;
}) {
  // Beim Ziehen nur anzeigen, beim Loslassen senden
  const [wert, setWert] = useState(p.wert);
  useEffect(() => setWert(p.wert), [p.wert]);
  return (
    <>
      <label class="feldzeile">
        <span class="name">{p.name}</span>
        <input
          type="range" min={p.grenzen.min} max={p.grenzen.max} step={p.schritt} value={wert}
          style={{ "--fuellung": `${((wert - p.grenzen.min) / (p.grenzen.max - p.grenzen.min)) * 100}%` }}
          onInput={(e) => setWert(Number((e.currentTarget as HTMLInputElement).value))}
          onChange={(e) => p.setze(Number((e.currentTarget as HTMLInputElement).value))}
        />
        <output>{wert === 0 && p.einheit === " s" ? "springen" : `${wert}${p.einheit}`}</output>
      </label>
      {p.hilfe && <p class="hilfe">{p.hilfe}</p>}
    </>
  );
}

function Zahl(p: { name: string; grenzen: Grenzen; wert: number; schmal?: boolean; setze: (v: number) => void }) {
  return (
    <label class={`zahl ${p.schmal ? "schmal" : ""}`}>
      <span>{p.name}</span>
      <input
        type="number" inputMode="numeric" min={p.grenzen.min} max={p.grenzen.max} value={p.wert}
        onChange={(e) => {
          const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
          if (Number.isFinite(v)) p.setze(Math.min(p.grenzen.max, Math.max(p.grenzen.min, v)));
        }}
      />
    </label>
  );
}

function Text(p: { name: string; wert: string; hilfe?: string; setze: (v: string) => void }) {
  return (
    <>
      <label class="feldzeile">
        <span class="name">{p.name}</span>
        <input type="text" inputMode="decimal" autocomplete="off" spellcheck={false} value={p.wert}
          onInput={(e) => p.setze((e.currentTarget as HTMLInputElement).value.trim())} />
      </label>
      {p.hilfe && <p class="hilfe">{p.hilfe}</p>}
    </>
  );
}

function Schalter(p: { name: string; an: boolean; setze: (an: boolean) => void }) {
  return (
    <label class="feldzeile">
      <span class="name">{p.name}</span>
      <input type="checkbox" role="switch" class="schalter" checked={p.an}
        onChange={(e) => p.setze((e.currentTarget as HTMLInputElement).checked)} />
    </label>
  );
}

function Schnittstelle(p: { stand: Stand; wert: string; setze: (v: string) => void }) {
  const bekannt = p.stand.netzwerk.some((n) => n.adresse === p.wert);
  return (
    <label class="feldzeile">
      <span class="name">Netzwerk</span>
      <select value={p.wert} onChange={(e) => p.setze((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">automatisch</option>
        {p.stand.netzwerk.map((n) => (
          <option key={n.adresse} value={n.adresse}>{n.name} – {n.adresse}</option>
        ))}
        {p.wert && !bekannt && <option value={p.wert}>{p.wert} (nicht vorhanden)</option>}
      </select>
    </label>
  );
}
