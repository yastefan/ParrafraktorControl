// Old German names, kept for code outside this repository that imports the engine from source
// (the 40C3 talk, repo Parrafraktor-Vortrag). Remove once it uses the English names.
import { MIRRORS_PER_ELEMENT } from "./layout.js";
import { IMPULSE_DEFAULTS, type ImpulseKind, type ImpulseSettings, type RunningImpulse } from "./impulse.js";
import { Engine, PARAMETER_DEFAULTS, selection, type Parameter } from "./pattern.js";

/** @deprecated use MIRRORS_PER_ELEMENT */
export const SPIEGEL_N = MIRRORS_PER_ELEMENT;
/** @deprecated use PARAMETER_DEFAULTS */
export const PARAMETER_VORGABE = PARAMETER_DEFAULTS;
/** @deprecated use IMPULSE_DEFAULTS */
export const IMPULS_VORGABE = IMPULSE_DEFAULTS;
/** @deprecated use ImpulseKind */
export type ImpulsArt = ImpulseKind;
/** @deprecated use ImpulseSettings */
export type ImpulsEinstellung = ImpulseSettings;
/** @deprecated use RunningImpulse */
export type LaufenderImpuls = RunningImpulse;

/** @deprecated use selection() (fields slot, count, fraction, phaseOffset, place, side) */
export function auswahl(p: Parameter, g: number) {
  const s = selection(p, g);
  return { platz: s.slot, anzahl: s.count, anteil: s.fraction, versatz: s.phaseOffset, lage: s.place, seite: s.side };
}

declare module "./pattern.js" {
  interface Engine {
    /** @deprecated use advance() */
    weiter(p: Parameter, dt: number): void;
    /** @deprecated use all() */
    alle(p: Parameter): ReturnType<Engine["all"]>;
  }
}
Engine.prototype.weiter = function (p: Parameter, dt: number) { this.advance(p, dt); };
Engine.prototype.alle = function (p: Parameter) { return this.all(p); };
