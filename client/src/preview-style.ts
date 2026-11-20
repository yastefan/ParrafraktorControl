// Look of the preview. Changeable from outside (e.g. for a talk) with setPreviewStyle;
// values without # are RGB triples drawn with their own transparency.
export const PREVIEW_STYLE = {
  background: "#0b0a0f",
  frame: "#2a2d33",
  mirror: "#c9ccd1",
  live: "#ff1f4f",
  light: "255,214,160",        // warm backlight as in the simulation
  lightLive: "240,160,48",
  backSide: "#2a2630",
  mirrorBright: "235,235,247",  // front side seen from the front: edge and middle of the gradient at full gloss
  mirrorMid: "170,170,190",
  mirrorEdge: "232,236,244", // reflection: front side; haze: edge of the mirrors
  line: "255,255,255",        // grid, walls, floor, frame of the elements from the front
  silhouette: "6,5,10",    // haze: mirrors in front of the light
  hazeBackground: "4,3,8",         // haze: room without light
  point: "0,229,255",          // phaser: neon colours as in the UI
  pointLive: "255,31,79",
  pointElements: [] as string[], // phaser: one colour per element (RGB triples), empty = "point" everywhere
  axis: "140,136,168",        // Phaser: Raster, Nulllinie, Rahmen, Beschriftung
  text: "255,255,255",
  font: "600 10px -apple-system, sans-serif",   // size is replaced per place
  glow: true,                // glow around points and the spotlight
  hints: true,              // „Scheinwerfer ziehen“
  stats: true,             // haze: rays, compute time, frames/s
  path: false,                 // from the front, with aperture: fixed path, trace of the last seconds and the hole as a line
  pathColor: "255,255,255",
  phaserAxis: 0,              // phaser: fixed height of the axis in degrees (±), 0 = as high as needed
  phaserAxisOffset: false,    // phaser: center of the axis follows the offset (range stays ± axis)
};
export type PreviewStyle = typeof PREVIEW_STYLE;
export function setPreviewStyle(style: Partial<PreviewStyle>): void {
  Object.assign(PREVIEW_STYLE, style);
}
// Font of the preview at a given size
export const font = (px: number): string => PREVIEW_STYLE.font.replace(/\d+(\.\d+)?px/, `${px}px`);
