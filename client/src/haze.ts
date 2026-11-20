// Haze view (prototype): rays of a spotlight in the room, seen from the front slightly offset.
// Every ray is traced through all mirrors and collected as a trail of light in its own buffer.
// The buffer decays from frame to frame and the rays shift slightly, so a few rays become a
// calm veil of light. The haze is equally dense everywhere.
import { ELEMENTS, MIRRORS_PER_ELEMENT } from "@parrafraktor/engine";
import { PREVIEW_STYLE, font } from "./preview-style.js";

export type MirrorSide = "hinten" | "vorn" | "beide";   // where the front side points at tilt 0
export interface HazeLamp { x: number; y: number; z: number }   // x: nach rechts, y: nach unten, z: nach vorn

const ELEMENT_W = 1.8;
const PITCH = ELEMENT_W / MIRRORS_PER_ELEMENT;
const MIRROR_W = PITCH - 0.012;
const DEPTH = 0.5;                       // distance of the elements one behind the other: assumed, not measured
const GAP_W = 0.25;                     // gap when they stand in a row
const ROOM = { x0: -5, x1: 5, y0: -3.5, y1: 2.6, z0: -4, z1: 9 };
// Camera from the audience, slightly offset and level: verticals stay vertical.
// It stands outside the room, so every point in it lies in front of it.
const CAMERA = { x: 3.5, z: 10.5 };
const LOOK_L = Math.hypot(CAMERA.x, CAMERA.z - 0.5);
const AHEAD = { x: -CAMERA.x / LOOK_L, z: (0.5 - CAMERA.z) / LOOK_L };   // looking towards the center of the installation
const RIGHT = { x: -AHEAD.z, z: AHEAD.x };
const REFLECTION = 0.9;                   // fraction a mirror reflects
const MAX_JUMPS = 6;
const RAY_MAX = 40;                   // longer than any distance in the room
const FRONT_LIGHT = 0.2;                    // cone darkened up to the elements, otherwise it outshines everything
const DECAY = 0.8;                   // rest of the last frame in the buffer
const FADE_OUT_M = 3.5;                   // light gets weaker along this path and does not end hard at the room's edge
const BRIGHTNESS = 300;
const RESOLUTION = 0.6;                  // buffer relative to CSS pixels: the haze is soft, that saves the most

export const HAZE_RAYS = 4000;
export const HAZE_LAMP_DEFAULT: Readonly<HazeLamp> = { x: 0, y: 1.5, z: 4 };   // in front of the elements, low
export const HAZE_DEPTH = { min: ROOM.z0 + 0.2, max: 8 } as const;
export const HAZE_ZOOM_DEFAULT = 32;

// 36 mirrors flat in memory, so computing allocates nothing
const FIELDS = 12;
const COUNT = ELEMENTS * MIRRORS_PER_ELEMENT;
const PLACE = COUNT * FIELDS;            // behind per element: cos, sin of the rotation, center x and z
const SIZE = PLACE + ELEMENTS * 4;
export function buildMirrors(angles: readonly number[], rotation: readonly number[], row: boolean, target = new Float64Array(SIZE)): Float64Array {
  for (let k = 0; k < ELEMENTS; k++) {
    const r = row ? 0 : ((rotation[k] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const mx = row ? (k - (ELEMENTS - 1) / 2) * (ELEMENT_W + GAP_W) : 0;
    const mz = row ? DEPTH : DEPTH * (ELEMENTS - 1 - k);   // Element 1 steht vorn
    target[PLACE + k * 4] = c; target[PLACE + k * 4 + 1] = s; target[PLACE + k * 4 + 2] = mx; target[PLACE + k * 4 + 3] = mz;
    for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
      const a = (angles[k * MIRRORS_PER_ELEMENT + i]! * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const u = (i + 0.5) * PITCH - ELEMENT_W / 2, o = (k * MIRRORS_PER_ELEMENT + i) * FIELDS;
      // center, half width, half height (tilt axis), normal of the side facing front at tilt 0
      target[o] = mx + u * c; target[o + 1] = u * s; target[o + 2] = mz;
      target[o + 3] = (ca * MIRROR_W * c) / 2; target[o + 4] = (ca * MIRROR_W * s) / 2; target[o + 5] = (sa * MIRROR_W) / 2;
      target[o + 6] = (-s * ELEMENT_W) / 2; target[o + 7] = (c * ELEMENT_W) / 2; target[o + 8] = 0;
      target[o + 9] = -sa * c; target[o + 10] = -sa * s; target[o + 11] = ca;
    }
  }
  return target;
}

function untilRoom(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (ROOM.x1 - ox) / dx); else if (dx < -1e-9) t = Math.min(t, (ROOM.x0 - ox) / dx);
  if (dy > 1e-9) t = Math.min(t, (ROOM.y1 - oy) / dy); else if (dy < -1e-9) t = Math.min(t, (ROOM.y0 - oy) / dy);
  if (dz > 1e-9) t = Math.min(t, (ROOM.z1 - oz) / dz); else if (dz < -1e-9) t = Math.min(t, (ROOM.z0 - oz) / dz);
  return Math.max(0, t);
}

export type Trace = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, strength: number, firstPath: boolean) => void;

// A ray: runs until it leaves the room or hits a back side
export function traceRay(
  sp: Float64Array, side: MirrorSide, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, strength: number, trace: Trace,
): void {
  let off = -1, g = strength;
  const bb = (MIRROR_W * MIRROR_W) / 4, hh = (ELEMENT_W * ELEMENT_W) / 4, margin = MIRROR_W / 2;
  const vz = side === "hinten" ? -1 : 1;
  for (let jump = 0; jump <= MAX_JUMPS; jump++) {
    let best = -1, tb = Infinity;
    // A mirror only reaches half a width around its axis: each element only checks the mirrors
    // the ray passes on its way through this layer.
    for (let k = 0; k < ELEMENTS; k++) {
      const l = PLACE + k * 4, c = sp[l]!, s = sp[l + 1]!, mx = sp[l + 2]!, mz = sp[l + 3]!;
      let t0 = 0, t1 = RAY_MAX;
      if (Math.abs(dz) > 1e-9) {
        const a = (mz - margin - oz) / dz, b = (mz + margin - oz) / dz;
        t0 = Math.max(0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
        if (t1 < 0 || t0 > tb) continue;
      } else if (Math.abs(oz - mz) > margin) continue;
      const u0 = (ox + dx * t0 - mx) * c + (oy + dy * t0) * s, u1 = (ox + dx * t1 - mx) * c + (oy + dy * t1) * s;
      const i0 = Math.max(0, Math.floor((Math.min(u0, u1) - margin + ELEMENT_W / 2) / PITCH));
      const i1 = Math.min(MIRRORS_PER_ELEMENT - 1, Math.floor((Math.max(u0, u1) + margin + ELEMENT_W / 2) / PITCH));
      for (let i = i0; i <= i1; i++) {
        const j = k * MIRRORS_PER_ELEMENT + i;
        if (j === off) continue;
        const o = j * FIELDS;
        const nx = sp[o + 9]!, ny = sp[o + 10]!, nz = sp[o + 11]!;
        const nd = dx * nx + dy * ny + dz * nz;
        if (Math.abs(nd) < 1e-7) continue;
        const t = ((sp[o]! - ox) * nx + (sp[o + 1]! - oy) * ny + (sp[o + 2]! - oz) * nz) / nd;
        if (t < 1e-5 || t >= tb) continue;
        const px = ox + dx * t - sp[o]!, py = oy + dy * t - sp[o + 1]!, pz = oz + dz * t - sp[o + 2]!;
        if (Math.abs(px * sp[o + 3]! + py * sp[o + 4]! + pz * sp[o + 5]!) > bb) continue;
        if (Math.abs(px * sp[o + 6]! + py * sp[o + 7]! + pz * sp[o + 8]!) > hh) continue;
        best = j; tb = t;
      }
    }
    if (best < 0) {
      const t = untilRoom(ox, oy, oz, dx, dy, dz);
      trace(ox, oy, oz, ox + dx * t, oy + dy * t, oz + dz * t, g, jump === 0);
      return;
    }
    const px = ox + dx * tb, py = oy + dy * tb, pz = oz + dz * tb;
    trace(ox, oy, oz, px, py, pz, g, jump === 0);
    const o = best * FIELDS;
    const nx = sp[o + 9]!, ny = sp[o + 10]!, nz = sp[o + 11]!;
    const nd = dx * nx + dy * ny + dz * nz;
    if (side !== "beide" && nd * vz > 0) return;   // the back side swallows the light
    dx -= 2 * nd * nx; dy -= 2 * nd * ny; dz -= 2 * nd * nz;
    ox = px; oy = py; oz = pz; off = best; g *= REFLECTION;
  }
}

// All rays: evenly across the cone, shifted by (shiftU, shiftV) within the grid cell
export function traceAll(
  sp: Float64Array, side: MirrorSide, lamp: HazeLamp, zoom: number, count: number, shiftU: number, shiftV: number, trace: Trace,
): number {
  // axis to the center of the installation
  let ax = -lamp.x, ay = -lamp.y, az = DEPTH - lamp.z;
  const la = Math.hypot(ax, ay, az) || 1;
  ax /= la; ay /= la; az /= la;
  // Zwei Richtungen quer dazu
  const rl = Math.hypot(az, ax) || 1;
  const rx = az / rl, rz = -ax / rl;
  const ox = ay * rz, oy = az * rx - ax * rz, oz = -ay * rx;
  const half = Math.tan((Math.min(170, zoom) * Math.PI) / 360);
  const density = Math.ceil(Math.sqrt((count * 4) / Math.PI));
  let counted = 0;
  for (let ix = 0; ix < density; ix++) for (let iy = 0; iy < density; iy++) {
    const u = ((ix + shiftU) / density) * 2 - 1, v = ((iy + shiftV) / density) * 2 - 1, r = Math.hypot(u, v);
    if (r > 1) continue;
    counted++;
    const margin = (r - 0.88) / 0.12, g = r <= 0.88 ? 1 : 1 - margin * margin * (3 - 2 * margin);   // weicher Rand
    let dx = ax + (rx * u + ox * v) * half, dy = ay + (oy * v) * half, dz = az + (rz * u + oz * v) * half;
    const l = Math.hypot(dx, dy, dz);
    dx /= l; dy /= l; dz /= l;
    traceRay(sp, side, lamp.x, lamp.y, lamp.z, dx, dy, dz, g, trace);
  }
  return counted;
}

// position in the image and drawing
export class HazeImage {
  private readonly mirror = new Float64Array(SIZE);
  private readonly image = document.createElement("canvas");
  private readonly imageFront = document.createElement("canvas");
  // Two layers: light behind the frontmost element lies under the silhouette, in front of it above
  private buffer = new Float32Array(0);
  private bufferFront = new Float32Array(0);
  private pixels: ImageData | null = null;
  private pixelsFront: ImageData | null = null;
  private width = 0;   // CSS-Pixel
  private height = 0;
  private b = 0;
  private h = 0;
  private focal = 1;   // Bildweite in CSS-Pixeln
  private mx = 0;      // Bildmitte
  private my = 0;
  private sequence = 0;
  private last = 0;
  // For the display, so it can be read on the iPad
  private msCompute = 0;
  private msFrame = 16;

  private sx = (x: number, z: number) => {
    const dx = x - CAMERA.x, dz = z - CAMERA.z;
    return this.mx + (this.focal * (dx * RIGHT.x + dz * RIGHT.z)) / (dx * AHEAD.x + dz * AHEAD.z);
  };
  private sy = (x: number, y: number, z: number) =>
    this.my + (this.focal * y) / ((x - CAMERA.x) * AHEAD.x + (z - CAMERA.z) * AHEAD.z);

  private fit(b: number, h: number): void {
    this.width = b;
    this.height = h;
    this.focal = 2 * Math.min(h, b / 1.6);
    this.mx = b / 2;
    this.my = h / 2;
    const width = Math.max(1, Math.round(b * RESOLUTION)), height = Math.max(1, Math.round(h * RESOLUTION));
    if (width === this.b && height === this.h) return;
    this.b = width; this.h = height;
    this.image.width = width; this.image.height = height;
    this.imageFront.width = width; this.imageFront.height = height;
    this.buffer = new Float32Array(width * height);
    this.bufferFront = new Float32Array(width * height);
    this.pixels = this.image.getContext("2d")?.createImageData(width, height) ?? null;
    this.pixelsFront = this.imageFront.getContext("2d")?.createImageData(width, height) ?? null;
  }

  // Point on the canvas (CSS pixels) → lamp: it stays at its depth and follows the finger, in the image
  point(x: number, y: number, lamp: HazeLamp): HazeLamp {
    const margin = 14;
    const qx = (Math.min(this.width - margin, Math.max(margin, x)) - this.mx) / this.focal;
    const qy = (Math.min(this.height - margin, Math.max(margin, y)) - this.my) / this.focal;
    const dx = AHEAD.x + RIGHT.x * qx, dz = AHEAD.z + RIGHT.z * qx;
    const t = (lamp.z - CAMERA.z) / dz;
    return {
      x: Math.min(ROOM.x1 - 0.2, Math.max(ROOM.x0 + 0.2, CAMERA.x + dx * t)),
      y: Math.min(ROOM.y1 - 0.2, Math.max(ROOM.y0 + 0.2, qy * t)),
      z: lamp.z,
    };
  }

  // Put the lamp at a new depth, it stays in the image
  inDepth(lamp: HazeLamp, z: number): HazeLamp {
    const next = { ...lamp, z: Math.min(HAZE_DEPTH.max, Math.max(HAZE_DEPTH.min, z)) };
    return this.point(this.sx(next.x, next.z), this.sy(next.x, next.y, next.z), next);
  }

  onLamp(x: number, y: number, lamp: HazeLamp): boolean {
    return Math.hypot(x - this.sx(lamp.x, lamp.z), y - this.sy(lamp.x, lamp.y, lamp.z)) < 32;
  }

  // Trail of light from a to b, the strength runs from ga to gb
  private drawTrace(p: Float32Array, ax: number, ay: number, bx: number, by: number, ga: number, gb: number): void {
    const w = this.b, h = this.h;
    let dx = bx - ax, dy = by - ay;
    // Clip to the image: close to the camera trails get very long
    let t0 = 0, t1 = 1;
    const edge = (q: number, r: number): boolean => {
      if (q === 0) return r >= 0;
      const t = r / q;
      if (q < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    if (!edge(-dx, ax) || !edge(dx, w - 1 - ax) || !edge(-dy, ay) || !edge(dy, h - 1 - ay)) return;
    const gStart = ga + (gb - ga) * t0, gEnd = ga + (gb - ga) * t1;
    const x0 = ax + dx * t0, y0 = ay + dy * t0;
    dx *= t1 - t0; dy *= t1 - t0;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const n = Math.ceil(Math.max(adx, ady));
    if (n < 1) return;
    // The same light per length, also diagonally; spread over two neighbouring pixels against stairs
    const factor = Math.hypot(dx, dy) / n, sx = dx / n, sy = dy / n, sg = ((gEnd - gStart) * factor) / n;
    let x = x0, y = y0, each = gStart * factor;
    if (adx >= ady) {
      for (let i = 0; i < n; i++, x += sx, y += sy, each += sg) {
        const yy = y - 0.5, q = x | 0, r = Math.floor(yy), f = yy - r;
        if (x < 0 || q >= w || r < 0 || r + 1 >= h) continue;
        p[r * w + q]! += each * (1 - f);
        p[(r + 1) * w + q]! += each * f;
      }
    } else {
      for (let i = 0; i < n; i++, x += sx, y += sy, each += sg) {
        const xx = x - 0.5, r = y | 0, q = Math.floor(xx), f = xx - q;
        if (y < 0 || r >= h || q < 0 || q + 1 >= w) continue;
        p[r * w + q]! += each * (1 - f);
        p[r * w + q + 1]! += each * f;
      }
    }
  }

  draw(
    ctx: CanvasRenderingContext2D, width: number, height: number, angles: readonly number[], rotation: readonly number[], row: boolean,
    lamp: HazeLamp, zoom: number, side: MirrorSide, color: string,
  ): void {
    const start = performance.now();
    this.fit(width, height);
    const sp = buildMirrors(angles, rotation, row, this.mirror);
    const p = this.buffer, pv = this.bufferFront;
    for (let i = 0; i < p.length; i++) { p[i]! *= DECAY; pv[i]! *= DECAY; }

    // path of the lamp up to the first element plane darkened
    const zFront = row ? DEPTH : DEPTH * (ELEMENTS - 1), zBack = row ? DEPTH : 0;
    const limit = lamp.z < zBack ? zBack : lamp.z > zFront ? zFront : null;
    const px = (x: number, z: number) => this.sx(x, z) * RESOLUTION;
    const py = (x: number, y: number, z: number) => this.sy(x, y, z) * RESOLUTION;
    // trail into the right layer, split at the plane of the frontmost element if needed
    const place = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, ga: number, gb: number) => {
      const xa = px(ax, az), ya = py(ax, ay, az), xb = px(bx, bz), yb = py(bx, by, bz);
      if (az >= zFront && bz >= zFront) { this.drawTrace(pv, xa, ya, xb, yb, ga, gb); return; }
      if (az <= zFront && bz <= zFront) { this.drawTrace(p, xa, ya, xb, yb, ga, gb); return; }
      const t = (zFront - az) / (bz - az), mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
      const xm = px(mx, zFront), ym = py(mx, my, zFront), gm = ga + (gb - ga) * t;
      this.drawTrace(az > zFront ? pv : p, xa, ya, xm, ym, ga, gm);
      this.drawTrace(az > zFront ? p : pv, xm, ym, xb, yb, gm, gb);
    };
    // draw the piece; the path counts from the elements, behind them the light gets weaker
    let path = 0;
    const piece = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, g: number) => {
      const long = Math.hypot(bx - ax, by - ay, bz - az);
      const ga = g * Math.exp(-path / FADE_OUT_M);
      path += long;
      place(ax, ay, az, bx, by, bz, ga, g * Math.exp(-path / FADE_OUT_M));
    };
    const dark = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, g: number) =>
      place(ax, ay, az, bx, by, bz, g * FRONT_LIGHT, g * FRONT_LIGHT);
    this.sequence++;
    const shiftU = (this.sequence * 0.7548776662) % 1, shiftV = (this.sequence * 0.5698402910) % 1;
    const count = traceAll(sp, side, lamp, zoom, HAZE_RAYS, shiftU, shiftV, (ax, ay, az, bx, by, bz, g, first) => {
      if (first) path = 0;
      if (first && limit !== null) {
        const t = (limit - az) / (bz - az || 1e-9);
        if (t >= 1) {
          dark(ax, ay, az, bx, by, bz, g);
        } else if (t <= 0) {
          piece(ax, ay, az, bx, by, bz, g);
        } else {
          const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
          dark(ax, ay, az, mx, my, limit, g);
          piece(mx, my, limit, bx, by, bz, g);
        }
      } else {
        piece(ax, ay, az, bx, by, bz, g);
      }
    });

    // Buffer → colour. Brighter when the image is larger; the trails get longer there.
    const [fr, fg, fb] = color.split(",").map(Number) as [number, number, number];
    const [gr, gg, gb] = PREVIEW_STYLE.hazeBackground.split(",").map(Number) as [number, number, number];
    const s = (BRIGHTNESS * (1 - DECAY) * ((this.focal * RESOLUTION) / 340)) / Math.max(1, count);
    const d = this.pixels, dv = this.pixelsFront;
    if (d && dv) {
      const data = d.data, dataV = dv.data;
      for (let i = 0, o = 0; i < p.length; i++, o += 4) {
        const v = p[i]! * s, vv = pv[i]! * s;
        const k = v < 0.002 ? v : 1 - Math.exp(-v), kv = vv < 0.002 ? vv : 1 - Math.exp(-vv);
        data[o] = gr + (fr - gr) * k;
        data[o + 1] = gg + (fg - gg) * k;
        data[o + 2] = gb + (fb - gb) * k;
        data[o + 3] = 255;
        dataV[o] = fr * kv;
        dataV[o + 1] = fg * kv;
        dataV[o + 2] = fb * kv;
        dataV[o + 3] = 255;
      }
      this.image.getContext("2d")?.putImageData(d, 0, 0);
      this.imageFront.getContext("2d")?.putImageData(dv, 0, 0);
    }
    const end = performance.now();
    this.msCompute += (end - start - this.msCompute) * 0.08;
    if (this.last) this.msFrame += (Math.min(250, end - this.last) - this.msFrame) * 0.08;
    this.last = end;

    ctx.drawImage(this.image, 0, 0, width, height);
    this.decoration(ctx, width, height, sp, lamp, color, count, () => {
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(this.imageFront, 0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
    });
  }

  // floor, mirrors as silhouette, lamp, stats
  private decoration(ctx: CanvasRenderingContext2D, width: number, height: number, sp: Float64Array, lamp: HazeLamp, color: string, count: number, lightInFront: () => void): void {
    const X = this.sx, Y = this.sy;
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${PREVIEW_STYLE.line},0.12)`;
    ctx.beginPath();
    // Umriss des Bodens
    [[ROOM.x0, ROOM.z0], [ROOM.x1, ROOM.z0], [ROOM.x1, ROOM.z1], [ROOM.x0, ROOM.z1], [ROOM.x0, ROOM.z0]].forEach(([x, z], e) => {
      if (e) ctx.lineTo(X(x!, z!), Y(x!, ROOM.y1, z!));
      else ctx.moveTo(X(x!, z!), Y(x!, ROOM.y1, z!));
    });
    ctx.stroke();
    const lx = X(lamp.x, lamp.z), ly = Y(lamp.x, lamp.y, lamp.z), r = 12;
    const drawLamp = () => {
      if (PREVIEW_STYLE.glow) {
        const gloss = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
        gloss.addColorStop(0, `rgba(${color},0.9)`);
        gloss.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = gloss;
        ctx.beginPath(); ctx.arc(lx, ly, r, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.fillStyle = `rgb(${color})`;
      ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, 2 * Math.PI); ctx.fill();
    };
    // Silhouette from back to front: what is in front hides what is behind, the lamp behind too.
    // Order by depth, because elements in a row can all stand equally far in front.
    const ordering = Array.from({ length: ELEMENTS }, (_, k) => k).sort((a, b) => sp[PLACE + a * 4 + 3]! - sp[PLACE + b * 4 + 3]!);
    let lampMissing = true;
    for (const k of ordering) {
      const l = PLACE + k * 4, c = sp[l]!, s = sp[l + 1]!, mx = sp[l + 2]!, mz = sp[l + 3]!, h = ELEMENT_W / 2;
      if (lampMissing && lamp.z < mz) { drawLamp(); lampMissing = false; }
      ctx.fillStyle = `rgba(${PREVIEW_STYLE.silhouette},0.88)`;
      for (let i = 0; i < MIRRORS_PER_ELEMENT; i++) {
        const o = (k * MIRRORS_PER_ELEMENT + i) * FIELDS;
        ctx.beginPath();
        for (let e = 0; e < 4; e++) {
          const a = e === 0 || e === 3 ? -1 : 1, b = e < 2 ? -1 : 1;
          const x = sp[o]! + a * sp[o + 3]! + b * sp[o + 6]!, y = sp[o + 1]! + a * sp[o + 4]! + b * sp[o + 7]!, z = sp[o + 2]! + a * sp[o + 5]! + b * sp[o + 8]!;
          if (e) ctx.lineTo(X(x, z), Y(x, y, z));
          else ctx.moveTo(X(x, z), Y(x, y, z));
        }
        ctx.closePath();
        ctx.fill();
      }
      // frame: rotated in its plane, nothing else
      ctx.strokeStyle = `rgba(${PREVIEW_STYLE.mirrorEdge},0.5)`;
      ctx.beginPath();
      for (let e = 0; e < 5; e++) {
        const a = e === 0 || e === 3 || e === 4 ? -h : h, b = e < 2 || e === 4 ? -h : h;
        const x = mx + a * c - b * s, y = a * s + b * c;
        if (e) ctx.lineTo(X(x, mz), Y(x, y, mz));
        else ctx.moveTo(X(x, mz), Y(x, y, mz));
      }
      ctx.stroke();
    }
    lightInFront();
    if (lampMissing) drawLamp();

    ctx.font = font(10);
    ctx.fillStyle = `rgba(${PREVIEW_STYLE.text},0.5)`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    // on the floor above the lamp, otherwise the hint sticks out of the image
    if (PREVIEW_STYLE.hints) ctx.fillText("Drag spotlight", Math.max(52, Math.min(width - 52, lx)), ly + r + 12 > height ? ly - r - 12 : ly + r);
    ctx.textAlign = "right";
    if (PREVIEW_STYLE.stats) ctx.fillText(`${count} beams · ${this.msCompute.toFixed(1)} ms · ${Math.round(1000 / this.msFrame)} fps`, width - 8, 6);
  }
}
