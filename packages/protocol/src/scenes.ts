// Light scenes: static DMX snapshots of other devices (lamps, haze, …), linked to the presets.
//
//   record:    storing a preset also takes the current DMX values heard from the MA
//              (only then; with record off the preset keeps the scene it already has)
//   playback:  while the output is on, the app sends the scene of the last recalled preset
//   universes: universes to record in addition to those of the patch
//
// The channels of the Parrafraktor always come from the engine; they are not recorded.
// Without playback, the other channels in the universes of the patch are 0 (so the node can
// merge with the MA by HTP) and other universes are not sent at all.
//
// New fields are English (the existing protocol fields stay German).

export const SCENE_UNIVERSES_MAX = 8;

export interface SceneSettings {
  record: boolean;
  playback: boolean;
  universes: number[];
}

export const SCENE_DEFAULTS: Readonly<SceneSettings> = { record: false, playback: false, universes: [] };

// What the client sees of a scene (the values themselves stay on the server)
export interface SceneInfo {
  universes: number[];
  time: string;   // ISO time of recording
}

// "1, 2 5" → [1, 2, 5]; invalid parts are dropped
export function parseUniverses(text: string, limit: { min: number; max: number }): number[] {
  const numbers = text.split(/[\s,;]+/).filter(Boolean).map(Number);
  return checkUniverseList(numbers, limit);
}

export function checkUniverseList(raw: unknown, limit: { min: number; max: number }): number[] {
  const list = Array.isArray(raw) ? raw : [];
  const ok = list.filter((u): u is number => Number.isInteger(u) && u >= limit.min && u <= limit.max);
  return [...new Set(ok)].sort((a, b) => a - b).slice(0, SCENE_UNIVERSES_MAX);
}
