// Ranges of the pattern parameters. One source for all controls:
// faders in the client, encoders on the Stream Deck, later MIDI and OSC.
// Parameter field names ("speedVon", "breite", …) are saved data and protocol: they stay German.
import {
  HOLE_PATHS, HOLE_PATH_NAME, ELEMENTS, ELEMENT_ORDERS, ELEMENT_ORDER_NAME, ORDERINGS, ORDERING_NAME, PARAMETER_DEFAULTS,
  isHolePath, isElementOrder, isMode, isOrdering, type Mode, type Parameter,
} from "@parrafraktor/engine";

export type NumericParameter =
  | "offset" | "amplitude" | "speedVon" | "speedBis" | "phase" | "elementPhase" | "breite" | "group" | "faecher" | "schwuenge" | "wellenlaenge"
  | "kopplung" | "rauschen" | "reichweite"
  | "groesse" | "weite" | "kante" | "wabern" | "puls" | "nachlauf";

export interface Range {
  name: string;
  short: string;       // for narrow displays (Stream Deck strip)
  min: number;
  max: number;
  step: number;        // smallest step, also per detent on an encoder
  unit: string;
  zeroText?: string;   // shown for 0, e.g. "off"
}

export const RANGES: Record<NumericParameter, Range> = {
  offset: { name: "Offset", short: "Offset", min: -180, max: 180, step: 1, unit: "°" },
  amplitude: { name: "Amplitude", short: "Ampl.", min: 0, max: 180, step: 1, unit: "°" },
  speedVon: { name: "Speed from", short: "Speed from", min: 0, max: 10, step: 0.1, unit: " BPM", zeroText: "off" },
  speedBis: { name: "Speed to", short: "Speed to", min: 0, max: 10, step: 0.1, unit: " BPM", zeroText: "off" },
  phase: { name: "Phase", short: "Phase", min: 0, max: 720, step: 1, unit: "°" },
  elementPhase: { name: "Element phase", short: "El. phase", min: 0, max: 360, step: 1, unit: "°", zeroText: "off" },
  breite: { name: "Width", short: "Width", min: 5, max: 100, step: 1, unit: " %" },
  group: { name: "Group", short: "Group", min: 0, max: 18, step: 1, unit: "", zeroText: "off" },
  faecher: { name: "Fan", short: "Fan", min: 0, max: 100, step: 1, unit: " %", zeroText: "off" },
  schwuenge: { name: "Return", short: "Return", min: 4, max: 100, step: 1, unit: " sw." },
  wellenlaenge: { name: "Wavelength", short: "Wavel.", min: 1, max: 36, step: 1, unit: " mir." },
  groesse: { name: "Size", short: "Size", min: 5, max: 90, step: 1, unit: " cm" },
  weite: { name: "Travel", short: "Travel", min: 0, max: 90, step: 1, unit: " cm" },
  kante: { name: "Edge", short: "Edge", min: 0, max: 100, step: 1, unit: " %" },
  wabern: { name: "Wobble", short: "Wobble", min: 0, max: 100, step: 1, unit: " %", zeroText: "off" },
  puls: { name: "Pulse", short: "Pulse", min: 0, max: 100, step: 1, unit: " %", zeroText: "off" },
  nachlauf: { name: "Lag", short: "Lag", min: 0, max: 100, step: 1, unit: " %", zeroText: "off" },
  kopplung: { name: "Coupling", short: "Coupling", min: 0, max: 100, step: 1, unit: " %", zeroText: "off" },
  rauschen: { name: "Noise", short: "Noise", min: 0, max: 100, step: 1, unit: " %", zeroText: "off" },
  reichweite: { name: "Range", short: "Range", min: 0, max: 35, step: 1, unit: " mir.", zeroText: "all" },
};

// Controls with fixed steps (toggle in the client, step through on the Stream Deck)
export type SteppedParameter = "bahn" | "ordnung" | "elementFolge";

export const STEPPED = {
  bahn: { name: "Path", values: HOLE_PATHS, text: HOLE_PATH_NAME },
  ordnung: { name: "Order", values: ORDERINGS, text: ORDERING_NAME },
  elementFolge: { name: "Elements", values: ELEMENT_ORDERS, text: ELEMENT_ORDER_NAME },
} as const;

// Switches (on/off)
export type SwitchParameter = "gegenlauf" | "pingpong" | "speedJeElement";
export const SWITCHES: Record<SwitchParameter, string> = { gegenlauf: "Counter-motion", pingpong: "Ping-pong", speedJeElement: "Speed per element" };

// Which controls a base movement does not use: hidden in the client
type Control = NumericParameter | SteppedParameter | SwitchParameter;
const COUPLING: Control[] = ["kopplung", "rauschen", "reichweite"];
const UNUSED: Partial<Record<Mode, Control[]>> = {
  sinus: ["schwuenge", "wellenlaenge", ...COUPLING],
  pendelwelle: ["speedBis", "phase", "elementPhase", "breite", "wellenlaenge", "pingpong", "speedJeElement", ...COUPLING],
  wind: ["speedBis", "phase", "elementPhase", "breite", "schwuenge", "pingpong", "speedJeElement", ...COUPLING],
  schwarm: ["schwuenge", "wellenlaenge", "pingpong"],
  gluehwuermchen: ["schwuenge", "wellenlaenge", "pingpong"],
  rotation: ["amplitude", "schwuenge", "wellenlaenge", "pingpong", ...COUPLING],
  ruhe: ["ordnung", "elementFolge", "amplitude", "speedVon", "speedBis", "phase", "elementPhase", "breite", "group", "faecher", "schwuenge", "wellenlaenge", "gegenlauf", "pingpong", "speedJeElement", ...COUPLING],
};
// The aperture has its own controls, and of the others only speed
const APERTURE_ONLY: readonly Control[] = ["bahn", "groesse", "weite", "kante", "wabern", "puls", "nachlauf"];
export const isUsed = (mode: Mode, name: Control): boolean => {
  if (mode === "oeffnung") return APERTURE_ONLY.includes(name) || name === "speedVon";
  return !APERTURE_ONLY.includes(name) && !UNUSED[mode]?.includes(name);
};

export const NUMERIC_PARAMETERS = Object.keys(RANGES) as NumericParameter[];

export const isNumericParameter = (x: unknown): x is NumericParameter =>
  typeof x === "string" && x in RANGES;

// Bring a value into its range and round it to the step
export function clampParameter(name: NumericParameter, value: number): number {
  const r = RANGES[name];
  const rounded = Math.round(value / r.step) * r.step;
  return +Math.min(r.max, Math.max(r.min, rounded)).toFixed(3);
}

export function formatValue(name: NumericParameter, value: number): string {
  const r = RANGES[name];
  if (value === 0 && r.zeroText) return r.zeroText;
  const text = r.step < 1 ? value.toFixed(1) : String(Math.round(value));
  return text + r.unit;
}

// Turn unknown input (e.g. from a message) into a checked part of the parameters
export function checkParameter(raw: unknown): Partial<Parameter> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const part: Partial<Parameter> = {};
  if (isMode(r.modus)) part.modus = r.modus;
  for (const name of NUMERIC_PARAMETERS) {
    const w = r[name];
    if (typeof w === "number" && Number.isFinite(w)) part[name] = clampParameter(name, w);
  }
  if (isHolePath(r.bahn)) part.bahn = r.bahn;
  if (isOrdering(r.ordnung)) part.ordnung = r.ordnung;
  if (isElementOrder(r.elementFolge)) part.elementFolge = r.elementFolge;
  for (const name of ["gegenlauf", "pingpong", "speedJeElement", "offsetGetrennt", "laeuft"] as const) {
    if (typeof r[name] === "boolean") part[name] = r[name];
  }
  if (Array.isArray(r.offsetElemente) && r.offsetElemente.length === ELEMENTS
    && r.offsetElemente.every((w) => typeof w === "number" && Number.isFinite(w))) {
    part.offsetElemente = (r.offsetElemente as number[]).map((w) => clampParameter("offset", w));
  }
  return part;
}

export const defaultValue = (name: NumericParameter): number => PARAMETER_DEFAULTS[name];

// ---------- Offset per element ----------
// If every element has its own offset (offsetGetrennt), the common offset shifts all elements by the
// same amount: the distances stay (like a group fader). At the edge of the range it stops instead of
// squeezing the distances. The same for client, Stream Deck and server.
export function shiftOffset(p: Parameter, value: number): Partial<Parameter> {
  const target = clampParameter("offset", value);
  if (!p.offsetGetrennt) return { offset: target };
  const r = RANGES.offset;
  const d = Math.min(r.max - Math.max(...p.offsetElemente), Math.max(r.min - Math.min(...p.offsetElemente), target - p.offset));
  return { offset: clampParameter("offset", p.offset + d), offsetElemente: p.offsetElemente.map((w) => clampParameter("offset", w + d)) };
}

// Do the elements currently differ in offset (otherwise "per element" has no effect)?
export const offsetsDiffer = (p: Parameter): boolean =>
  p.offsetGetrennt && p.offsetElemente.some((w) => w !== p.offsetElemente[0]);

// ---------- Old files ----------
// Bring saved parameters and presets into today's form. Only for files, not for messages.
//  1. patterns from before symmetry/direction/fan (back then patterns of their own)
//  2. triangle and square no longer exist (too hard movements): become sine
//  3. symmetry, direction and sequence went into ordering, element order, counter-motion and ping-pong
//  4. sawtooth, pulse, flyout, blinder and sparkle are no longer base movements: become sine
// The old values below are saved data and stay as they were.
const OLD_PATTERNS: Record<string, Record<string, unknown>> = {
  "sinus-innen": { modus: "sinus", symmetrie: "innen" },
  "sinus-aussen": { modus: "sinus", symmetrie: "aussen" },
  faecher: { modus: "sinus", symmetrie: "innen", faecher: 100 },
  chase: { modus: "puls" },
  pingpong: { modus: "puls", richtung: "pingpong" },
  flyout: { modus: "flyout", symmetrie: "innen" },
  blinder: { modus: "blinder", symmetrie: "innen" },
  dreieck: { modus: "sinus" },
  rechteck: { modus: "sinus" },
};

const DROPPED: Record<string, Record<string, unknown>> = { dreieck: { modus: "sinus" }, rechteck: { modus: "sinus" } };

const NOW_IMPULSES = ["saegezahn", "puls", "flyout", "blinder", "funkeln"];

export function migrateParameter(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const r = migrateDistribution(raw as Record<string, unknown>);
  return NOW_IMPULSES.includes(r.modus as string) ? { ...r, modus: "sinus" } : r;
}

function migrateDistribution(r: Record<string, unknown>): Record<string, unknown> {
  if ("ordnung" in r) return r;
  if (typeof r.modus === "string") {
    const replacement = ("symmetrie" in r ? DROPPED : OLD_PATTERNS)[r.modus];
    if (replacement) r = { ...r, ...replacement };
  }
  const { symmetrie, richtung, jeElement, ...rest } = r;
  const centered = symmetrie === "innen" ? "mitteAussen" : symmetrie === "aussen" ? "aussenMitte" : null;
  return {
    ...rest,
    ordnung: centered ?? (richtung === "zurueck" ? "rechts" : "links"),
    gegenlauf: centered !== null,
    pingpong: richtung === "pingpong",
    elementFolge: jeElement === true ? "zusammen" : "vorneHinten",
  };
}
