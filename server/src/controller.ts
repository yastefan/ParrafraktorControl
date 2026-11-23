// Central state of the server: pattern parameters, takeover wish ("Output") and settings.
// All controls (client, Stream Deck, MIDI, OSC) change the state only through these actions,
// all displays listen to the event "change".
import { EventEmitter } from "node:events";
import {
  IMPULSE_DEFAULTS, PARAMETER_DEFAULTS, impulseDone,
  type ImpulseKind, type ImpulseSettings, type RunningImpulse, type Mode, type Parameter,
} from "@parrafraktor/engine";
import {
  AUTO_DEFAULTS, RANGES, IMPULSE_RANGES, STEPPED, clampParameter, impulseValue, lookOf, migrateParameter, withImpulseValue, checkAuto, checkSettings,
  checkImpulse, checkParameter, shiftOffset, defaultName, defaultValue,
  type AutoSettings, type Settings, type ImpulseControl, type Presets, type SwitchParameter, type SteppedParameter, type Takeover, type NumericParameter,
  type SceneInfo,
} from "@parrafraktor/protocol";
import { sceneInfo, type Scene, type SceneFile } from "./scenes.js";

// Takes a light scene from what the MA sends right now (set by index.ts, see scenes.ts)
export type SceneSource = () => { scene: Scene } | { missing: number[] };

// A started impulse (fields like RunningImpulse, which is protocol)
interface ImpulseEntry {
  id: number;
  art: ImpulseKind;
  start: number;          // seconds (controller clock)
  ursprung: number;
  breite: number;
  wischt: boolean;
}

interface Events {
  // something visible has changed (parameters, takeover, module status)
  change: [];
  // settings changed: outputs must restart, the file must be saved
  settings: [Settings];
  // parameters changed: saved
  parameter: [Parameter];
  // presets changed: saved
  presets: [Presets];
  // preset recalled: the ticker cross-fades from the current position to the new look
  fade: [];
  // envelope or element order changed: saved
  impulse: [ImpulseSettings];
  // selection or times of Auto changed: saved
  auto: [AutoSettings];
  // light scenes or the active one changed: saved
  scenes: [SceneFile];
}

export class Controller extends EventEmitter<Events> {
  private _parameter: Parameter;
  private _settings: Settings;
  // Takeover starts off: after a restart the MA drives first – except with autostart (see autostart)
  private _takeover: Takeover = { soll: false, zustand: "aus", anteil: 0 };
  private _rev = 0;
  private _presets: Presets;
  private _lastPreset: number | null = null;
  private _fade: { id: number; anteil: number } | null = null;
  private _fadeDurationS = 0;
  private _auto: AutoSettings;
  // Auto starts off (except with autostart). It does not touch the output, only the look.
  private _autoOn = false;
  private _autoRemainingS = 0;
  private _impulse: ImpulseSettings;
  private _impulses: ImpulseEntry[] = [];
  private impulseId = 0;
  private _scenes: SceneFile = { active: null, slots: [] };
  private sceneSource: SceneSource | null = null;
  private _sceneWarning: string | null = null;

  // clock: seconds, replaceable for tests
  constructor(
    parameter: Parameter,
    settings: Settings,
    presets: Presets,
    impulse: ImpulseSettings = IMPULSE_DEFAULTS,
    private readonly clock: () => number = () => performance.now() / 1000,
    auto: AutoSettings = AUTO_DEFAULTS,
    scenes: SceneFile = { active: null, slots: [] },
  ) {
    super();
    this._parameter = parameter;
    this._settings = settings;
    this._presets = presets;
    this._impulse = impulse;
    this._auto = auto;
    this._scenes = scenes;
    this._fadeDurationS = settings.ueberblendungS;
  }

  get parameter(): Readonly<Parameter> { return this._parameter; }
  get settings(): Readonly<Settings> { return this._settings; }
  get takeover(): Readonly<Takeover> { return this._takeover; }
  get rev(): number { return this._rev; }
  get presets(): Readonly<Presets> { return this._presets; }
  get lastPreset(): number | null { return this._lastPreset; }
  get fade(): Readonly<{ id: number; anteil: number }> | null { return this._fade; }
  get fadeDurationS(): number { return this._fadeDurationS; }
  get impulse(): Readonly<ImpulseSettings> { return this._impulse; }
  get auto(): Readonly<AutoSettings> { return this._auto; }
  get autoOn(): boolean { return this._autoOn; }
  get autoRemainingS(): number { return this._autoRemainingS; }
  // Light scenes: what the client sees, the slot that plays, and its values (for the ticker)
  get scenes(): (SceneInfo | null)[] { return this._presets.map((_, nr) => sceneInfo(this._scenes.slots[nr] ?? null)); }
  get activeScene(): number | null { return this._scenes.active; }
  get activeSceneData(): Scene | null {
    const a = this._scenes.active;
    return a === null ? null : this._scenes.slots[a] ?? null;
  }
  get sceneWarning(): string | null { return this._settings.scenes.record ? this._sceneWarning : null; }
  get autoStartable(): boolean { return this.autoList().length >= 2; }

  // Running impulses with times relative to now (for the ticker, the preview and displays)
  impulses(): RunningImpulse[] {
    const now = this.clock();
    return this._impulses.map((i) => ({
      id: i.id, art: i.art, alterS: now - i.start, ursprung: i.ursprung, breite: i.breite, wischt: i.wischt,
    }));
  }

  // ---------- Actions of the controls ----------

  set(part: Partial<Parameter>): void {
    const checked = checkParameter(part);
    if (checked.modus && checked.modus !== this._parameter.modus) {
      // change of pattern via selectPattern, so the cross-fade starts
      this.selectPattern(checked.modus);
      delete checked.modus;
    }
    this.change(checked);
  }

  selectPattern(mode: Mode): void {
    // Only the shape changes; the controls stay as they are. The mirrors cross-fade smoothly
    // into the new shape instead of jumping.
    const isNew = mode !== this._parameter.modus;
    this.change({ modus: mode, laeuft: true });
    if (isNew) this.startFade();
  }

  // Adjust relatively, e.g. with an encoder: steps × smallest step
  adjust(name: NumericParameter, steps: number): void {
    this.change({ [name]: clampParameter(name, this._parameter[name] + steps * RANGES[name].step) });
  }

  // Offset of one element (0 … 2); turns on "per element" if it is still off
  adjustElementOffset(k: number, steps: number): void {
    const p = this._parameter;
    const old = p.offsetGetrennt ? p.offsetElemente : p.offsetElemente.map(() => p.offset);
    this.change({
      offsetGetrennt: true,
      offsetElemente: old.map((w, i) => (i === k ? clampParameter("offset", w + steps * RANGES.offset.step) : w)),
    });
  }

  reset(name: NumericParameter): void {
    // reset of the offset: all elements alike too, "per element" off
    if (name === "offset") {
      const v = defaultValue("offset");
      this.change({ offset: v, offsetGetrennt: false, offsetElemente: this._parameter.offsetElemente.map(() => v) });
      return;
    }
    this.change({ [name]: defaultValue(name) });
  }

  togglePause(): void {
    this.change({ laeuft: !this._parameter.laeuft });
  }

  // Step a stepped control (ordering, element order) on by one
  cycleStep(name: SteppedParameter, steps = 1): void {
    const values: readonly string[] = STEPPED[name].values;
    const n = values.length;
    const i = values.indexOf(this._parameter[name]);
    this.change({ [name]: values[(((i + steps) % n) + n) % n] });
  }

  toggle(name: SwitchParameter): void {
    this.change({ [name]: !this._parameter[name] });
  }

  setTakeover(on: boolean): void {
    if (this._takeover.soll === on) return;
    this._takeover = { ...this._takeover, soll: on };
    this.changed();
  }

  // ---------- Impulses ----------

  // Strip: start the selected kind from the origin (0 = left … 1 = right).
  // Tapped it only acts within the set width, swiped it runs through the whole element.
  tapImpulse(origin: number, swipe = false): void {
    const start = this.clock();
    const u = Math.min(1, Math.max(0, origin));
    const width = swipe ? 0 : this._impulse.breite;
    this._impulses.push({ id: ++this.impulseId, art: this._impulse.art, start, ursprung: u, breite: width, wischt: swipe });
    this.changed();
  }

  // The ticker clears finished impulses
  pruneImpulses(): void {
    const before = this._impulses.length;
    const list = this.impulses();
    this._impulses = this._impulses.filter((_, n) => !impulseDone(this._impulse, list[n]!));
    if (this._impulses.length !== before) this.changed();
  }

  setImpulse(raw: unknown): void {
    this.changeImpulse(checkImpulse(raw, this._impulse));
  }

  adjustImpulse(name: ImpulseControl, steps: number): void {
    const value = impulseValue(this._impulse, name) + steps * IMPULSE_RANGES[name].step;
    this.changeImpulse(withImpulseValue(this._impulse, name, value));
  }

  resetImpulse(name: ImpulseControl): void {
    this.changeImpulse(withImpulseValue(this._impulse, name, impulseValue(IMPULSE_DEFAULTS, name)));
  }

  private changeImpulse(next: ImpulseSettings): void {
    if (JSON.stringify(next) === JSON.stringify(this._impulse)) return;
    this._impulse = next;
    this.emit("impulse", next);
    this.changed();
  }

  // ---------- Presets ----------

  recallPreset(nr: number): void {
    if (!this._presets[nr]) return;
    this.setAuto(false);   // whoever recalls a preset by hand takes over
    this.loadPreset(nr, this._settings.ueberblendungS);
  }

  private loadPreset(nr: number, fadeS: number): void {
    const preset = this._presets[nr];
    if (!preset) return;
    // pause stays as it is: it is not part of the look
    this.change({ ...preset.look }, nr, true);
    // the light scene of the preset plays (none if it has none); it fades with the look
    this.setActiveScene(nr);
    this.startFade(fadeS);
    this.changed();
  }

  // Ticker and preview cross-fade from the current position to the new look
  private startFade(durationS: number = this._settings.ueberblendungS): void {
    if (durationS <= 0) return;
    this._fadeDurationS = durationS;
    this._fade = { id: (this._fade?.id ?? 0) + 1, anteil: 0 };
    this.emit("fade");
    this.changed();
  }

  storePreset(nr: number): void {
    const look = lookOf(this._parameter);
    // the name stays when overwriting, otherwise after the pattern
    const name = this._presets[nr]?.name ?? defaultName(look);
    this.setPreset(nr, { name, look });
    this._lastPreset = nr;
    // Record on: take the light scene too. Off, or nothing received: the preset keeps its scene.
    if (this._settings.scenes.record && this.sceneSource) {
      const r = this.sceneSource();
      if ("scene" in r) {
        this.setScene(nr, r.scene);
        this._sceneWarning = null;
      } else {
        this._sceneWarning = `Scene of P${nr + 1} not recorded: universe ${r.missing.join(", ")} not received from the MA.`;
      }
    }
    this.setActiveScene(nr);
    this.changed();
  }

  deletePreset(nr: number): void {
    if (this._lastPreset === nr) this._lastPreset = null;
    this.setScene(nr, null);
    if (this._scenes.active === nr) this.setActiveScene(null);
    this.setPreset(nr, null);
    if (this.autoList().length < 2) this.setAuto(false);
  }

  clearScene(nr: number): void {
    this.setScene(nr, null);
  }

  setSceneSource(source: SceneSource): void {
    this.sceneSource = source;
  }

  private setScene(nr: number, scene: Scene | null): void {
    if (!scene && !this._scenes.slots[nr]) return;
    const slots = Array.from({ length: this._presets.length }, (_, i) => (i === nr ? scene : this._scenes.slots[i] ?? null));
    this._scenes = { ...this._scenes, slots };
    this.emit("scenes", this._scenes);
    this.changed();
  }

  private setActiveScene(nr: number | null): void {
    if (this._scenes.active === nr) return;
    this._scenes = { ...this._scenes, active: nr };
    this.emit("scenes", this._scenes);
    this.changed();
  }

  renamePreset(nr: number, name: string): void {
    const p = this._presets[nr];
    if (p) this.setPreset(nr, { ...p, name });
  }

  private setPreset(nr: number, preset: Presets[number]): void {
    this._presets = this._presets.map((p, i) => (i === nr ? preset : p));
    this.emit("presets", this._presets);
    this.changed();
  }

  // ---------- Auto ----------

  // Selected slots that also hold a preset
  private autoList(): number[] {
    return this._presets.flatMap((p, nr) => (p && this._auto.auswahl[nr] ? [nr] : []));
  }

  setAuto(on: boolean): void {
    if (on === this._autoOn) return;
    if (on && this.autoList().length < 2) return;   // with one preset there would be nothing to change
    this._autoOn = on;
    this._autoRemainingS = 0;
    if (on) this.autoNext();
    this.changed();
  }

  // Once after the server start: turns on what is set under autostart (running without MA,
  // e.g. in an exhibition). Returns what happened, for the log.
  autostart(): string[] {
    const { output, auto } = this._settings.autostart;
    const done: string[] = [];
    if (output) {
      this.setTakeover(true);
      done.push("output on");
    }
    if (auto) {
      this.setAuto(true);
      done.push(this._autoOn ? "Auto on" : "Auto not started: fewer than two presets selected");
    }
    return done;
  }

  configureAuto(raw: unknown): void {
    const next = checkAuto(raw, this._auto);
    if (JSON.stringify(next) === JSON.stringify(this._auto)) return;
    this._auto = next;
    this.emit("auto", next);
    if (this._autoOn) {
      if (this.autoList().length < 2) this.setAuto(false);
      else this._autoRemainingS = Math.min(this._autoRemainingS, next.blendeS + next.halteS);
    }
    this.changed();
  }

  // The ticker lets time pass. During pause Auto stands too.
  autoAdvance(dt: number): void {
    if (!this._autoOn || !this._parameter.laeuft) return;
    this._autoRemainingS -= dt;
    if (this._autoRemainingS <= 0) this.autoNext();
  }

  private autoNext(): void {
    const list = this.autoList();
    const from = this._lastPreset ?? -1;
    const nr = list.find((n) => n > from) ?? list[0];
    if (nr === undefined) return;
    this.loadPreset(nr, this._auto.blendeS);
    this._autoRemainingS = this._auto.blendeS + this._auto.halteS;
  }

  setSettings(raw: unknown): void {
    const next = checkSettings(raw, this._settings);
    if (JSON.stringify(next) === JSON.stringify(this._settings)) return;
    this._settings = next;
    this.emit("settings", next);
    this.changed();
  }

  // ---------- Reports of the modules ----------

  // The ticker reports how far the takeover is
  reportTakeover(state: Takeover["zustand"], fraction: number): void {
    const u = this._takeover;
    if (u.zustand === state && u.anteil === fraction) return;
    this._takeover = { soll: u.soll, zustand: state, anteil: fraction };
    this.changed();
  }

  // The ticker reports how far the cross-fade to the preset is (null = done)
  reportFade(fraction: number | null): void {
    if (!this._fade) return;
    this._fade = fraction === null ? null : { id: this._fade.id, anteil: fraction };
    this.changed();
  }

  // A module changed its status (e.g. Stream Deck plugged in)
  changed(): void {
    this._rev++;
    this.emit("change");
  }

  // preset: number if the change recalls a preset; otherwise no preset counts as active any more
  // fromPreset: recalling a preset; any other change of the look is manual and ends Auto
  private change(part: Partial<Parameter>, preset: number | null = null, fromPreset = false): void {
    // Only the common offset with separate elements: shift all along (distances stay)
    if (part.offset !== undefined && part.offsetElemente === undefined && part.offsetGetrennt === undefined) {
      part = { ...part, ...shiftOffset(this._parameter, part.offset) };
    }
    const next = { ...this._parameter, ...part };
    const pauseOrSame = Object.keys(part).every((k) => k === "laeuft");
    if (!pauseOrSame || preset !== null) this._lastPreset = preset;
    if (JSON.stringify(next) === JSON.stringify(this._parameter)) return;
    if (!pauseOrSame && !fromPreset) this.setAuto(false);
    this._parameter = next;
    this.emit("parameter", next);
    this.changed();
  }
}

export const parameterOff = (raw: unknown): Parameter => ({ ...PARAMETER_DEFAULTS, ...checkParameter(migrateParameter(raw)) });
