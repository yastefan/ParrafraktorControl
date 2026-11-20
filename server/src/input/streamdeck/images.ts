// Images for the LCD keys and the touch strip, drawn with @napi-rs/canvas (RGBA).
import { existsSync } from "node:fs";
import type { SKRSContext2D } from "@napi-rs/canvas";
import { log } from "../../log.js";

type Canvas = typeof import("@napi-rs/canvas");

export const COLOR = {
  background: "#07060c",
  field: "#15131f",
  track: "#2a2540",     // empty value bar
  text: "#f2f2ff",
  muted: "#8c88a8",
  accent: "#ffe14d",   // pause, stored
  live: "#ff1f4f",     // app drives
  liveDark: "#4a0716",
  ma: "#1f7a3a",       // MA drives
  fading: "#ff8a1f",
} as const;

// Every menu and every encoder group has a neon colour ("bright") for the selected entry (text on
// it in "on"), border, strip and value bars; "dark" is the background of the other keys.
// The hues are far apart, so the menus can be told apart at a glance.
export interface Hue {
  dark: string;
  bright: string;
  on: string;
}

export const TONE = {
  pattern: { dark: "#003540", bright: "#00e5ff", on: "#001a20" },      // Cyan
  presets: { dark: "#0a3d24", bright: "#39ff88", on: "#021a0e" },      // green
  impulse: { dark: "#4a0a40", bright: "#ff2bd6", on: "#22041e" },      // magenta
  motion: { dark: "#3d3404", bright: "#ffe14d", on: "#1f1a00" },     // yellow
  distribution: { dark: "#2c1856", bright: "#a46bff", on: "#140a2b" },   // violet
  fine: { dark: "#262a3a", bright: "#9aa4c7", on: "#12141c" },         // steel
  network: { dark: "#3d2408", bright: "#ff9a3c", on: "#1f1003" },         // orange (Pi only)
} as const satisfies Record<string, Hue>;

export type Tone = keyof typeof TONE;

export interface KeyContent {
  title: string;
  below?: string;
  background?: string;
  border?: string;
  borderWidth?: number;   // default 8
  text?: string;     // text colour, e.g. dark on a bright background
  muted?: boolean;   // dimmed, e.g. empty preset slot
}

export interface Field {
  title: string;
  value: string;
  fraction: number | null;   // fill of the bar 0 … 1, null = no bar
}

// Fonts registered if present. Raspberry Pi OS Lite has no font at all without fonts-dejavu-core –
// Skia then draws colours and bars, but no text.
const FONT_FILES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];
const FONT_NAME = "PultSans";
let font = "sans-serif";

export class Painter {
  constructor(private readonly c: Canvas) {
    for (const file of FONT_FILES) {
      if (existsSync(file)) c.GlobalFonts.registerFromPath(file, FONT_NAME);
    }
    if (c.GlobalFonts.has(FONT_NAME)) font = `${FONT_NAME}, sans-serif`;
    else if (!c.GlobalFonts.families.length) log("streamdeck", "no font found – keys without text (Linux: install fonts-dejavu-core)");
  }

  key(width: number, height: number, content: KeyContent): Uint8Array {
    const canvas = this.c.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = content.background ?? COLOR.background;
    ctx.fillRect(0, 0, width, height);
    if (content.border) {
      ctx.strokeStyle = content.border;
      const b = content.borderWidth ?? 8;
      ctx.lineWidth = b;
      ctx.strokeRect(b / 2, b / 2, width - b, height - b);
    }
    ctx.fillStyle = content.muted ? COLOR.muted : content.text ?? COLOR.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Long titles (e.g. preset names) on two lines instead of tiny
    const lines = wrap(ctx, content.title, width - 14, 26, 18);
    const center = content.below ? height * (lines.length > 1 ? 0.36 : 0.42) : height / 2;
    const gap = lines.length > 1 ? parseInt(ctx.font.split(" ")[1]!, 10) * 1.1 : 0;
    lines.forEach((line, n) => ctx.fillText(line, width / 2, center + (n - (lines.length - 1) / 2) * gap));
    if (content.below) {
      ctx.fillStyle = content.muted ? COLOR.muted : content.text ?? (content.background ? COLOR.text : COLOR.muted);
      fittingFont(ctx, content.below, width - 12, 17, 600);
      ctx.fillText(content.below, width / 2, height * 0.74);
    }
    return rgba(ctx, width, height);
  }

  // A band in the colour of the encoder group with its name at the top, the four fields below
  strip(width: number, height: number, fields: Field[], page: string, tone: Hue): Uint8Array {
    const canvas = this.c.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const BAND = 20;
    ctx.fillStyle = COLOR.background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = tone.bright;
    ctx.fillRect(0, 0, width, BAND);
    ctx.fillStyle = tone.on;
    ctx.font = `700 14px ${font}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(page, 12, BAND / 2 + 1);
    const b = width / fields.length;
    fields.forEach((f, i) => {
      const x = i * b;
      ctx.fillStyle = COLOR.field;
      ctx.fillRect(x + 4, BAND + 4, b - 8, height - BAND - 8);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = COLOR.muted;
      ctx.font = `600 15px ${font}`;
      ctx.fillText(f.title, x + 14, BAND + 9);
      ctx.fillStyle = COLOR.text;
      fittingFont(ctx, f.value, b - 28, 28);
      ctx.fillText(f.value, x + 14, BAND + 28);
      if (f.fraction !== null) {
        ctx.fillStyle = COLOR.track;
        ctx.fillRect(x + 14, height - 15, b - 28, 5);
        ctx.fillStyle = tone.bright;
        ctx.fillRect(x + 14, height - 15, (b - 28) * Math.min(1, Math.max(0, f.fraction)), 5);
      }
    });
    return rgba(ctx, width, height);
  }
}

// If the text fits on one line at font size "min" or larger, it stays on one line.
// Otherwise it is split into two lines at the best space.
function wrap(ctx: SKRSContext2D, text: string, width: number, size: number, min: number): string[] {
  fittingFont(ctx, text, width, size);
  const empty = [...text.matchAll(/ /g)].map((m) => m.index!);
  if (parseInt(ctx.font.split(" ")[1]!, 10) >= min || !empty.length) return [text];
  // the split where the longer line is shortest
  const parts = empty
    .map((i) => [text.slice(0, i), text.slice(i + 1)] as const)
    .sort((a, b) => Math.max(...a.map((z) => z.length)) - Math.max(...b.map((z) => z.length)))[0]!;
  const longest = parts[0].length >= parts[1].length ? parts[0] : parts[1];
  fittingFont(ctx, longest, width, Math.round(size * 0.85));
  return [...parts];
}

// Shrink the font until the text fits the width
function fittingFont(ctx: SKRSContext2D, text: string, width: number, size: number, weight = 700): void {
  let g = size;
  do {
    ctx.font = `${weight} ${g}px ${font}`;
    g -= 1;
  } while (g > 10 && ctx.measureText(text).width > width);
}

const rgba = (ctx: SKRSContext2D, width: number, height: number): Uint8Array =>
  new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
