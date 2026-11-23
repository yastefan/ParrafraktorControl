// Light scenes: static DMX snapshots of other devices, linked to the presets (see
// packages/protocol/src/scenes.ts for the rules). Pure functions, so the ticker and the tests use the same.
//
// Saved as scenes.json: { active, slots: [{ time, universes: { "1": base64 (512 bytes) } } | null] }
import { PRESET_COUNT, isPresetNumber, type SceneInfo, type Settings } from "@parrafraktor/protocol";
import { patchMask, patchUniverses, type PatchElement } from "@parrafraktor/engine";

export interface Scene {
  time: string;
  universes: Map<number, Uint8Array>;
}

export interface SceneFile {
  active: number | null;
  slots: (Scene | null)[];
}

type Frames = ReadonlyMap<number, Uint8Array>;

// Universes that are recorded: those of the patch plus the extra ones from the settings
export const recordUniverses = (e: Settings): number[] =>
  [...new Set([...patchUniverses(e.patch), ...e.scenes.universes])].sort((a, b) => a - b);

export const sceneInfo = (s: Scene | null): SceneInfo | null =>
  s ? { universes: [...s.universes.keys()].sort((a, b) => a - b), time: s.time } : null;

// Take a snapshot of what the MA sends. Mirror channels are left out (set to 0): they always
// come from the engine. Returns the missing universes if one was not received recently.
export function captureScene(
  frames: Frames,
  universes: readonly number[],
  patch: readonly PatchElement[],
  time = new Date(),
): { scene: Scene } | { missing: number[] } {
  const missing = universes.filter((u) => !frames.has(u));
  if (missing.length) return { missing };
  const mask = patchMask(patch);
  const result = new Map<number, Uint8Array>();
  for (const u of universes) {
    const data = new Uint8Array(512);
    data.set(frames.get(u)!.subarray(0, 512));
    const m = mask.get(u);
    if (m) for (let c = 0; c < 512; c++) if (m[c]) data[c] = 0;
    result.set(u, data);
  }
  return { scene: { time: time.toISOString(), universes: result } };
}

// What the other channels should show: per universe 512 values (mirror channels are filled in later).
// The universes of the patch are always there (other channels 0 without playback, so the node
// can merge by HTP), other universes only with playback and a scene.
export function sceneTargets(scene: Scene | null, playback: boolean, patch: readonly PatchElement[]): Map<number, Uint8Array> {
  const targets = new Map<number, Uint8Array>();
  for (const u of patchUniverses(patch)) targets.set(u, new Uint8Array(512));
  if (playback && scene) for (const [u, data] of scene.universes) targets.set(u, new Uint8Array(data));
  return targets;
}

// Linear cross-fade per channel; a universe missing on one side counts as 0
export function blendFrames(from: Frames, to: Frames, t: number): Map<number, Uint8Array> {
  const result = new Map<number, Uint8Array>();
  for (const u of new Set([...from.keys(), ...to.keys()])) {
    const a = from.get(u), b = to.get(u);
    const data = new Uint8Array(512);
    for (let c = 0; c < 512; c++) data[c] = Math.round((a?.[c] ?? 0) + ((b?.[c] ?? 0) - (a?.[c] ?? 0)) * t);
    result.set(u, data);
  }
  return result;
}

// Cross-fade with the output from/to the MA: only where the MA's universe is known
export function blendFromMa(ma: Frames, app: Frames, t: number): Map<number, Uint8Array> {
  const result = new Map<number, Uint8Array>();
  for (const [u, data] of app) {
    const m = ma.get(u);
    result.set(u, m ? blendFrames(new Map([[u, m]]), new Map([[u, data]]), t).get(u)! : data);
  }
  return result;
}

// Put the mirror channels of the engine into the scene universes
export function withMirrors(other: Frames, mirrors: Frames, patch: readonly PatchElement[]): Map<number, Uint8Array> {
  const result = new Map<number, Uint8Array>();
  for (const [u, data] of other) result.set(u, new Uint8Array(data));
  for (const [u, m] of patchMask(patch)) {
    const data = result.get(u) ?? new Uint8Array(512);
    const engine = mirrors.get(u);
    if (engine) for (let c = 0; c < 512; c++) if (m[c]) data[c] = engine[c]!;
    result.set(u, data);
  }
  return result;
}

// ---------- File ----------

export function sceneFileJson(f: SceneFile): unknown {
  return {
    active: f.active,
    slots: f.slots.map((s) => s && {
      time: s.time,
      universes: Object.fromEntries([...s.universes].map(([u, d]) => [String(u), Buffer.from(d).toString("base64")])),
    }),
  };
}

export function checkSceneFile(raw: unknown): SceneFile {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(r.slots) ? r.slots : [];
  const slots = Array.from({ length: PRESET_COUNT }, (_, i) => checkScene(list[i]));
  return { active: isPresetNumber(r.active) ? r.active : null, slots };
}

function checkScene(raw: unknown): Scene | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const universes = new Map<number, Uint8Array>();
  const u = typeof r.universes === "object" && r.universes !== null ? (r.universes as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(u)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || typeof value !== "string") continue;
    const data = Buffer.from(value, "base64");
    if (data.length !== 512) continue;
    universes.set(n, new Uint8Array(data));
  }
  if (!universes.size) return null;
  return { time: typeof r.time === "string" ? r.time : "", universes };
}
