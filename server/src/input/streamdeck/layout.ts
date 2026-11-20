// Layout of the Stream Deck+: menus on the keys, encoders and touch strip.
// Every menu has a colour (images.ts, TONE): Pattern cyan, Presets green, Impulses magenta;
// the encoder groups Motion yellow, Distribution violet, Fine steel.
//
// Main menu:
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │Pattern › │Presets › │Impulse › │   Auto   │   Auto: tap starts and stops (selection in the client)
//   ├──────────┼──────────┼──────────┼──────────┤
//   │  Order   │ Elements │  Pause   │  Output  │   Order/Elements: step on
//   └──────────┴──────────┴──────────┴──────────┘   Output: press and hold (guard against accidents)
// Submenu (Pattern, Presets): six slots, bottom left Back, bottom right next page.
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │  slot    │  slot    │  slot    │  slot    │
//   ├──────────┼──────────┼──────────┼──────────┤
//   │‹ Back    │  slot    │  slot    │ Page ›   │
//   └──────────┴──────────┴──────────┴──────────┘
// Presets: tap recalls, hold stores the current look.
//
// Impulses (live page):
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │  Open    │  Close   │  Hole    │  Iris    │   top row: choose the kind (triggers nothing)
//   ├──────────┼──────────┼──────────┼──────────┤
//   │‹ Back    │ Elements │ Encoders │Symmetric │   Encoders: page Envelope (attack/sustain/release/strength)
//   └──────────┴──────────┴──────────┴──────────┘             or Travel (spread/width/delay)
// Touch strip in the impulse menu: tap = the chosen kind from there, swipe = it runs through in the
// direction of the swipe. How fast is set by the spread.
//
// Network menu (only on the Pi, when pi/setup.sh turns it on with --net-code):
// In the main menu press and hold Output, within 0.6 s add Order, hold both 2 s – Output does not
// switch and Order does not step meanwhile. Then four keys as the code (top left 1 … bottom right 8).
//   ┌──────────┬──────────┬──────────┬──────────┐
//   │  WLAN    │  LAN     │  Mask    │  Apply   │   Wi-Fi on/off, LAN DHCP (fallback fixed IP)/fixed
//   ├──────────┼──────────┼──────────┼──────────┤
//   │‹ Back    │  Reset   │ LAN now  │ WLAN now │   Reset: drop the draft
//   └──────────┴──────────┴──────────┴──────────┘
// Encoders: one each for the four numbers of the fixed IP. Only "Apply" applies.
//
// Offset per element: a long press (0.6 s) on the offset encoder puts Off. 1, 2, 3 and the common
// offset (shifts all, distances stay) on the four encoders; a long press on one of them or a swipe
// goes back. Short press: element to the common offset, common encoder: reset for all.
//
// Encoders: the pages follow the base movement – only encoders it uses, empty pages are dropped
// (with Rest only Offset stays). Switches: turning switches. Pressing sets the default value.
// Swiping on the touch strip changes the encoder page (except in the impulse menu).
import type { ImpulseKind, Mode } from "@parrafraktor/engine";
import { isUsed, type ImpulseControl, type SwitchParameter, type SteppedParameter, type NumericParameter } from "@parrafraktor/protocol";
import type { Tone } from "./images.js";

export type Menu = "main" | "pattern" | "presets" | "impulse" | "code" | "network";

export type Encoder =
  | { kind: "numeric"; name: NumericParameter }
  | { kind: "stepped"; name: SteppedParameter }
  | { kind: "switch"; name: SwitchParameter };

export interface EncoderPage {
  name: string;
  tone: Tone;
  encoders: Encoder[];
}

const numeric = (name: NumericParameter): Encoder => ({ kind: "numeric", name });
const stepped = (name: SteppedParameter): Encoder => ({ kind: "stepped", name });
const toggle = (name: SwitchParameter): Encoder => ({ kind: "switch", name });

// All encoders by group; per base movement the used ones remain. In Motion the fourth is what
// belongs to the shape (sine: phase, pendulum wave: return, wind: wavelength, swarm and flash: coupling).
const GROUPS: EncoderPage[] = [
  { name: "Motion", tone: "motion", encoders: [stepped("bahn"), numeric("groesse"), numeric("weite"), numeric("offset"), numeric("amplitude"), numeric("speedVon"), numeric("kopplung"), numeric("rauschen"), numeric("phase"), numeric("breite"), numeric("speedBis"), numeric("schwuenge"), numeric("wellenlaenge"), numeric("reichweite"), numeric("kante"), numeric("wabern"), numeric("puls"), numeric("nachlauf")] },
  { name: "Distribution", tone: "distribution", encoders: [stepped("ordnung"), stepped("elementFolge"), numeric("faecher"), toggle("gegenlauf"), numeric("elementPhase")] },
  { name: "Fine", tone: "fine", encoders: [numeric("group"), toggle("pingpong"), toggle("speedJeElement")] },
];

// Encoder pages for a base movement: at most four encoders per page, empty ones are dropped
export function encoderPages(mode: Mode): EncoderPage[] {
  const pages: EncoderPage[] = [];
  for (const g of GROUPS) {
    const encoders = g.encoders.filter((r) => isUsed(mode, r.name));
    for (let n = 0; n < encoders.length; n += 4) {
      pages.push({ ...g, name: n ? `${g.name} 2` : g.name, encoders: encoders.slice(n, n + 4) });
    }
  }
  return pages;
}

// Main menu
export const MAIN = {
  pattern: 0,
  presets: 1,
  impulse: 2,
  auto: 3,
  ordering: 4,
  elements: 5,
  pause: 6,
  output: 7,
} as const;

// Impulses
export const IMPULSE_KIND_KEYS: Partial<Record<number, ImpulseKind>> = { 0: "auf", 1: "zu", 2: "loch", 3: "iris" };
export const KEY_ELEMENT_ORDER = 5;
export const KEY_IMPULSE_ENCODERS = 6;
export const KEY_SYMMETRIC = 7;
export const IMPULSE_ENCODER_PAGES: { name: string; encoders: ImpulseControl[] }[] = [
  { name: "Envelope", encoders: ["attackS", "sustainS", "releaseS", "staerke"] },
  { name: "Travel", encoders: ["ausbreitungS", "breite", "elementVersatzS"] },
];

// Submenus
export const KEY_BACK = 4;
export const KEY_PAGE = 7;
export const SLOTS = [0, 1, 2, 3, 5, 6] as const;

export const HOLD_MS = { output: 600, presetStore: 800, network: 2000, encoderLong: 600 } as const;

// Network menu
export const CODE_WAIT_MS = 10_000;   // without input back to the main menu
export const NETWORK_KEYS = {
  wifi: 0,
  lan: 1,
  prefix: 2,
  apply: 3,
  back: 4,
  reset: 5,
  lanState: 6,
  wifiState: 7,
} as const;

// Slot (0 … 5) of a key in a submenu, otherwise undefined
export const slotOf = (key: number): number | undefined => {
  const i = (SLOTS as readonly number[]).indexOf(key);
  return i < 0 ? undefined : i;
};

export const pageCount = (entries: number): number => Math.ceil(entries / SLOTS.length);

// Index of the entry on a key, if there is one
export const entryAt = (page: number, key: number, entries: number): number | undefined => {
  const slot = slotOf(key);
  if (slot === undefined) return undefined;
  const i = page * SLOTS.length + slot;
  return i < entries ? i : undefined;
};
