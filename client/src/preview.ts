// Live preview, computed with the same engine as on the server.
// The engine runs on locally (also without connection) and is synced with the cycles in the state.
//
// Two views, depending on the layout:
//   reihe           top view: the elements side by side, every mirror as a line
//   hintereinander  front view like "Classic" in the simulation: the three elements on top of each other
//                   hintereinander, jedes in seiner Ebene gedreht. Dazu rechts jedes Element einzeln.
//                   mode "spiegel" shows the mirrors, "buehne" only the light that comes from behind through
//                   all three layers, hard in black and white. "waerme" shows the same light
//                   blurred in false colours: the shape you see from a distance.
// Plus, independent of the layout, the view "phaser" like the phaser editor of the grandMA3:
// a diagram with every mirror as a point (horizontal its place, vertical its angle),
// behind it the trace of the last movement; under every element its front view, small.
// And the view "reflexion" like the website simulation, only simpler: top view of the
// room, the elements side by side, a fixed spotlight in front; the rays are reflected by the
// mirrors and hit the walls. Switchable to the haze (haze.ts): rays
// with all reflections, from the front slightly offset, the elements one behind the other as installed.
import {
  ELEMENTS, Engine, MIRRORS_PER_ELEMENT, holeAt, smooth, applyImpulses,
  type ImpulseSettings, type ImpulseAngles, type RunningImpulse, type Parameter, type Position,
} from "@parrafraktor/engine";
import type { Layout, Tick } from "@parrafraktor/protocol";
import { PREVIEW_STYLE, font } from "./preview-style.js";
import { HazeImage, HAZE_LAMP_DEFAULT, HAZE_ZOOM_DEFAULT, type HazeLamp, type MirrorSide } from "./haze.js";

export type FrontMode = "spiegel" | "buehne" | "waerme";
export type View = "bild" | "phaser" | "reflexion";
export { PREVIEW_STYLE, setPreviewStyle, type PreviewStyle } from "./preview-style.js";

export interface PreviewData {
  parameter: Parameter;
  live: boolean;
  layout: Layout;
  rotateMaxRpm: number;
  mode: FrontMode;
  view: View;
  phaserElements: boolean;   // phaser: front view of every element in the background
  haze: boolean;            // reflection: rays in the haze instead of the top view
  hazeSide: MirrorSide;
  fade: { id: number; anteil: number } | null;   // cross-fade to a preset (from the server, protocol field names)
  fadeDuration: number;                              // Sekunden
  impulse: ImpulseSettings;
  impulses: RunningImpulse[];                       // Zeiten beim Empfang des Stands
  impulsesSinceS: number;                             // how long the state has been here
  flash: ImpulseAngles;
}

const DEVIATION_MAX = 0.05;   // cycles; larger deviations are taken over at once

// dimensions as in the simulation (metres)
const ELEMENT_W = 1.8;
const PITCH = ELEMENT_W / MIRRORS_PER_ELEMENT;   // 0,15 m Achsabstand
const MIRROR_W = PITCH - 0.012;       // mirror slightly narrower than the pitch
const GAP = 0.25;                   // gap between the elements (top view)
const VIEW_FRONT = 2.75;                // sichtbare Breite eines einzelnen Elements: Raute 1,8 × √2 plus Rand
const VIEW_ALL = 2.04;              // whole image: closer, the tips of the diamond may be cut off
const THERMAL_SCALE = 0.35;               // thermal image: pixels per CSS pixel; it is blurred, that saves a lot
const THERMAL_BLUR_M = 0.07;       // radius of the blur in the room; estimated, not tied to a distance
const THERMAL_GAIN = 1.4;

const COLOR = PREVIEW_STYLE;

// Follow small deviations smoothly, so the preview does not stutter
const follow = (local: number, server: number): number =>
  Math.abs(server - local) > DEVIATION_MAX ? server : local + (server - local) * 0.2;

const deg = (g: number): number => (g * Math.PI) / 180;

// Winkel in −180 … +180
const wrap = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;

const TRACE_N = 20;
const HOLE_TRACE_N = 130;   // aperture from the front: about 4 s of trace at one entry per 30 ms

// ---------- Reflection: room, spotlight, rays (like the website simulation, fixed) ----------

interface Point { x: number; y: number }
interface RoomMirror { a: Point; b: Point; n: Point }   // ends and normal of the front side

const ROOM = { b: 10, t: 6 };                  // metres, the back wall at the top
const ELEMENT_Y = 1.8;                         // distance of the elements to the back wall
export const LAMP_DEFAULT: Readonly<Point> = { x: ROOM.b / 2, y: 5.3 };   // spotlight centered in front of the elements
const RAYS = 240;
const MAX_REFLECTIONS = 3;

// The 36 mirrors in the room: elements side by side, front side towards the spotlight
export function roomMirrors(angles: number[]): RoomMirror[] {
  const total = ELEMENTS * ELEMENT_W + (ELEMENTS - 1) * GAP;
  const list: RoomMirror[] = [];
  for (let k = 0; k < ELEMENTS; k++) {
    const x0 = (ROOM.b - total) / 2 + k * (ELEMENT_W + GAP);
    for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
      const a = deg(angles[k * MIRRORS_PER_ELEMENT + i]!);
      const p = { x: x0 + (i + 0.5) * PITCH, y: ELEMENT_Y };
      const u = { x: Math.cos(a), y: Math.sin(a) };
      list.push({
        a: { x: p.x - (u.x * MIRROR_W) / 2, y: p.y - (u.y * MIRROR_W) / 2 },
        b: { x: p.x + (u.x * MIRROR_W) / 2, y: p.y + (u.y * MIRROR_W) / 2 },
        n: { x: -u.y, y: u.x },
      });
    }
  }
  return list;
}

// Intersection of the ray (o + t·d) with the segment a–b; returns t or null
function cut(o: Point, d: Point, a: Point, b: Point): number | null {
  const ex = b.x - a.x, ey = b.y - a.y;
  const denominator = d.x * ey - d.y * ex;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / denominator;
  const s = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / denominator;
  return t > 1e-6 && s >= 0 && s <= 1 ? t : null;
}

function untilWall(o: Point, d: Point): number {
  let t = Infinity;
  if (d.x > 0) t = Math.min(t, (ROOM.b - o.x) / d.x);
  if (d.x < 0) t = Math.min(t, -o.x / d.x);
  if (d.y > 0) t = Math.min(t, (ROOM.t - o.y) / d.y);
  if (d.y < 0) t = Math.min(t, -o.y / d.y);
  return t;
}

// zoom of the spotlight: full beam angle in degrees
export const ZOOM = { min: 4, max: 120, default: 70 } as const;

// Light cone of the spotlight, aimed at the center of the elements; back sides swallow the light
export function rays(mirror: RoomMirror[], lamp: Point, zoom: number = ZOOM.default): { paths: Point[][]; hits: Point[] } {
  const basis = Math.atan2(ELEMENT_Y - lamp.y, ROOM.b / 2 - lamp.x);
  const cone = deg(zoom / 2);
  const paths: Point[][] = [], hits: Point[] = [];
  for (let r = 0; r < RAYS; r++) {
    const w = basis - cone + (2 * cone * r) / (RAYS - 1);
    let o: Point = { ...lamp };
    let d: Point = { x: Math.cos(w), y: Math.sin(w) };
    const path = [o];
    let reflections = 0;
    for (;;) {
      let bestT = Infinity, best: RoomMirror | null = null;
      for (const sp of mirror) {
        const t = cut(o, d, sp.a, sp.b);
        if (t !== null && t < bestT) { bestT = t; best = sp; }
      }
      if (!best) {
        const t = untilWall(o, d);
        const end = { x: o.x + d.x * t, y: o.y + d.y * t };
        path.push(end);
        if (reflections > 0) hits.push(end);
        break;
      }
      const p = { x: o.x + d.x * bestT, y: o.y + d.y * bestT };
      path.push(p);
      const dn = d.x * best.n.x + d.y * best.n.y;
      if (dn >= 0 || reflections >= MAX_REFLECTIONS) break;
      d = { x: d.x - 2 * dn * best.n.x, y: d.y - 2 * dn * best.n.y };
      o = p;
      reflections++;
    }
    paths.push(path);
  }
  return { paths, hits };
}
// neon colours as in the UI (RGB triples for transparency)
const PHASER = {
  get point() { return COLOR.point; },
  get live() { return COLOR.pointLive; },
  get grid() { return `rgba(${COLOR.axis},0.12)`; },
  get null() { return `rgba(${COLOR.axis},0.4)`; },
  get border() { return `rgba(${COLOR.axis},0.18)`; },
  get text() { return `rgba(${COLOR.axis},0.9)`; },
};

// False colours for the thermal image: 256 RGB steps from black via violet and magenta to light yellow
const THERMAL_COLORS = (() => {
  const steps = [[0, 0, 0], [66, 12, 110], [176, 40, 120], [250, 130, 70], [255, 250, 200]];
  const f = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * (steps.length - 1), n = Math.min(steps.length - 2, Math.floor(x)), t = x - n;
    for (let k = 0; k < 3; k++) f[i * 3 + k] = steps[n]![k]! + (steps[n + 1]![k]! - steps[n]![k]!) * t;
  }
  return f;
})();

// Box filter in one direction: `lines` lines of length `length`, step per pixel and per line
function boxBlur(
  from: Float32Array, after: Float32Array, length: number, lines: number, r: number, step: number, lineStep: number,
): void {
  for (let z = 0; z < lines; z++) {
    const start = z * lineStep;
    let sum = 0, n = 0;
    for (let i = 0; i <= Math.min(r, length - 1); i++) { sum += from[start + i * step]!; n++; }
    for (let i = 0; i < length; i++) {
      after[start + i * step] = sum / n;
      if (i + r + 1 < length) { sum += from[start + (i + r + 1) * step]!; n++; }
      if (i - r >= 0) { sum -= from[start + (i - r) * step]!; n--; }
    }
  }
}

export class Preview {
  private engine = new Engine();
  private rotation = new Float64Array(ELEMENTS * MIRRORS_PER_ELEMENT);   // angle with rotation (TiltRotate)
  private last = performance.now();
  private frameId = 0;
  private lightCanvas = document.createElement("canvas");
  private thermalCanvas = document.createElement("canvas");
  private thermalA = new Float32Array(0);
  private thermalB = new Float32Array(0);
  private thermalImage: ImageData | null = null;
  // cross-fade to a preset: starting position and its own smoothly running fraction
  private lastAngles: number[] = [];
  private fade: { id: number; from: number[]; fraction: number } | null = null;
  // phaser: trace of the last angles (oldest first) and height of the axis, followed smoothly
  private trace: number[][] = [];
  private traceTime = 0;
  private range = 60;
  private axisCenter = 0;   // phaser: center of the axis in degrees (with phaserAxisOffset the offset, followed smoothly)
  // reflection: spotlight (movable) and scale of the room at the last drawing
  lamp: Point = { ...LAMP_DEFAULT };
  zoom: number = ZOOM.default;
  private roomScale = { m: 1, ox: 0, oy: 0 };
  // haze: its own position and zoom, because the spotlight stands elsewhere there
  hazeLamp: HazeLamp = { ...HAZE_LAMP_DEFAULT };
  hazeZoom: number = HAZE_ZOOM_DEFAULT;
  private hazeImage: HazeImage | null = null;
  private showsHaze = false;
  // aperture from the front: trace of the hole's center (metres) and time of the last entry
  private holeTrace: { x: number; y: number }[] = [];
  private holeTraceTime = 0;
  // Called per frame with the visible angles (degrees), e.g. for a graph over time
  onFrame: ((angles: readonly number[]) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly data: () => PreviewData | null,
  ) {}

  start(): void {
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const d = this.data();
      if (d) {
        this.engine.elementRotation = d.layout.drehung;
        this.engine.rotateMaxRpm = d.rotateMaxRpm;
        this.engine.advance(d.parameter, dt);
        const look = this.fading(d, this.angles(d, this.engine.all(d.parameter), dt), dt);
        this.lastAngles = look;
        const angles = this.withImpulses(d, look);
        this.draw(d, angles);
        this.onFrame?.(angles);
      }
      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  // Point on the canvas (CSS pixels) → room, kept inside the room
  private roomPoint(x: number, y: number): Point {
    const { m, ox, oy } = this.roomScale;
    return {
      x: Math.min(ROOM.b - 0.2, Math.max(0.2, (x - ox) / m)),
      y: Math.min(ROOM.t - 0.2, Math.max(0.2, (y - oy) / m)),
    };
  }

  // Is the point (CSS pixels) on the spotlight?
  onLamp(x: number, y: number): boolean {
    if (this.showsHaze) return this.hazeImage?.onLamp(x, y, this.hazeLamp) ?? false;
    const { m, ox, oy } = this.roomScale;
    return Math.hypot(x - (ox + this.lamp.x * m), y - (oy + this.lamp.y * m)) < Math.max(32, m * 0.6);   // generous for fingers
  }

  // Drag the spotlight to the point (CSS pixels)
  dragLamp(x: number, y: number): void {
    if (this.showsHaze) {
      if (this.hazeImage) this.hazeLamp = this.hazeImage.point(x, y, this.hazeLamp);
    } else {
      this.lamp = this.roomPoint(x, y);
    }
  }

  // depth of the spotlight in the haze
  setLampDepth(z: number): void {
    this.hazeLamp = this.hazeImage ? this.hazeImage.inDepth(this.hazeLamp, z) : { ...this.hazeLamp, z };
  }

  stop(): void {
    cancelAnimationFrame(this.frameId);
  }

  // Take over the cycles from the server
  sync(ticker: Tick): void {
    const e = this.engine;
    e.referenceCycles = follow(e.referenceCycles, ticker.umlaufVon);
    ticker.umlauf.forEach((u, g) => { if (g < e.cycles.length) e.cycles[g] = follow(e.cycles[g]!, u); });
    // flash: without tempo and kicks from the server the preview would continue differently after every avalanche
    if (ticker.tempo?.length === e.tempo.length) e.tempo.set(ticker.tempo);
    if (ticker.schub?.length === e.kick.length) e.kick.set(ticker.schub);
  }

  // Like the server: from the position at recall smoothly to the new look. The preview computes the
  // fraction itself, so it runs smoothly; the server sets start and end.
  private fading(d: PreviewData, target: number[], dt: number): number[] {
    if (!d.fade) {
      this.fade = null;
      return target;
    }
    if (this.fade?.id !== d.fade.id) {
      this.fade = { id: d.fade.id, from: this.lastAngles.length ? this.lastAngles : target, fraction: d.fade.anteil };
    } else if (d.fadeDuration > 0) {
      this.fade.fraction = Math.min(1, Math.max(d.fade.anteil, this.fade.fraction + dt / d.fadeDuration));
    }
    const b = this.fade, f = smooth(b.fraction);
    return target.map((w, g) => (b.from[g] ?? w) + (w - (b.from[g] ?? w)) * f);
  }

  // Lay impulses over the look as in the ticker; their time runs on locally since the state
  private withImpulses(d: PreviewData, angles: number[]): number[] {
    if (!d.impulses.length) return angles;
    const impulses = d.impulses.map((i) => ({ ...i, alterS: i.alterS + d.impulsesSinceS }));
    return applyImpulses(angles.map((tilt) => ({ tilt, upm: 0 })), impulses, d.impulse, d.flash, d.layout.drehung).map((s) => s.tilt);
  }

  // Visible angle per mirror in degrees: tilt plus the rotation via TiltRotate
  private angles(d: PreviewData, positions: Position[], dt: number): number[] {
    return positions.map((s, g) => {
      // With rotation a mirror may stand and keeps its angle (width, pause)
      this.rotation[g] = d.parameter.modus === "rotation" ? (this.rotation[g]! + s.upm * 6 * dt) % 360 : 0;
      return s.tilt + this.rotation[g]!;
    });
  }

  private draw(d: PreviewData, angles: number[]): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const width = c.clientWidth, height = c.clientHeight;
    if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx || !width || !height) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.showsHaze = d.view === "reflexion" && d.haze;
    if (d.view === "phaser") this.phaser(ctx, width, height, d, angles);
    else if (this.showsHaze) {
      this.hazeImage ??= new HazeImage();
      this.hazeImage.draw(
        ctx, width, height, angles, d.layout.drehung, d.layout.anordnung !== "hintereinander",
        this.hazeLamp, this.hazeZoom, d.hazeSide, d.live ? COLOR.lightLive : COLOR.light,
      );
    }
    else if (d.view === "reflexion") this.reflection(ctx, width, height, d, angles);
    else if (d.layout.anordnung === "hintereinander") this.frontView(ctx, width, height, dpr, d, angles);
    else this.topView(ctx, width, height, d.live, angles);
  }

  // ---------- Phaser ----------

  private phaser(ctx: CanvasRenderingContext2D, width: number, height: number, d: PreviewData, angles: number[]): void {
    const w = angles.map(wrap);
    // Trace: about one frame every 30 ms, 0.6 s long
    const now = performance.now();
    if (now - this.traceTime > 30) {
      this.traceTime = now;
      this.trace.push(w);
      if (this.trace.length > TRACE_N) this.trace.shift();
    }
    // Axis: fixed or as high as needed in 30° steps, followed smoothly
    const largest = Math.max(...this.trace.flat().map(Math.abs), 1);
    const target = Math.min(180, Math.max(30, Math.ceil((largest + 3) / 30) * 30));
    this.range = COLOR.phaserAxis > 0 ? COLOR.phaserAxis : this.range + (target - this.range) * 0.08;
    const centerTarget = COLOR.phaserAxisOffset && d.parameter.modus !== "oeffnung" ? d.parameter.offset : 0;
    this.axisCenter += (centerTarget - this.axisCenter) * 0.08;
    if (Math.abs(centerTarget - this.axisCenter) < 0.05) this.axisCenter = centerTarget;
    const m = this.axisCenter;
    const r = this.range;

    const left = 40, right = 8, top = 10, bottom = 50, gap = 10;
    const pb = (width - left - right - (ELEMENTS - 1) * gap) / ELEMENTS;
    const ph = height - top - bottom;
    const py = (a: number) => top + ph / 2 - ((a - m) / r) * (ph / 2);
    const px = (k: number, i: number) => left + k * (pb + gap) + ((i + 0.5) / MIRRORS_PER_ELEMENT) * pb;
    // colour of the points, optionally one per element
    const colorOf = (k: number) => (d.live ? PHASER.live : (COLOR.pointElements[k] ?? PHASER.point));

    ctx.fillStyle = COLOR.background;
    ctx.fillRect(0, 0, width, height);
    // grid and labels
    ctx.font = font(10);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const step = r > 120 ? 90 : r > 60 ? 45 : 15;
    for (let a = Math.ceil((m - r - 0.01) / step) * step; a <= m + r + 0.01; a += step) {
      const y = py(a);
      ctx.strokeStyle = a === 0 ? PHASER.null : PHASER.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = PHASER.text;
      ctx.fillText(`${a > 0 ? "+" : ""}${a}°`, left - 6, y);
    }
    for (let k = 0; k < ELEMENTS; k++) {
      const x0 = left + k * (pb + gap);
      ctx.strokeStyle = PHASER.border;
      ctx.strokeRect(x0 + 0.5, top + 0.5, pb - 1, ph - 1);
      // below, the element from above as in "Simple": every mirror as a line under its point
      const sy = top + ph + 13, length = (pb / MIRRORS_PER_ELEMENT) * 0.9;
      ctx.strokeStyle = PHASER.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, sy - 9, pb - 1, 18);
      ctx.strokeStyle = d.live ? `rgb(${PHASER.live})` : COLOR.mirror;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
        const a = deg(angles[k * MIRRORS_PER_ELEMENT + i]!);
        const dx = (Math.cos(a) * length) / 2, dy = (Math.sin(a) * length) / 2;
        ctx.beginPath();
        ctx.moveTo(px(k, i) - dx, sy - dy);
        ctx.lineTo(px(k, i) + dx, sy + dy);
        ctx.stroke();
      }
      ctx.fillStyle = PHASER.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`Element ${k + 1}`, x0 + pb / 2, sy + 13);
    }

    // Optionally every element from the front behind the diagram, in its rotation. Scale so that every
    // mirror crosses the zero line under its point: a rotated mirror crosses it 1/cos further
    // out. If the mirrors are almost horizontal, that no longer works, then full width.
    if (d.phaserElements) {
      for (let k = 0; k < ELEMENTS; k++) {
        const x0 = left + k * (pb + gap);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, top, pb, ph);
        ctx.clip();
        ctx.globalAlpha = 0.65;
        const cos = Math.abs(Math.cos(deg(d.layout.drehung[k] ?? 0)));
        this.element(ctx, x0 + pb / 2, top + ph / 2, (pb / ELEMENT_W) * (cos > 0.3 ? cos : 1), k, d, angles, 1);
        ctx.restore();
      }
    }

    // Trace: older points paler and smaller
    const n = this.trace.length;
    this.trace.forEach((image, j) => {
      const age = (j + 1) / n;
      image.forEach((a, g) => {
        const k = Math.floor(g / MIRRORS_PER_ELEMENT), i = g % MIRRORS_PER_ELEMENT;
        ctx.fillStyle = `rgba(${colorOf(k)},${0.25 * age * age})`;
        ctx.beginPath();
        ctx.arc(px(k, i), py(a), 1.5 + 1.5 * age, 0, 2 * Math.PI);
        ctx.fill();
      });
    });

    // Graph per element, interrupted at a wrap (rotation beyond ±180°)
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    for (let k = 0; k < ELEMENTS; k++) {
      ctx.strokeStyle = `rgba(${colorOf(k)},0.55)`;
      ctx.beginPath();
      for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
        const a = w[k * MIRRORS_PER_ELEMENT + i]!;
        const before = i > 0 ? w[k * MIRRORS_PER_ELEMENT + i - 1]! : a;
        if (i === 0 || Math.abs(a - before) > 180) ctx.moveTo(px(k, i), py(a));
        else ctx.lineTo(px(k, i), py(a));
      }
      ctx.stroke();
    }

    // The mirrors themselves: point with glow
    for (let g = 0; g < w.length; g++) {
      const k = Math.floor(g / MIRRORS_PER_ELEMENT), i = g % MIRRORS_PER_ELEMENT;
      const x = px(k, i), y = py(w[g]!), color = colorOf(k);
      if (COLOR.glow) {
        ctx.fillStyle = `rgba(${color},0.25)`;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = `rgb(${color})`;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // ---------- Reflexion ----------

  private reflection(ctx: CanvasRenderingContext2D, width: number, height: number, d: PreviewData, angles: number[]): void {
    const m = Math.min(width / ROOM.b, height / ROOM.t);
    const ox = (width - ROOM.b * m) / 2, oy = (height - ROOM.t * m) / 2;
    this.roomScale = { m, ox, oy };
    const X = (x: number) => ox + x * m, Y = (y: number) => oy + y * m;
    const color = d.live ? COLOR.lightLive : COLOR.light;

    ctx.fillStyle = COLOR.background;
    ctx.fillRect(0, 0, width, height);
    // grid (1 m) and walls
    ctx.strokeStyle = `rgba(${COLOR.line},0.04)`;
    ctx.lineWidth = 1;
    for (let x = 0; x <= ROOM.b; x++) { ctx.beginPath(); ctx.moveTo(X(x), Y(0)); ctx.lineTo(X(x), Y(ROOM.t)); ctx.stroke(); }
    for (let y = 0; y <= ROOM.t; y++) { ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(ROOM.b), Y(y)); ctx.stroke(); }
    ctx.strokeStyle = `rgba(${COLOR.line},0.14)`;
    ctx.strokeRect(X(0), Y(0), ROOM.b * m, ROOM.t * m);

    const mirror = roomMirrors(angles);
    const lamp = this.lamp;
    const { paths, hits } = rays(mirror, lamp, this.zoom);

    // rays additive, reflected ones brighter than the path to the mirror
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = Math.max(1, m * 0.015);
    for (const path of paths) {
      for (let n = 1; n < path.length; n++) {
        ctx.strokeStyle = `rgba(${color},${n === 1 ? 0.05 : 0.1})`;
        ctx.beginPath();
        ctx.moveTo(X(path[n - 1]!.x), Y(path[n - 1]!.y));
        ctx.lineTo(X(path[n]!.x), Y(path[n]!.y));
        ctx.stroke();
      }
    }
    const spot = m * 0.2;
    for (const t of hits) {
      const g = ctx.createRadialGradient(X(t.x), Y(t.y), 0, X(t.x), Y(t.y), spot);
      g.addColorStop(0, `rgba(${color},0.35)`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(X(t.x) - spot, Y(t.y) - spot, 2 * spot, 2 * spot);
    }
    ctx.globalCompositeOperation = "source-over";

    // mirror: bright front side (towards the spotlight), dark back side
    ctx.lineCap = "round";
    for (const sp of mirror) {
      ctx.strokeStyle = COLOR.backSide;
      ctx.lineWidth = Math.max(2, m * 0.05);
      ctx.beginPath(); ctx.moveTo(X(sp.a.x), Y(sp.a.y)); ctx.lineTo(X(sp.b.x), Y(sp.b.y)); ctx.stroke();
      const o = 0.012;
      ctx.strokeStyle = d.live ? `rgb(${COLOR.lightLive})` : `rgb(${COLOR.mirrorEdge})`;
      ctx.lineWidth = Math.max(1, m * 0.022);
      ctx.beginPath();
      ctx.moveTo(X(sp.a.x + sp.n.x * o), Y(sp.a.y + sp.n.y * o));
      ctx.lineTo(X(sp.b.x + sp.n.x * o), Y(sp.b.y + sp.n.y * o));
      ctx.stroke();
    }
    // Scheinwerfer
    if (COLOR.glow) {
      const gloss = ctx.createRadialGradient(X(lamp.x), Y(lamp.y), 0, X(lamp.x), Y(lamp.y), m * 0.4);
      gloss.addColorStop(0, `rgba(${color},0.9)`);
      gloss.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = gloss;
      ctx.beginPath(); ctx.arc(X(lamp.x), Y(lamp.y), m * 0.4, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.fillStyle = `rgb(${color})`;
    ctx.beginPath(); ctx.arc(X(lamp.x), Y(lamp.y), Math.max(3, m * 0.09), 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = `rgba(${COLOR.text},0.4)`;
    ctx.font = font(10);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Back wall", X(ROOM.b / 2), Y(0) + 4);
    ctx.textBaseline = "top";
    if (COLOR.hints) ctx.fillText("Drag spotlight", X(lamp.x), Y(lamp.y) + m * 0.3);
  }

  // ---------- Draufsicht ----------

  private topView(ctx: CanvasRenderingContext2D, width: number, height: number, live: boolean, angles: number[]): void {
    const total = ELEMENTS * ELEMENT_W + (ELEMENTS - 1) * GAP;
    const m = Math.min((width - 24) / total, (height - 24) / 0.3);
    const x0 = (width - total * m) / 2;
    const y = height / 2;
    for (let k = 0; k < ELEMENTS; k++) {
      const ex = x0 + k * (ELEMENT_W + GAP) * m;
      ctx.strokeStyle = COLOR.frame;
      ctx.lineWidth = 1;
      ctx.strokeRect(ex, y - 0.1 * m, ELEMENT_W * m, 0.2 * m);   // frame of the element from above
      for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
        const a = deg(angles[k * MIRRORS_PER_ELEMENT + i]!);
        const px = ex + (i + 0.5) * PITCH * m;
        const dx = (Math.cos(a) * MIRROR_W * m) / 2, dy = (Math.sin(a) * MIRROR_W * m) / 2;
        ctx.strokeStyle = live ? COLOR.live : COLOR.mirror;
        ctx.lineWidth = Math.max(2, m * 0.012);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(px - dx, y - dy);
        ctx.lineTo(px + dx, y + dy);
        ctx.stroke();
      }
    }
  }

  // ---------- Vorderansicht ----------

  private frontView(
    ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number, d: PreviewData, angles: number[],
  ): void {
    // on the right a column with the elements one by one, on the left the whole image
    const column = Math.min(height / ELEMENTS, width * 0.22);
    const mainW = width - column - 8;
    const s = Math.min(mainW, height) / VIEW_ALL;
    const mx = mainW / 2, my = height / 2;

    ctx.fillStyle = d.mode === "spiegel" ? COLOR.background : "#000";
    ctx.fillRect(0, 0, mainW, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, mainW, height);
    ctx.clip();
    if (d.mode === "buehne") this.stage(ctx, mainW, height, dpr, mx, my, s, d, angles);
    else if (d.mode === "waerme") this.thermal(ctx, mainW, height, mx, my, s, d, angles);
    else this.mirrorsFront(ctx, mx, my, s, d, angles);
    if (COLOR.path && d.parameter.modus === "oeffnung") this.pathFront(ctx, mx, my, s, d.parameter);
    ctx.restore();

    for (let k = 0; k < ELEMENTS; k++) {
      const y0 = k * column;
      const x0 = width - column;
      ctx.fillStyle = COLOR.background;
      ctx.fillRect(x0 + 2, y0 + 2, column - 4, column - 4);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 + 2, y0 + 2, column - 4, column - 4);
      ctx.clip();
      this.element(ctx, x0 + column / 2, y0 + column / 2, (column - 8) / VIEW_FRONT, k, d, angles, 1);
      ctx.restore();
      ctx.fillStyle = `rgba(${COLOR.text},0.55)`;
      ctx.font = font(11);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const place = k === 0 ? " front" : k === ELEMENTS - 1 ? " back" : "";
      ctx.fillText(`${k + 1}${place} · ${d.layout.drehung[k] ?? 0}°`, x0 + 7, y0 + 6);
    }
  }

  // Aperture from the front: fixed path of the hole dashed (not with drift, it has none), plus the trace of the
  // last seconds (shows drift and wobble, how the hole really ran) and the hole itself as a circle
  // (position as for the first element; with lag the others follow behind).
  private pathFront(ctx: CanvasRenderingContext2D, mx: number, my: number, s: number, p: Parameter): void {
    const w = (p.weite / 100) * s, r0 = (p.groesse / 100) * s;
    const hole = holeAt(p, this.engine.referenceCycles);
    const now = performance.now();
    if (now - this.holeTraceTime > 500) this.holeTrace = [];   // was not visible for a while: start afresh
    if (now - this.holeTraceTime > 30) {
      this.holeTraceTime = now;
      this.holeTrace.push({ x: hole.x, y: hole.y });
      if (this.holeTrace.length > HOLE_TRACE_N) this.holeTrace.shift();
    }
    ctx.save();
    ctx.lineWidth = 1.5;
    if (p.bahn !== "drift") {
      ctx.strokeStyle = `rgba(${COLOR.pathColor},0.6)`;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      switch (p.bahn) {
        case "kreis": ctx.arc(mx, my, w, 0, 2 * Math.PI); break;
        case "linie": ctx.moveTo(mx - w, my); ctx.lineTo(mx + w, my); break;
        case "iris": ctx.arc(mx, my, r0, 0, 2 * Math.PI); ctx.moveTo(mx + r0 + w, my); ctx.arc(mx, my, r0 + w, 0, 2 * Math.PI); break;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // trace: center of the hole, older pieces paler
    const n = this.holeTrace.length;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let j = 1; j < n; j++) {
      const a = this.holeTrace[j - 1]!, b = this.holeTrace[j]!;
      ctx.strokeStyle = `rgba(${COLOR.pathColor},${(0.9 * j / n).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(mx + a.x * s, my + a.y * s);
      ctx.lineTo(mx + b.x * s, my + b.y * s);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgb(${COLOR.pathColor})`;
    ctx.beginPath();
    ctx.arc(mx + hole.x * s, my + hole.y * s, Math.max(1, hole.r * s), 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // Mirrors from the front: backlight behind, the elements from back to front on top
  private mirrorsFront(ctx: CanvasRenderingContext2D, mx: number, my: number, s: number, d: PreviewData, angles: number[]): void {
    this.gegenlicht(ctx, mx, my, s, d.live, 0.55);
    for (let k = ELEMENTS - 1; k >= 0; k--) this.element(ctx, mx, my, s, k, d, angles, 1 - k * 0.18);
  }

  // One element from the front: mirrors as strips, narrower when seen from the side.
  // The front side shines a little when it faces the audience, the back side is dark.
  private element(
    ctx: CanvasRenderingContext2D, mx: number, my: number, s: number, k: number, d: PreviewData, angles: number[], depth: number,
  ): void {
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(deg(d.layout.drehung[k] ?? 0));
    const half = (ELEMENT_W / 2) * s;
    for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
      const a = deg(angles[k * MIRRORS_PER_ELEMENT + i]!);
      const frontSide = Math.cos(a) >= 0;
      const b = Math.max(1, Math.abs(Math.cos(a)) * MIRROR_W * s);
      const x = ((i + 0.5) * PITCH - ELEMENT_W / 2) * s;
      if (frontSide) {
        const bright = (0.16 + 0.3 * Math.cos(a) ** 4) * depth;
        const tone = (rgb: string) => rgb.split(",").map((c) => Math.min(255, Math.round(Number(c) * bright))).join(",");
        const margin = `rgb(${tone(COLOR.mirrorBright)})`, center = `rgb(${tone(COLOR.mirrorMid)})`;
        const gradient = ctx.createLinearGradient(0, -half, 0, half);
        gradient.addColorStop(0, margin);
        gradient.addColorStop(0.5, center);
        gradient.addColorStop(1, margin);
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = COLOR.backSide;
      }
      ctx.fillRect(x - b / 2, -half, b, 2 * half);
    }
    ctx.strokeStyle = d.live ? `rgba(${COLOR.pointLive},${0.7 * depth})` : `rgba(${COLOR.line},${0.35 * depth})`;
    ctx.lineWidth = Math.max(1, s * 0.015);
    ctx.strokeRect(-half, -half, 2 * half, 2 * half);
    ctx.restore();
  }

  // Light through all three layers as a mask: inside the frames it is bright, every mirror punches
  // out its strip. With `scale` pixels per CSS pixel; outside the frames it stays dark.
  private lightMask(
    c: HTMLCanvasElement, lc: CanvasRenderingContext2D, width: number, height: number, scale: number,
    mx: number, my: number, s: number, d: PreviewData, angles: number[], color: string,
  ): void {
    if (c.width !== Math.round(width * scale) || c.height !== Math.round(height * scale)) {
      c.width = Math.round(width * scale);
      c.height = Math.round(height * scale);
    }
    lc.setTransform(scale, 0, 0, scale, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, width, height);
    const half = (ELEMENT_W / 2) * s;
    lc.fillStyle = color;
    lc.beginPath();
    for (let k = 0; k < ELEMENTS; k++) {
      const r = deg(d.layout.drehung[k] ?? 0);
      const cos = Math.cos(r), sin = Math.sin(r);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], n) => {
        const px = mx + (x! * cos - y! * sin) * half, py = my + (x! * sin + y! * cos) * half;
        if (n) lc.lineTo(px, py);
        else lc.moveTo(px, py);
      });
      lc.closePath();
    }
    lc.fill("nonzero");

    // punch out the mirrors of all layers
    lc.globalCompositeOperation = "destination-out";
    lc.fillStyle = "#000";
    for (let k = 0; k < ELEMENTS; k++) {
      lc.save();
      lc.translate(mx, my);
      lc.rotate(deg(d.layout.drehung[k] ?? 0));
      for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
        const b = Math.abs(Math.cos(deg(angles[k * MIRRORS_PER_ELEMENT + i]!))) * MIRROR_W * s;
        if (b < 0.5) continue;
        const x = ((i + 0.5) * PITCH - ELEMENT_W / 2) * s;
        lc.fillRect(x - b / 2, -half, b, 2 * half);
      }
      lc.restore();
    }
    lc.globalCompositeOperation = "source-over";
  }

  // Stage: pure black and full light, without gradient and frames. Warm while the output is on.
  private stage(
    ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number,
    mx: number, my: number, s: number, d: PreviewData, angles: number[],
  ): void {
    const l = this.lightCanvas, lc = l.getContext("2d");
    if (!lc) return;
    this.lightMask(l, lc, width, height, dpr, mx, my, s, d, angles, d.live ? `rgb(${COLOR.lightLive})` : "#fff");
    ctx.drawImage(l, 0, 0, width, height);
  }

  // Thermal image: the same mask scaled down, blurred and in false colours.
  // Blur by hand, because Safari cannot do ctx.filter.
  private thermal(
    ctx: CanvasRenderingContext2D, width: number, height: number,
    mx: number, my: number, s: number, d: PreviewData, angles: number[],
  ): void {
    const c = this.thermalCanvas, lc = c.getContext("2d", { willReadFrequently: true });
    if (!lc) return;
    this.lightMask(c, lc, width, height, THERMAL_SCALE, mx, my, s, d, angles, "#fff");
    const w = c.width, h = c.height;
    if (!w || !h) return;
    if (this.thermalA.length !== w * h) {
      this.thermalA = new Float32Array(w * h);
      this.thermalB = new Float32Array(w * h);
      this.thermalImage = null;
    }
    lc.setTransform(1, 0, 0, 1, 0, 0);
    const raw = lc.getImageData(0, 0, w, h).data;
    const a = this.thermalA, b = this.thermalB;
    for (let i = 0; i < a.length; i++) a[i] = raw[i * 4 + 3]! / 255;
    const r = Math.max(1, Math.round(THERMAL_BLUR_M * s * THERMAL_SCALE));
    for (let run = 0; run < 3; run++) {
      boxBlur(a, b, w, h, r, 1, w);
      boxBlur(b, a, h, w, r, w, 1);
    }
    this.thermalImage ??= lc.createImageData(w, h);
    const image = this.thermalImage.data;
    for (let i = 0, o = 0; i < a.length; i++, o += 4) {
      const f = Math.min(255, Math.round(a[i]! * THERMAL_GAIN * 255)) * 3;
      image[o] = THERMAL_COLORS[f]!;
      image[o + 1] = THERMAL_COLORS[f + 1]!;
      image[o + 2] = THERMAL_COLORS[f + 2]!;
      image[o + 3] = 255;
    }
    lc.putImageData(this.thermalImage, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c, 0, 0, width, height);
  }

  private gegenlicht(ctx: CanvasRenderingContext2D, mx: number, my: number, s: number, live: boolean, strength: number): void {
    const color = live ? COLOR.lightLive : COLOR.light;
    const gradient = ctx.createRadialGradient(mx, my, 0, mx, my, s * 1.45);
    gradient.addColorStop(0, `rgba(${color},${strength})`);
    gradient.addColorStop(0.55, `rgba(${color},${0.65 * strength})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(mx - s * 1.5, my - s * 1.5, s * 3, s * 3);
  }
}
