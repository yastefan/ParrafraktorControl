// Ticker: computes the mirror positions 40 times per second and sends them to the outputs.
// The pattern also runs without takeover, so it can be set up beforehand and the preview in the
// client is right. It only sends while the app has taken over ("Output" on the desk).
//
// Takeover with cross-fade (states are protocol values):
//   aus ──(wanted on)──▶ blendetEin ──(fraction 1)──▶ an ──(wanted off)──▶ blendetAus ──(fraction 0)──▶ aus
// It fades from and to the position of the MA (see ma-listener.ts). If that is unknown or the
// cross-fade time is 0, it switches directly.
//
// Recalling a preset: the position at the moment of recalling is held and cross-faded into the
// new look over the fade time, so the motors do not jump.
//
// Impulses (flash, hole, iris) lie over the look, but under the cross-fade from and to the MA.
//
// Light scenes (scenes.ts): the other channels follow the scene of the last recalled preset,
// fade linearly with the look and with the output from/to the MA; mirror channels always come
// from the engine.
import { Engine, blend, writeUniverses, smooth, applyImpulses, type Position } from "@parrafraktor/engine";
import type { TakeoverState } from "@parrafraktor/protocol";
import type { Output } from "./output/index.js";
import type { MaListener } from "./ma-listener.js";
import type { Controller } from "./controller.js";
import { blendFrames, blendFromMa, sceneTargets, withMirrors } from "./scenes.js";

export const TICK_MS = 25;

export interface Sources {
  outputs(): readonly Output[];
  maListener(): MaListener | null;
}

// Next takeover state (pure, so it can be tested)
export function takeoverStep(
  state: TakeoverState,
  fraction: number,
  wanted: boolean,
  dt: number,
  crossfadeS: number,
  maKnown: boolean,
): { zustand: TakeoverState; anteil: number } {
  const fading = crossfadeS > 0 && maKnown;
  const step = fading ? dt / crossfadeS : 1;
  if (wanted) {
    if (state === "an") return { zustand: state, anteil: 1 };
    if (!fading) return { zustand: "an", anteil: 1 };
    const next = Math.min(1, fraction + step);
    return next >= 1 ? { zustand: "an", anteil: 1 } : { zustand: "blendetEin", anteil: next };
  }
  if (state === "aus") return { zustand: state, anteil: 0 };
  if (!fading) return { zustand: "aus", anteil: 0 };
  const next = Math.max(0, fraction - step);
  return next <= 0 ? { zustand: "aus", anteil: 0 } : { zustand: "blendetAus", anteil: next };
}

export class Ticker {
  readonly engine = new Engine();
  private timer: NodeJS.Timeout | undefined;
  private last = performance.now();
  // last computed positions of the app and, during a cross-fade to a preset, the starting point
  private app: Position[] = [];
  private fadeFrom: Position[] | null = null;
  // other channels (light scene) last computed, starting point of a cross-fade, its progress
  private other = new Map<number, Uint8Array>();
  private otherFrom: Map<number, Uint8Array> | null = null;
  private fadeFraction = 1;

  constructor(private readonly controller: Controller, private readonly sources: Sources) {
    controller.on("fade", () => {
      this.fadeFrom = this.app.length ? this.app : this.engine.all(controller.parameter);
      this.otherFrom = this.other;
    });
  }

  start(): void {
    this.last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
    }, TICK_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  // Current positions of the app (without cross-fade), e.g. for displays
  positions(): Position[] {
    return this.engine.all(this.controller.parameter);
  }

  // Positions of the look, blended during a cross-fade to a preset
  private appPositions(dt: number): Position[] {
    const target = this.engine.all(this.controller.parameter);
    const fade = this.controller.fade;
    if (!fade || !this.fadeFrom) {
      this.fadeFrom = null;
      this.fadeFraction = 1;
      this.app = target;
      return target;
    }
    const duration = this.controller.fadeDurationS;
    const fraction = duration > 0 ? Math.min(1, fade.anteil + dt / duration) : 1;
    this.fadeFraction = fraction;
    this.app = fraction >= 1 ? target : blend(this.fadeFrom, target, smooth(fraction));
    this.controller.reportFade(fraction >= 1 ? null : fraction);
    if (fraction >= 1) this.fadeFrom = null;
    return this.app;
  }

  // Other channels: scene of the active preset, faded with the look
  private otherChannels(): Map<number, Uint8Array> {
    const { settings } = this.controller;
    const target = sceneTargets(this.controller.activeSceneData, settings.scenes.playback, settings.patch);
    if (this.otherFrom && this.fadeFraction < 1) {
      this.other = blendFrames(this.otherFrom, target, this.fadeFraction);
    } else {
      this.otherFrom = null;
      this.other = target;
    }
    return this.other;
  }

  private withImpulses(app: Position[]): Position[] {
    const impulses = this.controller.impulses();
    if (!impulses.length) return app;
    return applyImpulses(app, impulses, this.controller.impulse, this.controller.settings.flash, this.controller.settings.aufbau.drehung);
  }

  private step(dt: number): void {
    const { parameter, settings, takeover } = this.controller;
    this.engine.elementRotation = settings.aufbau.drehung;
    this.engine.rotateMaxRpm = settings.rotateMaxUpm;
    this.engine.advance(parameter, dt);
    this.controller.pruneImpulses();
    this.controller.autoAdvance(dt);

    const ma = this.sources.maListener()?.positions(settings.rotateMaxUpm) ?? null;
    const before = takeover.zustand;
    const { zustand: state, anteil: fraction } = takeoverStep(
      before, takeover.anteil, takeover.soll, dt, settings.ueberblendungS, ma !== null,
    );
    this.controller.reportTakeover(state, fraction);

    const outputs = this.sources.outputs();
    if (state === "aus") {
      this.appPositions(dt);   // the cross-fade to a preset continues without output too
      this.otherChannels();
      if (before !== "aus") for (const o of outputs) o.release();
      return;
    }
    const app = this.withImpulses(this.appPositions(dt));
    const positions = ma && fraction < 1 ? blend(ma, app, smooth(fraction)) : app;
    let other = this.otherChannels();
    const maFrames = this.sources.maListener()?.frames();
    if (maFrames && fraction < 1) other = blendFromMa(maFrames, other, fraction);
    const mirrors = writeUniverses(positions, settings.patch, settings.rotateMaxUpm);
    const universes = withMirrors(other, mirrors, settings.patch);
    for (const o of outputs) o.send(universes);
  }
}
