// Bilder für die LCD-Tasten und den Touchstreifen, gezeichnet mit @napi-rs/canvas (RGBA).
import type { SKRSContext2D } from "@napi-rs/canvas";

type Canvas = typeof import("@napi-rs/canvas");

export const FARBE = {
  grund: "#07060c",
  feld: "#15131f",
  spur: "#2a2540",     // leerer Wertebalken
  text: "#f2f2ff",
  leise: "#8c88a8",
  akzent: "#ffe14d",   // Pause, gespeichert
  live: "#ff1f4f",     // App fährt
  liveDunkel: "#4a0716",
  ma: "#1f7a3a",       // MA fährt
  blenden: "#ff8a1f",
} as const;

// Jedes Menü und jede Reglergruppe hat eine Neonfarbe ("hell") für den gewählten Eintrag (Text
// darauf in "auf"), Rahmen, Streifen und Wertebalken; "dunkel" ist der Grund der übrigen Tasten.
// Die Farbtöne liegen weit auseinander, damit man die Menüs auf einen Blick unterscheidet.
export interface Farbton {
  dunkel: string;
  hell: string;
  auf: string;
}

export const TON = {
  pattern: { dunkel: "#003540", hell: "#00e5ff", auf: "#001a20" },      // Cyan
  presets: { dunkel: "#0a3d24", hell: "#39ff88", auf: "#021a0e" },      // Grün
  impulse: { dunkel: "#4a0a40", hell: "#ff2bd6", auf: "#22041e" },      // Magenta
  bewegung: { dunkel: "#3d3404", hell: "#ffe14d", auf: "#1f1a00" },     // Gelb
  verteilung: { dunkel: "#2c1856", hell: "#a46bff", auf: "#140a2b" },   // Violett
  fein: { dunkel: "#262a3a", hell: "#9aa4c7", auf: "#12141c" },         // Stahl
} as const satisfies Record<string, Farbton>;

export type Ton = keyof typeof TON;

export interface TastenInhalt {
  titel: string;
  unter?: string;
  grund?: string;
  rahmen?: string;
  rahmenBreite?: number;   // Vorgabe 8
  text?: string;     // Schriftfarbe, z. B. dunkel auf hellem Grund
  leise?: boolean;   // gedämpft, z. B. leerer Preset-Platz
}

export interface Feld {
  titel: string;
  wert: string;
  anteil: number | null;   // Füllung des Balkens 0 … 1, null = kein Balken
}

export class Maler {
  constructor(private readonly c: Canvas) {}

  taste(breite: number, hoehe: number, inhalt: TastenInhalt): Uint8Array {
    const canvas = this.c.createCanvas(breite, hoehe);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = inhalt.grund ?? FARBE.grund;
    ctx.fillRect(0, 0, breite, hoehe);
    if (inhalt.rahmen) {
      ctx.strokeStyle = inhalt.rahmen;
      const b = inhalt.rahmenBreite ?? 8;
      ctx.lineWidth = b;
      ctx.strokeRect(b / 2, b / 2, breite - b, hoehe - b);
    }
    ctx.fillStyle = inhalt.leise ? FARBE.leise : inhalt.text ?? FARBE.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Lange Titel (z. B. Preset-Namen) auf zwei Zeilen statt winzig
    const zeilen = umbrechen(ctx, inhalt.titel, breite - 14, 26, 18);
    const mitte = inhalt.unter ? hoehe * (zeilen.length > 1 ? 0.36 : 0.42) : hoehe / 2;
    const abstand = zeilen.length > 1 ? parseInt(ctx.font.split(" ")[1]!, 10) * 1.1 : 0;
    zeilen.forEach((z, n) => ctx.fillText(z, breite / 2, mitte + (n - (zeilen.length - 1) / 2) * abstand));
    if (inhalt.unter) {
      ctx.fillStyle = inhalt.leise ? FARBE.leise : inhalt.text ?? (inhalt.grund ? FARBE.text : FARBE.leise);
      passendeSchrift(ctx, inhalt.unter, breite - 12, 17, 600);
      ctx.fillText(inhalt.unter, breite / 2, hoehe * 0.74);
    }
    return rgba(ctx, breite, hoehe);
  }

  // Oben ein Band in der Farbe der Reglergruppe mit ihrem Namen, darunter die vier Felder
  streifen(breite: number, hoehe: number, felder: Feld[], seite: string, ton: Farbton): Uint8Array {
    const canvas = this.c.createCanvas(breite, hoehe);
    const ctx = canvas.getContext("2d");
    const BAND = 20;
    ctx.fillStyle = FARBE.grund;
    ctx.fillRect(0, 0, breite, hoehe);
    ctx.fillStyle = ton.hell;
    ctx.fillRect(0, 0, breite, BAND);
    ctx.fillStyle = ton.auf;
    ctx.font = "700 14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(seite, 12, BAND / 2 + 1);
    const b = breite / felder.length;
    felder.forEach((f, i) => {
      const x = i * b;
      ctx.fillStyle = FARBE.feld;
      ctx.fillRect(x + 4, BAND + 4, b - 8, hoehe - BAND - 8);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = FARBE.leise;
      ctx.font = "600 15px sans-serif";
      ctx.fillText(f.titel, x + 14, BAND + 9);
      ctx.fillStyle = FARBE.text;
      passendeSchrift(ctx, f.wert, b - 28, 28);
      ctx.fillText(f.wert, x + 14, BAND + 28);
      if (f.anteil !== null) {
        ctx.fillStyle = FARBE.spur;
        ctx.fillRect(x + 14, hoehe - 15, b - 28, 5);
        ctx.fillStyle = ton.hell;
        ctx.fillRect(x + 14, hoehe - 15, (b - 28) * Math.min(1, Math.max(0, f.anteil)), 5);
      }
    });
    return rgba(ctx, breite, hoehe);
  }
}

// Passt der Text in einer Zeile mindestens in Schriftgröße "min", bleibt er einzeilig.
// Sonst wird er an der besten Leerstelle in zwei Zeilen geteilt.
function umbrechen(ctx: SKRSContext2D, text: string, breite: number, groesse: number, min: number): string[] {
  passendeSchrift(ctx, text, breite, groesse);
  const leer = [...text.matchAll(/ /g)].map((m) => m.index!);
  if (parseInt(ctx.font.split(" ")[1]!, 10) >= min || !leer.length) return [text];
  // Teilung, bei der die längere Zeile am kürzesten ist
  const teile = leer
    .map((i) => [text.slice(0, i), text.slice(i + 1)] as const)
    .sort((a, b) => Math.max(...a.map((z) => z.length)) - Math.max(...b.map((z) => z.length)))[0]!;
  const laengste = teile[0].length >= teile[1].length ? teile[0] : teile[1];
  passendeSchrift(ctx, laengste, breite, Math.round(groesse * 0.85));
  return [...teile];
}

// Schrift so weit verkleinern, bis der Text in die Breite passt
function passendeSchrift(ctx: SKRSContext2D, text: string, breite: number, groesse: number, gewicht = 700): void {
  let g = groesse;
  do {
    ctx.font = `${gewicht} ${g}px sans-serif`;
    g -= 1;
  } while (g > 10 && ctx.measureText(text).width > breite);
}

const rgba = (ctx: SKRSContext2D, breite: number, hoehe: number): Uint8Array =>
  new Uint8Array(ctx.getImageData(0, 0, breite, hoehe).data.buffer);
