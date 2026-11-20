// Old German API of the preview, kept for the 40C3 talk (repo Parrafraktor-Vortrag), which imports
// this file directly from the source. New code uses preview.ts. Remove once the talk is updated.
import { PREVIEW_STYLE, Preview, setPreviewStyle, type FrontMode, type PreviewData, type PreviewStyle, type View } from "./preview.js";

/** @deprecated use View */
export type Ansicht = View;
/** @deprecated use FrontMode */
export type VorderModus = FrontMode;

/** @deprecated use PreviewData (same content, English field names) */
export interface VorschauDaten {
  parameter: PreviewData["parameter"];
  live: boolean;
  aufbau: PreviewData["layout"];
  rotateMaxUpm: number;
  modus: FrontMode;
  ansicht: View;
  phaserElemente: boolean;
  nebel: boolean;
  nebelSeite: PreviewData["hazeSide"];
  blende: PreviewData["fade"];
  blendeDauer: number;
  impuls: PreviewData["impulse"];
  impulse: PreviewData["impulses"];
  impulseSeitS: number;
  flash: PreviewData["flash"];
}

const toPreviewData = (d: VorschauDaten): PreviewData => ({
  parameter: d.parameter, live: d.live, layout: d.aufbau, rotateMaxRpm: d.rotateMaxUpm, mode: d.modus, view: d.ansicht,
  phaserElements: d.phaserElemente, haze: d.nebel, hazeSide: d.nebelSeite, fade: d.blende, fadeDuration: d.blendeDauer,
  impulse: d.impuls, impulses: d.impulse, impulsesSinceS: d.impulseSeitS, flash: d.flash,
});

/** @deprecated use Preview */
export class Vorschau extends Preview {
  constructor(canvas: HTMLCanvasElement, data: () => VorschauDaten | null) {
    super(canvas, () => { const d = data(); return d && toPreviewData(d); });
  }
  /** @deprecated use start() */
  starte(): void { this.start(); }
  /** @deprecated use stop() */
  stoppe(): void { this.stop(); }
  /** @deprecated use onFrame */
  get beiBild(): Preview["onFrame"] { return this.onFrame; }
  set beiBild(f: Preview["onFrame"]) { this.onFrame = f; }
}

// Old style keys → new ones
const STYLE_KEYS: Record<string, keyof PreviewStyle> = {
  grund: "background", rahmen: "frame", spiegel: "mirror", live: "live", licht: "light", lichtLive: "lightLive", rueckseite: "backSide",
  spiegelHell: "mirrorBright", spiegelMitte: "mirrorMid", spiegelKante: "mirrorEdge", linie: "line", scherenschnitt: "silhouette",
  nebelGrund: "hazeBackground", punkt: "point", punktLive: "pointLive", punktElemente: "pointElements", achse: "axis", text: "text",
  schrift: "font", schein: "glow", hinweise: "hints", messwerte: "stats", bahn: "path", bahnFarbe: "pathColor",
  phaserAchse: "phaserAxis", phaserAchseOffset: "phaserAxisOffset",
};

/** @deprecated use PreviewStyle */
export type VorschauStil = Record<string, unknown>;
/** @deprecated use PREVIEW_STYLE */
export const VORSCHAU_STIL = PREVIEW_STYLE;

/** @deprecated use setPreviewStyle (English keys) */
export function setzeVorschauStil(style: VorschauStil): void {
  setPreviewStyle(Object.fromEntries(Object.entries(style).map(([k, v]) => [STYLE_KEYS[k] ?? k, v])) as Partial<PreviewStyle>);
}
