// Settings menu: autostart, light scenes, layout, cross-fade, mirrors, patch, outputs, status.
// Layout and sliders (cross-fade, speed) act at once. Patch and network are collected and only sent with
// "Save", because the server restarts the outputs for them.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ELEMENTS } from "@parrafraktor/engine";
import { LIMITS, SCENE_UNIVERSES_MAX, isIpv4, parseUniverses, type Arrangement, type Settings as E, type State } from "@parrafraktor/protocol";
import { appState } from "../app-state.js";

interface Props {
  state: State;
  close: () => void;
}

export function SettingsPanel({ state, close }: Props) {
  const server = state.einstellungen;
  const [draft, setDraft] = useState<E>(server);
  const [changed, setChanged] = useState(false);
  // If someone else changes the settings, follow with the draft as long as nothing is open here
  useEffect(() => { if (!changed) setDraft(server); }, [JSON.stringify(server)]);

  const change = (f: (e: E) => E) => {
    setDraft((e) => f(structuredClone(e)));
    setChanged(true);
  };
  const immediate = (part: Partial<E>) => {
    setDraft((e) => ({ ...e, ...part }));
    appState.send({ typ: "einstellungen", einstellungen: part });
  };
  const error = check(draft);
  const store = () => {
    appState.send({ typ: "einstellungen", einstellungen: draft });
    setChanged(false);
  };

  return (
    <div class="schicht" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="blatt" role="dialog" aria-label="Settings">
        <header class="blatt-kopf">
          <h2>Settings</h2>
          <button type="button" class="knopf" onClick={close}>Done</button>
        </header>

        {state.warnungen.length > 0 && (
          <ul class="warnungen">{state.warnungen.map((w) => <li key={w}>{w}</li>)}</ul>
        )}

        <Group title="Autostart (operation without MA)" warning={draft.autostart.output}>
          <Switch name="Autostart output" on={draft.autostart.output}
            set={(on) => immediate({ autostart: { ...draft.autostart, output: on } })} />
          <Switch name="Autostart Auto" on={draft.autostart.auto}
            set={(on) => immediate({ autostart: { ...draft.autostart, auto: on } })} />
          <p class="hilfe">
            For exhibitions without a grandMA3. <b>Autostart output</b>: after every restart of the server the app takes the
            mirrors at once, without holding Output – the mirrors jump to the look, the MA cannot drive them. Leave it off
            whenever an MA is in the network. <b>Autostart Auto</b>: Auto runs the selected presets (at least two) after a restart.
          </p>
        </Group>

        <Group title="Light scenes (DMX recorder)">
          <Switch name="Record" on={draft.scenes.record}
            set={(on) => immediate({ scenes: { ...draft.scenes, record: on } })} />
          <Switch name="Playback" on={draft.scenes.playback}
            set={(on) => immediate({ scenes: { ...draft.scenes, playback: on } })} />
          <UniverseList value={draft.scenes.universes}
            set={(universes) => immediate({ scenes: { ...draft.scenes, universes } })} />
          {state.module.filter((m) => m.name === "Scene recorder").map((m) => (
            <p class="hilfe" key={m.name}><span class={`punkt ${m.zustand}`} /> {m.text}</p>
          ))}
          <p class="hilfe">
            A light scene is a snapshot of the other devices, linked to a preset. <b>Record</b>: storing a preset (hold)
            also takes what the MA sends right now in the universes of the patch and the extra universes – only if all
            of them arrive. With Record off a preset keeps its scene. <b>Playback</b>: while the output is on, the app
            sends the scene of the last recalled preset and fades it with the look. The mirror channels always come
            from the app. Playback off: the other channels in the patch universes are 0 (merge by HTP in the node),
            extra universes are not sent.
          </p>
        </Group>

        <Group title="Layout">
          <label class="feldzeile">
            <span class="name">Elements</span>
            <select value={draft.aufbau.anordnung} onChange={(ev) => immediate({
              aufbau: { ...draft.aufbau, anordnung: (ev.currentTarget as HTMLSelectElement).value as Arrangement },
            })}>
              <option value="reihe">side by side (top view)</option>
              <option value="hintereinander">one behind the other, rotated (front view)</option>
            </select>
          </label>
          {draft.aufbau.anordnung === "hintereinander" && (
            <>
              <div class="feldzeile">
                <span class="name">Rotation</span>
                {Array.from({ length: ELEMENTS }, (_, k) => (
                  <Numeric
                    key={k} name={k === 0 ? "1 front" : k === ELEMENTS - 1 ? `${k + 1} back` : String(k + 1)}
                    limits={LIMITS.drehung} value={draft.aufbau.drehung[k] ?? 0} narrow
                    set={(v) => immediate({ aufbau: { ...draft.aufbau, drehung: draft.aufbau.drehung.map((d, i) => (i === k ? v : d)) } })}
                  />
                ))}
              </div>
              <p class="hilfe">
                Rotation of each element in its plane, in degrees. Used by the preview and by the pattern Aperture,
                so it has to match the real layout.
              </p>
            </>
          )}
        </Group>

        <Group title="Crossfade">
          <Slider
            name="Duration" unit=" s" step={0.1} limits={LIMITS.ueberblendungS}
            value={draft.ueberblendungS} set={(v) => immediate({ ueberblendungS: v })}
            help="When switching the pattern, recalling a preset and switching the output on or off. For the output the app fades from or to the position of the MA – only if it can read the MA, otherwise the mirrors jump."
          />
        </Group>

        <Group title="Mirrors">
          <Slider
            name="TiltRotate max." unit=" rpm" step={1} limits={LIMITS.rotateMaxUpm}
            value={draft.rotateMaxUpm} set={(v) => immediate({ rotateMaxUpm: v })}
            help="Speed at DMX 0 or 255. Placeholder until the mirror firmware is known."
          />
        </Group>

        <Group title="Impulses">
          <Slider
            name="Open" unit="°" step={1} limits={LIMITS.tilt}
            value={draft.flash.auf} set={(v) => immediate({ flash: { ...draft.flash, auf: v } })}
          />
          <Slider
            name="Close" unit="°" step={1} limits={LIMITS.tilt}
            value={draft.flash.zu} set={(v) => immediate({ flash: { ...draft.flash, zu: v } })}
            help="Tilt the impulses Open and Close move the mirrors to. “Open” for light from behind, “Close” for light from outside. Placeholder until the angles are determined on site."
          />
        </Group>

        <Group title="Patch (fixture Gobbesso Parrafraktor, 37 channels)">
          {Array.from({ length: ELEMENTS }, (_, k) => (
            <div class="feldzeile" key={k}>
              <span class="name">Element {k + 1}</span>
              <Numeric
                name="Universe" limits={LIMITS.universe} value={draft.patch[k]!.universe}
                set={(v) => change((e) => { e.patch[k]!.universe = v; return e; })}
              />
              <Numeric
                name="Address" limits={LIMITS.adresse} value={draft.patch[k]!.adresse}
                set={(v) => change((e) => { e.patch[k]!.adresse = v; return e; })}
              />
            </div>
          ))}
        </Group>

        <Group title="Art-Net">
          <Switch name="Send" on={draft.artnet.an} set={(on) => change((e) => { e.artnet.an = on; return e; })} />
          <Text name="Target IP" value={draft.artnet.ziel} set={(v) => change((e) => { e.artnet.ziel = v; return e; })}
            help="Broadcast (e.g. 2.255.255.255) or IP of the node" />
          <Interface state={state} value={draft.artnet.quelle} set={(v) => change((e) => { e.artnet.quelle = v; return e; })} />
          <label class="feldzeile">
            <span class="name">Numbering</span>
            <select value={draft.artnet.versatz} onChange={(ev) => change((e) => {
              e.artnet.versatz = Number((ev.currentTarget as HTMLSelectElement).value);
              return e;
            })}>
              <option value={-1}>Universe 1 = Art-Net 0</option>
              <option value={0}>Universe 1 = Art-Net 1</option>
            </select>
          </label>
          <p class="hilfe">Art-Net has no priority: if the MA runs in parallel, the merge in the node decides.</p>
        </Group>

        <Group title="sACN">
          <Switch name="Send" on={draft.sacn.an} set={(on) => change((e) => { e.sacn.an = on; return e; })} />
          <Numeric name="Priority" limits={LIMITS.priority} value={draft.sacn.priority}
            set={(v) => change((e) => { e.sacn.priority = v; return e; })} />
          <Switch name="Multicast" on={draft.sacn.multicast} set={(on) => change((e) => { e.sacn.multicast = on; return e; })} />
          {!draft.sacn.multicast && (
            <Text name="Target IP" value={draft.sacn.ziel} set={(v) => change((e) => { e.sacn.ziel = v; return e; })} />
          )}
          <Interface state={state} value={draft.sacn.quelle} set={(v) => change((e) => { e.sacn.quelle = v; return e; })} />
          <p class="hilfe">The MA sends with priority 100. Switching the output off makes the node fall back to the MA immediately.</p>
        </Group>

        <Group title="DMX via RS485 (Raspberry Pi)">
          <Switch name="Send" on={draft.rs485.an} set={(on) => change((e) => { e.rs485.an = on; return e; })} />
          <Text name="Device" value={draft.rs485.geraet} set={(v) => change((e) => { e.rs485.geraet = v; return e; })} />
          <p class="hilfe">Not implemented yet.</p>
        </Group>

        {changed && (
          <div class="speichern">
            {error && <span class="fehler">{error}</span>}
            <button type="button" class="knopf" onClick={() => { setDraft(server); setChanged(false); }}>Discard</button>
            <button type="button" class="knopf haupt-knopf" disabled={!!error || !appState.usable} onClick={store}>
              Save
            </button>
          </div>
        )}

        <Group title="Status">
          <ul class="module">
            {state.module.map((m) => (
              <li key={m.name}>
                <span class={`punkt ${m.zustand}`} />
                <b>{m.name}</b> <span class="leise">{m.text}</span>
              </li>
            ))}
          </ul>
        </Group>
      </div>
    </div>
  );
}

function check(e: E): string | null {
  if (!isIpv4(e.artnet.ziel)) return "Art-Net: target IP invalid";
  if (e.sacn.an && !e.sacn.multicast && !isIpv4(e.sacn.ziel)) return "sACN: target IP for unicast missing";
  return null;
}

// ---------- Felder ----------

const Group = ({ title, warning, children }: { title: string; warning?: boolean; children: ComponentChildren }) => (
  <section class={`gruppe ${warning ? "warnung" : ""}`}>
    <h3>{title}</h3>
    {children}
  </section>
);

interface Limits { min: number; max: number }

function Slider(p: {
  name: string; unit: string; step: number; limits: Limits; value: number; help?: string; set: (v: number) => void;
}) {
  // While dragging only show, send on release
  const [value, setValue] = useState(p.value);
  useEffect(() => setValue(p.value), [p.value]);
  return (
    <>
      <label class="feldzeile">
        <span class="name">{p.name}</span>
        <input
          type="range" min={p.limits.min} max={p.limits.max} step={p.step} value={value}
          style={{ "--fuellung": `${((value - p.limits.min) / (p.limits.max - p.limits.min)) * 100}%` }}
          onInput={(e) => setValue(Number((e.currentTarget as HTMLInputElement).value))}
          onChange={(e) => p.set(Number((e.currentTarget as HTMLInputElement).value))}
        />
        <output>{value === 0 && p.unit === " s" ? "springen" : `${value}${p.unit}`}</output>
      </label>
      {p.help && <p class="hilfe">{p.help}</p>}
    </>
  );
}

function Numeric(p: { name: string; limits: Limits; value: number; narrow?: boolean; set: (v: number) => void }) {
  return (
    <label class={`zahl ${p.narrow ? "schmal" : ""}`}>
      <span>{p.name}</span>
      <input
        type="number" inputMode="numeric" min={p.limits.min} max={p.limits.max} value={p.value}
        onChange={(e) => {
          const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
          if (Number.isFinite(v)) p.set(Math.min(p.limits.max, Math.max(p.limits.min, v)));
        }}
      />
    </label>
  );
}

function Text(p: { name: string; value: string; help?: string; set: (v: string) => void }) {
  return (
    <>
      <label class="feldzeile">
        <span class="name">{p.name}</span>
        <input type="text" inputMode="decimal" autocomplete="off" spellcheck={false} value={p.value}
          onInput={(e) => p.set((e.currentTarget as HTMLInputElement).value.trim())} />
      </label>
      {p.help && <p class="hilfe">{p.help}</p>}
    </>
  );
}

// Universes as text ("2, 3"); taken over when leaving the field
function UniverseList(p: { value: number[]; set: (v: number[]) => void }) {
  const shown = p.value.join(", ");
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <label class="feldzeile">
      <span class="name">Extra universes</span>
      <input type="text" inputMode="numeric" autocomplete="off" spellcheck={false} value={text}
        placeholder="only the patch universes" title={`up to ${SCENE_UNIVERSES_MAX}, e.g. 2, 3`}
        onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
        onChange={(e) => {
          const list = parseUniverses((e.currentTarget as HTMLInputElement).value, LIMITS.universe);
          setText(list.join(", "));
          p.set(list);
        }} />
    </label>
  );
}

function Switch(p: { name: string; on: boolean; set: (on: boolean) => void }) {
  return (
    <label class="feldzeile">
      <span class="name">{p.name}</span>
      <input type="checkbox" role="switch" class="schalter" checked={p.on}
        onChange={(e) => p.set((e.currentTarget as HTMLInputElement).checked)} />
    </label>
  );
}

function Interface(p: { state: State; value: string; set: (v: string) => void }) {
  const known = p.state.netzwerk.some((n) => n.adresse === p.value);
  return (
    <label class="feldzeile">
      <span class="name">Network</span>
      <select value={p.value} onChange={(e) => p.set((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">automatic</option>
        {p.state.netzwerk.map((n) => (
          <option key={n.adresse} value={n.adresse}>{n.name} – {n.adresse}</option>
        ))}
        {p.value && !known && <option value={p.value}>{p.value} (not present)</option>}
      </select>
    </label>
  );
}
