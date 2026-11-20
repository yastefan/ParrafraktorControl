// Pattern engine (base movement): the same computation as the simulation on the website (parrafraktor.js).
// A pattern is a base movement (Sine, Pendulum wave, Wind, Swarm, Flash, Rotation, Aperture, Rest)
// that runs continuously; events like a flash are impulses (impulse.ts). All movements are smooth,
// without jerks.
// How it runs across the mirrors is set by the controls: offset, amplitude, speed from/to, phase and
// group like the MAtricks of the grandMA3, plus the distribution from ordering (within an element),
// element order, counter-motion and fan.
// Computes in double like the simulation, so preview and mirrors move the same. Only the aperture
// does not exist in the simulation.
//
// The values of Mode, Ordering, HolePath and ElementOrder and the fields of Parameter are saved data
// (presets, settings) and protocol: they stay German.
import { MIRRORS_PER_ELEMENT, MIRRORS_TOTAL, elementMirrored, elementRanks, elementRank, type ElementOrder } from "./layout.js";

// sinus = sine, pendelwelle = pendulum wave, schwarm = swarm, gluehwuermchen = fireflies ("Flash"),
// oeffnung = aperture, ruhe = rest
export const MODES = ["sinus", "pendelwelle", "wind", "schwarm", "gluehwuermchen", "rotation", "oeffnung", "ruhe"] as const;
export type Mode = (typeof MODES)[number];
// What the desk offers. Pendulum wave (redundant to speed from → to) and Rest are out for now
// (user's wish, 2026-11-19); the engine still knows them, so old presets and files run as before.
export const MODES_SELECTABLE: readonly Mode[] = ["sinus", "wind", "schwarm", "gluehwuermchen", "rotation", "oeffnung"];

// Names on the desk (user's wish, 2026-11-19)
export const MODE_NAME: Record<Mode, string> = {
  sinus: "Sine",
  pendelwelle: "Pendulum wave",
  wind: "Wind",
  schwarm: "Swarm",
  gluehwuermchen: "Flash",
  rotation: "Rotation",
  oeffnung: "Aperture",
  ruhe: "Rest",
};

export const isMode = (x: unknown): x is Mode => typeof x === "string" && (MODES as readonly string[]).includes(x);

// Ordering: in which order the pattern reaches the twelve mirrors of an element
export const ORDERINGS = ["links", "rechts", "mitteAussen", "aussenMitte", "verschachtelt", "zufall"] as const;
export type Ordering = (typeof ORDERINGS)[number];
export const ORDERING_NAME: Record<Ordering, string> = {
  links: "left → right",
  rechts: "right → left",
  mitteAussen: "center → out",
  aussenMitte: "out → center",
  verschachtelt: "interleaved",
  zufall: "random",
};
export const isOrdering = (x: unknown): x is Ordering => (ORDERINGS as readonly unknown[]).includes(x);

// Aperture: how the hole moves
export const HOLE_PATHS = ["kreis", "linie", "iris", "drift"] as const;
export type HolePath = (typeof HOLE_PATHS)[number];
export const HOLE_PATH_NAME: Record<HolePath, string> = { kreis: "Circle", linie: "Line", iris: "Iris", drift: "Drift" };
export const isHolePath = (x: unknown): x is HolePath => (HOLE_PATHS as readonly unknown[]).includes(x);

// Fixed shuffle for the ordering "random": slot of mirror i
const RANDOM_ORDER = [7, 2, 10, 4, 0, 9, 5, 11, 1, 8, 3, 6];

export interface Parameter {
  modus: Mode;
  offset: number;      // degrees, base position of all mirrors
  // Offset per element: separate = every element has its own base position
  offsetGetrennt: boolean;
  offsetElemente: number[];
  amplitude: number;   // degrees
  // Speed from/to like in the MAtricks: the first mirror of the selection runs at "from",
  // the last at "to", spread in between (cycles per minute, BPM).
  // 0 = off: then only the other value applies, all mirrors run equally fast.
  speedVon: number;
  speedBis: number;
  phase: number;       // degrees, offset across the selection like MAtricks phase (360° = one wave across the selection)
  // Element phase, degrees, 0 = off: phase continues across the elements (element order). Otherwise the
  // phase runs within each element, and the elements are shifted by this much per rank in the element order.
  elementPhase: number;
  // Width (sine): fraction of the cycle in which a mirror moves, like Width in the grandMA3 phaser.
  // 100 = always, below that it rests on offset for the rest of the time: a narrow wave passes through.
  breite: number;      // %
  group: number;       // group size like MAtricks groups, 0 = off
  faecher: number;     // fan %, amplitude grows along the ordering (center/out: towards the edge)
  schwuenge: number;   // pendulum wave: after this many swings of the first mirror all are aligned again
  wellenlaenge: number; // wind: wavelength, this many mirrors move similarly
  // Swarm and Flash: mirrors with their own tempo (speed from → to) that pull each other along
  kopplung: number;    // coupling %, how strongly they pull (swarm) or kick (flash) each other
  rauschen: number;    // noise %, disturbance per mirror, keeps the swarm restless
  reichweite: number;  // reach: slots in the selection per side that see each other; 0 = all
  // Aperture: a hole through all elements standing one behind the other (see below)
  bahn: HolePath;
  groesse: number;     // size cm, radius of the hole
  weite: number;       // range cm, how far it travels from the center (iris: it opens by this much)
  kante: number;       // edge %, from hard to soft
  wabern: number;      // wobble %, breathing, drifting and deforming
  puls: number;        // pulse %, the size swings with the path (twice per cycle), ± this much of the radius
  nachlauf: number;    // lag %, the elements follow each other; 100 = ¼ cycle per element
  ordnung: Ordering;
  elementFolge: ElementOrder;
  gegenlauf: boolean;  // counter-motion: left half of each element mirrored
  speedJeElement: boolean; // speed from → to across the elements instead of the mirrors (rank by element order)
  pingpong: boolean;   // pattern runs there and back
  laeuft: boolean;     // running
}

export const PARAMETER_DEFAULTS: Readonly<Parameter> = {
  modus: "sinus",
  offset: 0,
  offsetGetrennt: false,
  offsetElemente: [0, 0, 0],
  amplitude: 40,
  speedVon: 3,
  speedBis: 0,
  phase: 360,
  elementPhase: 0,
  breite: 100,
  group: 0,
  faecher: 0,
  schwuenge: 24,
  wellenlaenge: 8,
  kopplung: 40,
  rauschen: 10,
  reichweite: 0,
  bahn: "kreis",
  groesse: 30,
  weite: 35,
  kante: 30,
  wabern: 30,
  puls: 0,
  nachlauf: 10,
  ordnung: "links",
  elementFolge: "vorneHinten",
  gegenlauf: false,
  speedJeElement: false,
  pingpong: false,
  laeuft: true,
};

// Position of a mirror: angle in degrees and speed for TiltRotate (upm = rpm, 0 = stopped)
export interface Position {
  tilt: number;
  upm: number;
}

// Smooth step 0 → 1: speed and acceleration are zero at the start and end
export const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));

// Integer lattice → 0 … 1, always the same (for the noise)
const lattice = (x: number, y: number): number => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Smooth noise (gradient noise) over x and t, roughly −1 … 1
function noise(x: number, t: number): number {
  const x0 = Math.floor(x), t0 = Math.floor(t), fx = x - x0, ft = t - t0;
  const g = (ix: number, it: number, dx: number, dt: number) => {
    const w = lattice(ix, it) * 2 * Math.PI;
    return Math.cos(w) * dx + Math.sin(w) * dt;
  };
  const a = g(x0, t0, fx, ft), b = g(x0 + 1, t0, fx - 1, ft);
  const c = g(x0, t0 + 1, fx, ft - 1), d = g(x0 + 1, t0 + 1, fx - 1, ft - 1);
  const sx = smooth(fx), st = smooth(ft);
  return (a + (b - a) * sx + (c - a) * st + (a - b - c + d) * sx * st) * Math.SQRT2;
}

// Wind: gusts travel along the ordering (one wavelength per cycle) and change slowly on the way.
// One layer of noise, smoothly limited to −1 … 1.
export const wind = (x: number, t: number): number =>
  Math.tanh(1.3 * noise(x - t, 0.4 * t + 3.7)) / Math.tanh(1.3);

// ---------- Aperture ----------
// Light only gets through where all three elements standing one behind the other are open (mirrors
// edge-on). For a hole at (x, y) each element therefore opens just a slit: the mirrors at the
// projection of the hole onto its axis, depending on its rotation. The slits cross in the hole.
// Half-open mirrors at the edge let it glide smoothly between the rows of mirrors.
const PITCH_M = 1.8 / MIRRORS_PER_ELEMENT;

export interface Hole { x: number; y: number; r: number }   // metres, image center = 0, y downwards

// Position of the hole after u cycles
export function holeAt(p: Parameter, u: number): Hole {
  const w = p.weite / 100, t = 2 * Math.PI * u;
  // Pulse: the radius swings twice per cycle by ± pulse %, in step with the path (stays periodic)
  let hole: Hole = { x: 0, y: 0, r: (p.groesse / 100) * (1 + (p.puls / 100) * Math.sin(4 * Math.PI * u)) };
  switch (p.bahn) {
    case "kreis": hole = { ...hole, x: w * Math.cos(t), y: w * Math.sin(t) }; break;
    case "linie": hole = { ...hole, x: w * Math.sin(t) }; break;
    case "iris": hole = { ...hole, r: hole.r + w * (0.5 - 0.5 * Math.cos(t)) }; break;
    case "drift": hole = { ...hole, x: w * 1.4 * noise(u, 3.1), y: w * 1.4 * noise(u, 8.7) }; break;
  }
  // Wobble: slow noise, faster than the path, so it lives even on a calm path
  const strength = p.wabern / 100, z = 3 * u;
  return {
    x: hole.x + 0.2 * strength * noise(z, 21.3),
    y: hole.y + 0.2 * strength * noise(z, 34.9),
    r: Math.max(0, hole.r * (1 + 0.7 * strength * noise(z, 47.1))),
  };
}

// How far mirror i of element k is open (0 … 1)
function slit(p: Parameter, u: number, rotation: number, k: number, i: number): number {
  const own = u - (p.nachlauf / 100) * 0.25 * k;
  const hole = holeAt(p, own);
  const a = (rotation * Math.PI) / 180;
  // A small deviation of its own per element: the slits do not quite meet, the hole deforms
  const jitter = 0.08 * (p.wabern / 100) * noise(3 * own, 60 + 13 * k);
  const center = hole.x * Math.cos(a) + hole.y * Math.sin(a) + jitter;
  return slitOpen(i, center, hole.r, 0.03 + 0.4 * (p.kante / 100));
}

// How far mirror i is open (0 … 1) for a slit around "center" (metres on the element's axis)
export function slitOpen(i: number, center: number, r: number, edge: number): number {
  const x = (i + 0.5) * PITCH_M - 0.9;
  return smooth((r + edge - Math.abs(x - center)) / (2 * edge));
}

// If one control is off (0), it takes the value of the other
const speeds = (p: Parameter): [number, number] => [p.speedVon || p.speedBis, p.speedBis || p.speedVon];

export interface Selection {
  slot: number;         // slot in the selection
  count: number;        // number of slots
  fraction: number;     // 0 (first) … 1 (last), for speed from/to
  phaseOffset: number;  // fraction of a cycle, from the phase
  place: number;        // for the fan: 0 … 1 along the ordering, or from the center to the edge
  side: number;         // −1 for the mirrored half with counter-motion
}

// Slot of mirror i (0 … 11) within its element according to the ordering, out of count slots.
// With center/out both halves share the slots.
export function orderingSlot(ordering: Ordering, i: number): { slot: number; count: number } {
  const h = MIRRORS_PER_ELEMENT / 2, fromInside = i < h ? h - 1 - i : i - h;
  switch (ordering) {
    case "rechts": return { slot: MIRRORS_PER_ELEMENT - 1 - i, count: MIRRORS_PER_ELEMENT };
    case "mitteAussen": return { slot: fromInside, count: h };
    case "aussenMitte": return { slot: h - 1 - fromInside, count: h };
    case "verschachtelt": return { slot: i % 2 === 0 ? i / 2 : h + (i - 1) / 2, count: MIRRORS_PER_ELEMENT };
    case "zufall": return { slot: RANDOM_ORDER[i]!, count: MIRRORS_PER_ELEMENT };
    default: return { slot: i, count: MIRRORS_PER_ELEMENT };
  }
}

// Slot of mirror g in the selection, as in the grandMA3: it gives its phase offset (fraction of a
// cycle, 0 … 1). First the ordering within the element, then the element order (if the elements run
// one after another, the slots count on across all three), finally the groups.
// With element order center → out the first element is the mirror image of the third.
export function selection(p: Parameter, g: number): Selection {
  const k = Math.floor(g / MIRRORS_PER_ELEMENT), h = MIRRORS_PER_ELEMENT / 2;
  const mirrored = elementMirrored(p.elementFolge, k);
  const i = mirrored ? MIRRORS_PER_ELEMENT - 1 - (g % MIRRORS_PER_ELEMENT) : g % MIRRORS_PER_ELEMENT;
  const fromInside = i < h ? h - 1 - i : i - h;
  let { slot, count } = orderingSlot(p.ordnung, i);
  const inner = { slot, count };
  const rank = elementRank(p.elementFolge, k);
  if (rank !== null) { slot += rank * count; count *= elementRanks(p.elementFolge); }
  const centered = p.ordnung === "mitteAussen" || p.ordnung === "aussenMitte";
  const place = centered ? (fromInside + 0.5) / h : (slot + 0.5) / count;
  // Groups: the pattern repeats every "group" mirrors
  if (p.group > 0) { slot %= p.group; count = Math.min(count, p.group); inner.slot %= p.group; inner.count = Math.min(inner.count, p.group); }
  // fraction: position in the selection from 0 (first) to 1 (last) – for speed from/to. With speed per
  // element only the element's rank counts: all mirrors of an element equally fast, the elements staggered
  // (one after another: from, middle, to; center → out: middle from, outer to; together: all from).
  const fraction = p.speedJeElement
    ? (rank !== null && elementRanks(p.elementFolge) > 1 ? rank / (elementRanks(p.elementFolge) - 1) : 0)
    : count > 1 ? Math.min(1, slot / (count - 1)) : 0;
  // Counter-motion: left half mirrored; in the mirrored element the whole angle once more
  const side = p.gegenlauf ? (i < h ? -1 : 1) * (mirrored ? -1 : 1) : 1;
  // Element phase: phase only within the element, plus a fixed offset per rank
  const phaseOffset = p.elementPhase > 0 && rank !== null
    ? (p.phase / 360) * (inner.slot / inner.count) + (p.elementPhase / 360) * rank
    : (p.phase / 360) * (slot / count);
  return { slot, count, fraction, place, side, phaseOffset };
}

// ---------- Rotation ----------
// TiltRotate only knows a speed, no position. Phase, width and counter-motion still work: every mirror
// has a target angle from its cycles, the engine counts how far it should have turned and sets the
// speed that gets it there – at most TiltRotate max.
const ROTATION_PEAK = 1.875;   // peak of smooth(): this much faster than on average a mirror turns within the width

// Target angle (degrees). Width: one full turn happens in the fraction b of the cycle, then it stands.
function targetAngle(p: Parameter, u: number, g: number, b: number): number {
  const { phaseOffset, side } = selection(p, g);
  const x = u - phaseOffset;
  if (b >= 1) return side * 360 * x;
  const whole = Math.floor(x), y = (x - whole) / b;
  const part = y >= 1 ? 1 : y + (smooth(y) - y) * Math.min(1, (1 - b) / 0.1);
  return side * 360 * (whole + part);
}

// Shortest way on the circle, −180 … 180
const shortestWay = (d: number): number => d - 360 * Math.round(d / 360);

// Time constant with which the mirrors come back together when all are equally fast
const RESYNC_S = 0.4;

// ---------- Swarm and Flash ----------
// Coupled oscillators: every mirror runs at its own tempo (speed from → to as with the sine) and pulls
// along the mirrors it "sees" (reach in slots of the selection, 0 = all). What is coupled is the cycle ψ;
// shown is, as with the sine, ψ − phase offset: without phase they seek alignment, with phase the wave
// the phase sets. Coupling and noise are relative to the tempo, so the image looks the same at any speed.
//  Swarm (Kuramoto, with noise and reach as in the Vicsek model): every mirror is pulled steadily towards
//    its neighbours, dψᵢ/dt = ωᵢ + K · mean(sin 2π(ψⱼ − ψᵢ)) + noise.
//    Coupling 0 = speed per mirror, much coupling = all lock in, in between islands and outliers.
//  Flash, "fireflies" (pulse-coupled, after Mirollo and Strogatz): every mirror charges up during the
//    cycle, at the end it "flashes" (a deflection to the side and back) and kicks the others on by a
//    fraction of their charge. Whoever is full from that flashes along at once: avalanches, until all
//    flash in time.
//    They also adapt their tempo like Pteroptyx (after Ermentrout): whoever sees a flash shortly after
//    their own was early and slows down, whoever sees one shortly before speeds up. Without that a
//    faster mirror would run away from the others for good; kicks only push forward.
// So that it looks like playing together and not like chance:
//  - No mirror runs slower than TEMPO_MIN × the slowest speed or faster than TEMPO_MAX × the fastest,
//    even if coupling and noise ask for more.
//  - Noise and initial scatter (on selecting, hidden by the cross-fade) are connected over NOISE_SLOTS:
//    neighbours are disturbed together as by a gust, not each on its own.
//  - Flash: kicks act at once while a mirror rests (outside the flash it stands on offset, you do not
//    see it), and at most up to the flash; the flash itself always runs at its own tempo, without
//    adaptation and noise – all flashes look alike. It lasts the width, but at least FLASH_MIN (otherwise
//    too fast) and at most FLASH_MAX of the cycle (so there is a rest).
// The state lives in the cycles per mirror; the preview syncs it with the server as usual.
// Fixed step: server (40 Hz) and preview (frame rate) compute the same steps this way and do not drift
// apart; the rest of the time waits for the next call (at most 5 ms delay).
const STEP_S = 0.005;
const TEMPO_MIN = 0.5;           // never slower than half the slowest speed (does not stop, does not run backwards)
const TEMPO_MAX = 1.5;           // at most 1.5 times the fastest speed
const COUPLING_MAX = 1.5;        // coupling 100 % = this many cycles/s per cycle/s of the mean tempo
const NOISE_MAX = 3;             // noise 100 % = disturbance about as strong as the mean tempo
const NOISE_SLOTS = 4;           // a disturbance is this many slots wide
// The noise runs with the cycles at speed "from" (this many lattice steps per cycle), not with a clock
// of its own: the preview syncs the cycles with the server, a clock of its own it would not – then
// preview and server would drift apart and the preview would jump when syncing.
const NOISE_RATE = 4;
const SCATTER = 1;               // initial scatter on selecting (cycles, about ± half a cycle)
const KICK_MAX = 1.5;            // Flash: coupling 100 % = all others together kick by 1.5 times the charge
const ADAPTATION = 0.6;          // Flash: this much the tempo changes per cycle full of flashes (at coupling 100 %)
const RECOVERY_S = 30;           // this fast the tempo returns to its own without flashes
const isCoupled = (m: Mode): boolean => m === "schwarm" || m === "gluehwuermchen";
const FLASH_MIN = 0.3, FLASH_MAX = 0.4;
const flashWidth = (p: Parameter): number => Math.min(Math.max(p.breite / 100, FLASH_MIN), FLASH_MAX);

export class Engine {
  // Cycles at speed "from": reference for re-aligning and time of the wind
  referenceCycles = 0;
  // Cycles run so far per mirror. Every mirror counts for itself, so nothing jumps when the speed
  // changes – the pattern only runs faster or slower.
  readonly cycles = new Float64Array(MIRRORS_TOTAL);
  private lastMode: Mode | null = null;
  // Rotation of the elements in their plane (degrees), only the aperture needs it. From the settings.
  elementRotation: readonly number[] = [0, 45, 90];
  // TiltRotate max. (rpm) from the settings: the rotation cannot ask for more
  rotateMaxRpm = 10;
  // Rotation: counted angle (degrees) and set speed per mirror
  private readonly turned = new Float64Array(MIRRORS_TOTAL);
  private readonly rpm = new Float64Array(MIRRORS_TOTAL);
  // Flash: kick still pending per mirror (cycles)
  // (public, so the preview can sync it with the server like the cycles)
  readonly kick = new Float64Array(MIRRORS_TOTAL);
  private remainder = 0;   // time not computed yet (s, less than STEP_S)
  readonly tempo = new Float64Array(MIRRORS_TOTAL).fill(1);   // Flash: adapted tempo (× own)

  // Let time pass (dt in seconds)
  advance(p: Parameter, dt: number): void {
    if (!p.laeuft) return;
    // Pendulum wave starts aligned, so you see it drifting apart
    if (p.modus !== this.lastMode) {
      if (p.modus === "pendelwelle") this.cycles.fill(this.referenceCycles);
      // Swarm and Flash start scattered, neighbours alike (always scattered the same way). That is a
      // jump, but a change of shape is cross-faded anyway (control and preview).
      this.kick.fill(0);
      this.tempo.fill(1);
      if (isCoupled(p.modus)) {
        for (let g = 0; g < MIRRORS_TOTAL; g++) this.cycles[g] += SCATTER * noise(selection(p, g).slot / NOISE_SLOTS, 7.7);
      }
      this.lastMode = p.modus;
    }
    const [from, to] = speeds(p);
    this.referenceCycles += (dt * from) / 60;
    if (isCoupled(p.modus)) {
      this.remainder += dt;
      for (; this.remainder >= STEP_S; this.remainder -= STEP_S) this.couple(p, from, to, STEP_S);
      this.turned.fill(0);
      this.rpm.fill(0);
      return;
    }
    const pull = 1 - Math.exp(-dt / RESYNC_S);
    for (let g = 0; g < MIRRORS_TOTAL; g++) {
      if (p.modus === "pendelwelle") {
        // As with real pendulums: while the first mirror swings "schwuenge" times, every following
        // one makes one swing more than its predecessor – then all stand aligned again.
        // Speed is the tempo of the first mirror and so speeds up the whole image.
        this.cycles[g] += ((dt * from) / 60) * (1 + selection(p, g).slot / p.schwuenge);
      } else if (from === to && !(p.modus === "rotation" && p.faecher > 0)) {
        // All equally fast (speed to off): reduce the distance to the reference, so with phase 0 all
        // mirrors run alike again. Whole cycles are invisible and drop at once, the rest (at most
        // ½ cycle) closes smoothly on the shortest way.
        this.cycles[g] += (dt * from) / 60;
        const d = this.referenceCycles - this.cycles[g]!;
        const whole = Math.round(d);
        this.cycles[g] += whole + (d - whole) * pull;
      } else {
        const { fraction, place } = selection(p, g);
        // Rotation: the fan staggers the speed along the ordering
        const fan = p.modus === "rotation" ? p.faecher / 100 : 0;
        this.cycles[g] += ((dt * (from + (to - from) * fraction)) / 60) * (1 - fan + fan * place);
      }
    }
    if (p.modus === "rotation") this.rotate(p, Math.max(from, to), dt);
    else {
      // Without rotation TiltRotate stands; next time the count starts at the tilt position
      this.turned.fill(0);
      this.rpm.fill(0);
    }
  }

  // One step for Swarm and Flash (see above)
  private couple(p: Parameter, from: number, to: number, dt: number): void {
    const a = Array.from({ length: MIRRORS_TOTAL }, (_, g) => selection(p, g));
    const mean = (from + to) / 2 / 60;                     // mean tempo, cycles/s
    const ceiling = (dt * TEMPO_MAX * Math.max(from, to)) / 60;
    const floor = (dt * TEMPO_MIN * Math.min(from, to)) / 60;
    const flash = p.modus === "gluehwuermchen";
    const b = flashWidth(p);
    // Position in the cycle as you see it (the flash is at the start)
    const psi = a.map((x, g) => this.cycles[g]! - x.phaseOffset);
    const u = this.cycles;
    const before = Float64Array.from(u);   // Swarm: all pull at the state before this step
    const sees = (i: number, j: number) => j !== i && (p.reichweite <= 0 || Math.abs(a[i]!.slot - a[j]!.slot) <= p.reichweite);
    const rests = (i: number) => flash && psi[i]! - Math.floor(psi[i]!) >= b;
    const fired: number[] = [];
    // What is coupled is the cycle: a mirror "fires" when its cycle is full. Without phase that is
    // exactly its flash, with phase it flashes later by its offset – so the beat becomes a wave.
    const push = (i: number, d: number) => {
      // Whoever fires starts afresh: kicks from the old cycle expire
      if (Math.floor(u[i]! + d) > Math.floor(u[i]!)) { fired.push(i); this.kick[i] = 0; }
      psi[i]! += d;
      u[i] += d;
    };
    // Flash at rest: the kick at once, but only up to firing and not into the visible flash
    const jump = (i: number) => {
      if (this.kick[i]! <= 0) return;
      const toFire = Math.floor(u[i]!) + 1 + 1e-9 - u[i]!, toFlash = Math.floor(psi[i]!) + 1 - psi[i]!;
      const d = Math.min(this.kick[i]!, toFire, toFlash);
      this.kick[i] -= d;
      push(i, d);
    };
    for (let i = 0; i < MIRRORS_TOTAL; i++) {
      const own = (dt * (from + (to - from) * a[i]!.fraction)) / 60;
      this.tempo[i] = 1 + (this.tempo[i]! - 1) * Math.exp(-dt / RECOVERY_S);
      // Flash during its flash: always at its own tempo
      if (flash && !rests(i)) { push(i, own); continue; }
      let d = own * this.tempo[i]!;
      if (p.modus === "schwarm" && p.kopplung > 0) {
        let sum = 0, n = 0;
        for (let j = 0; j < MIRRORS_TOTAL; j++) {
          if (sees(i, j)) { sum += Math.sin(2 * Math.PI * (before[j]! - before[i]!)); n++; }
        }
        if (n) d += (dt * (p.kopplung / 100) * COUPLING_MAX * mean * sum) / n;
      }
      // Noise: smooth, connected across the slots and over time, always the same
      d += dt * (p.rauschen / 100) * NOISE_MAX * mean
        * noise(a[i]!.slot / NOISE_SLOTS + 0.37 * Math.floor(i / MIRRORS_PER_ELEMENT), NOISE_RATE * this.referenceCycles + 11.3);
      push(i, Math.min(Math.max(d, floor), ceiling));
      // Flash: kicks that arrived during the flash act in the rest after it
      if (rests(i)) jump(i);
    }
    if (!flash || p.kopplung <= 0) return;
    // Flash: whoever flashed kicks the others, the fuller they are, the more. Whoever rests jumps at
    // once (at most up to the flash) and then flashes along; whoever is flashing jumps afterwards.
    for (let n = 0; n < fired.length; n++) {
      const j = fired[n]!;
      let seen = 0;
      for (let i = 0; i < MIRRORS_TOTAL; i++) if (sees(j, i)) seen++;
      if (!seen) continue;
      const kick = ((p.kopplung / 100) * KICK_MAX) / seen;
      for (let i = 0; i < MIRRORS_TOTAL; i++) {
        if (!sees(j, i) || fired.includes(i)) continue;
        const charge = u[i]! - Math.floor(u[i]!);   // how full the cycle is
        this.kick[i] += kick * charge;
        // Adapt the tempo: shortly after firing yourself slower, shortly before faster
        this.tempo[i] = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN,
          this.tempo[i]! - ((p.kopplung / 100) * ADAPTATION * Math.sin(2 * Math.PI * charge)) / seen));
        if (rests(i)) jump(i);
      }
    }
  }

  // Rotation: speed per mirror that brings it to its target angle. The width cannot be narrower than
  // TiltRotate max. allows, otherwise the mirror would never catch up.
  private rotate(p: Parameter, speed: number, dt: number): void {
    if (dt <= 0) return;
    const max = this.rotateMaxRpm;
    const b = Math.max(p.breite / 100, (ROTATION_PEAK * speed) / max);
    for (let g = 0; g < MIRRORS_TOTAL; g++) {
      const d = shortestWay(targetAngle(p, this.cycles[g]!, g, b) - this.turned[g]!);
      const rpm = Math.min(max, Math.max(-max, d / (6 * dt)));
      this.rpm[g] = rpm;
      this.turned[g] = (this.turned[g]! + rpm * 6 * dt) % 360;
    }
  }

  // Set the cycles as in the simulation, which only knows the counters for "from" and "to"
  setCycles(p: Parameter, from: number, to: number): void {
    this.referenceCycles = from;
    for (let g = 0; g < MIRRORS_TOTAL; g++) this.cycles[g] = from + (to - from) * selection(p, g).fraction;
  }

  // Position of mirror g (0 … 35, element k = g / 12)
  mirror(p: Parameter, g: number): Position {
    const k = Math.floor(g / MIRRORS_PER_ELEMENT);
    // Aperture: closed = 0°, open = edge-on; offset and amplitude do not apply here
    if (p.modus === "oeffnung") {
      return { tilt: 90 * slit(p, this.referenceCycles, this.elementRotation[k] ?? 0, k, g % MIRRORS_PER_ELEMENT), upm: 0 };
    }
    const offset = p.offsetGetrennt ? (p.offsetElemente[k] ?? p.offset) : p.offset;
    if (p.modus === "rotation") {
      // Turning endlessly only works via TiltRotate, tilt stays on offset (mirrored with counter-motion)
      return { tilt: selection(p, g).side * offset, upm: p.laeuft ? this.rpm[g]! : 0 };
    }
    // Counter-motion mirrors the left half completely, the offset too: 30° becomes −30° on the left,
    // otherwise the image would only be symmetric at offset 0. (The deflection has its side in pattern().)
    const side = p.modus === "ruhe" ? 1 : selection(p, g).side;
    return { tilt: side * offset + this.pattern(p, g), upm: 0 };
  }

  all(p: Parameter): Position[] {
    return Array.from({ length: MIRRORS_TOTAL }, (_, g) => this.mirror(p, g));
  }

  // Deflection of the pattern (degrees)
  private pattern(p: Parameter, g: number): number {
    const { slot, count, phaseOffset, place, side } = selection(p, g);
    const fan = p.faecher / 100;
    const A = p.amplitude * (1 - fan + fan * place);
    const u = this.cycles[g]!;
    switch (p.modus) {
      // Pendulum wave: every mirror swings at its own frequency (see advance)
      case "pendelwelle": return side * A * Math.sin(2 * Math.PI * u);
      // Wind: smooth noise across the mirrors and over time, never repeats
      case "wind": return side * A * wind(slot / p.wellenlaenge, this.referenceCycles);
      // Swarm: sine, but every mirror with its coupled cycles (see couple)
      case "schwarm": return side * A * Math.sin(2 * Math.PI * narrow(u - phaseOffset, p.breite / 100));
      // Flash: at the start of every cycle a deflection to the side and back (width, at most ½)
      case "gluehwuermchen": {
        // (1 − cos) already starts and ends smoothly, so without the smoothing of narrow()
        const b = flashWidth(p), x = u - phaseOffset - Math.floor(u - phaseOffset);
        return x < b ? side * A * 0.5 * (1 - Math.cos((2 * Math.PI * x) / b)) : 0;
      }
      case "rotation": return 0;   // runs via TiltRotate, see mirror()
      case "oeffnung": return 0;   // own computation, see mirror()
      case "ruhe": return 0;       // all on offset, only impulses move
    }
    // Sine. Ping-pong: the pattern runs there and back within one cycle, up to just before the last
    // mirror, so it does not skip to the first one at the turning point
    const run = p.pingpong ? (1 - Math.abs(2 * (((u % 1) + 1) % 1) - 1)) * (1 - 1 / count) : u;
    // cycles so far, shifted by the phase, squeezed into the width
    return side * A * Math.sin(2 * Math.PI * narrow(run - phaseOffset, p.breite / 100));
  }
}

// Width: the cycle t of a mirror is squeezed into the fraction b, then it stands until the next
// cycle (sine 0 = offset). So it does not jerk, the piece starts and ends smoothly; between 100 % and
// 90 % it cross-fades there, so adjusting does not jump.
export function narrow(t: number, b: number): number {
  if (b >= 1) return t;
  const x = t - Math.floor(t);
  if (x >= b) return 0;
  const y = x / b;
  return y + (smooth(y) - y) * Math.min(1, (1 - b) / 0.1);
}

// Cross-fade two sets of positions: fraction 0 = a, 1 = b
export function blend(a: readonly Position[], b: readonly Position[], fraction: number): Position[] {
  return b.map((s, g) => {
    const v = a[g] ?? s;
    return { tilt: v.tilt + (s.tilt - v.tilt) * fraction, upm: v.upm + (s.upm - v.upm) * fraction };
  });
}
