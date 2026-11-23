import { describe, expect, it } from "vitest";
import { PARAMETER_DEFAULTS, PATCH_DEFAULTS } from "@parrafraktor/engine";
import { SETTINGS_DEFAULTS, checkPresets, checkSettings } from "@parrafraktor/protocol";
import { Controller } from "../src/controller.js";
import {
  blendFrames, blendFromMa, captureScene, checkSceneFile, recordUniverses, sceneFileJson, sceneTargets, withMirrors,
  type Scene,
} from "../src/scenes.js";

const patch = PATCH_DEFAULTS.map((e) => ({ ...e }));   // universe 1, addresses 1/38/75 → channels 1–111
const full = (v: number) => new Uint8Array(512).fill(v);
const frames = (...u: [number, number][]) => new Map(u.map(([n, v]) => [n, full(v)]));

describe("light scenes", () => {
  it("records patch and extra universes, without the mirror channels", () => {
    const r = captureScene(frames([1, 200], [2, 50]), [1, 2], patch);
    expect("scene" in r).toBe(true);
    const s = (r as { scene: Scene }).scene;
    const u1 = s.universes.get(1)!;
    expect(u1[0]).toBe(0);          // mirror 1 tilt
    expect(u1[110]).toBe(0);        // dimmer of element 3 (channel 111)
    expect(u1[111]).toBe(200);      // channel 112: another device
    expect(s.universes.get(2)![0]).toBe(50);
  });

  it("records nothing if a universe is missing", () => {
    expect(captureScene(frames([1, 9]), [1, 3], patch)).toEqual({ missing: [3] });
  });

  it("without playback: patch universes with 0, no other universes", () => {
    const scene: Scene = { time: "", universes: frames([1, 7], [2, 9]) };
    const off = sceneTargets(scene, false, patch);
    expect([...off.keys()]).toEqual([1]);
    expect(off.get(1)!.every((v) => v === 0)).toBe(true);
    const on = sceneTargets(scene, true, patch);
    expect([...on.keys()]).toEqual([1, 2]);
    expect(on.get(2)![5]).toBe(9);
  });

  it("puts the mirror channels of the engine over the scene", () => {
    const mirrors = frames([1, 99]);
    const out = withMirrors(frames([1, 7], [2, 9]), mirrors, patch);
    expect(out.get(1)![0]).toBe(99);
    expect(out.get(1)![110]).toBe(99);
    expect(out.get(1)![111]).toBe(7);
    expect(out.get(2)![0]).toBe(9);
  });

  it("fades linearly, a missing universe counts as 0", () => {
    const b = blendFrames(frames([1, 100]), frames([1, 200], [2, 50]), 0.5);
    expect(b.get(1)![3]).toBe(150);
    expect(b.get(2)![3]).toBe(25);
    // from the MA only where it is known
    const m = blendFromMa(frames([1, 0]), frames([1, 100], [2, 80]), 0.25);
    expect(m.get(1)![0]).toBe(25);
    expect(m.get(2)![0]).toBe(80);
  });

  it("saves and reads the file", () => {
    const scene: Scene = { time: "2026-11-23T12:00:00.000Z", universes: frames([1, 3], [4, 250]) };
    const json = JSON.parse(JSON.stringify(sceneFileJson({ active: 2, slots: [null, null, scene] })));
    const back = checkSceneFile(json);
    expect(back.active).toBe(2);
    expect(back.slots).toHaveLength(12);
    expect(back.slots[2]!.universes.get(4)![511]).toBe(250);
    expect(checkSceneFile({ slots: [{ universes: { 1: "kaputt" } }] }).slots[0]).toBeNull();
  });

  it("records the universes of the patch plus the extra ones", () => {
    const e = checkSettings({ scenes: { universes: [3, 2, 2, 0, "x"] } });
    expect(e.scenes.universes).toEqual([2, 3]);
    expect(recordUniverses(e)).toEqual([1, 2, 3]);
  });
});

describe("light scenes in the controller", () => {
  const make = (record: boolean) => {
    const c = new Controller({ ...PARAMETER_DEFAULTS }, checkSettings({ scenes: { record } }), checkPresets([]));
    let received = frames([1, 60]);
    c.setSceneSource(() => captureScene(received, [1], patch));
    return { c, set: (f: Map<number, Uint8Array>) => { received = f; } };
  };

  it("records with Record on, keeps the scene with Record off", () => {
    const { c, set } = make(true);
    c.storePreset(0);
    expect(c.scenes[0]?.universes).toEqual([1]);
    expect(c.activeScene).toBe(0);
    c.setSettings({ scenes: { record: false } });
    set(frames([1, 90]));
    c.storePreset(0);
    expect(c.activeSceneData!.universes.get(1)![200]).toBe(60);
  });

  it("does not record without Record", () => {
    const { c } = make(false);
    c.storePreset(1);
    expect(c.scenes[1]).toBeNull();
  });

  it("keeps the old scene and warns if the MA is missing", () => {
    const { c, set } = make(true);
    c.storePreset(0);
    set(new Map());
    c.storePreset(0);
    expect(c.scenes[0]).not.toBeNull();
    expect(c.sceneWarning).toMatch(/universe 1/);
  });

  it("recalling a preset plays its scene, deleting or clearing removes it", () => {
    const { c } = make(true);
    c.storePreset(0);
    c.setSettings({ scenes: { record: false } });
    c.storePreset(1);
    c.recallPreset(0);
    expect(c.activeScene).toBe(0);
    c.recallPreset(1);
    expect(c.activeScene).toBe(1);
    expect(c.activeSceneData).toBeNull();
    c.set({ amplitude: 33 });            // changing the look by hand keeps the scene
    expect(c.activeScene).toBe(1);
    c.clearScene(0);
    expect(c.scenes[0]).toBeNull();
    c.deletePreset(1);
    expect(c.activeScene).toBeNull();
  });
});

it("default settings have scenes off", () => {
  expect(SETTINGS_DEFAULTS.scenes).toEqual({ record: false, playback: false, universes: [] });
});

describe("light scenes in the ticker", () => {
  it("sends the scene with playback, fades it with the preset, 0 without playback", async () => {
    const { Ticker } = await import("../src/ticker.js");
    const c = new Controller({ ...PARAMETER_DEFAULTS }, checkSettings({ scenes: { record: true, playback: true }, ueberblendungS: 1 }), checkPresets([]));
    let received = frames([1, 200], [2, 100]);
    c.setSceneSource(() => captureScene(received, [1, 2], patch));
    c.storePreset(0);
    received = frames([1, 0], [2, 0]);
    c.storePreset(1);
    const sent: Map<number, Uint8Array>[] = [];
    const output = { name: "test", send: (u: ReadonlyMap<number, Uint8Array>) => { sent.push(new Map(u)); }, release() {}, close: async () => {}, status: () => ({ name: "", art: "ausgabe" as const, zustand: "aktiv" as const, text: "" }) };
    const t = new Ticker(c, { outputs: () => [output], maListener: () => null });
    const step = (dt: number) => (t as unknown as { step(dt: number): void }).step(dt);
    c.setTakeover(true);
    c.recallPreset(0);
    step(1.1);
    let last = sent.at(-1)!;
    expect(last.get(1)![111]).toBe(200);     // another device in the patch universe
    expect(last.get(1)![110]).toBe(255);     // dimmer of element 3 from the engine
    expect(last.get(2)![0]).toBe(100);
    c.recallPreset(1);                        // fades over 1 s to the scene with 0
    step(0.5);
    last = sent.at(-1)!;
    expect(last.get(2)![0]).toBe(50);
    step(0.6);
    c.setSettings({ scenes: { playback: false } });
    c.recallPreset(0);
    step(1.1);
    last = sent.at(-1)!;
    expect(last.get(1)![111]).toBe(0);
    expect(last.has(2)).toBe(false);
  });
});
