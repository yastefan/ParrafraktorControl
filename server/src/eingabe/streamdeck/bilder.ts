// Bilder für die LCD-Tasten und den Touchstreifen, gezeichnet mit @napi-rs/canvas (RGBA).
import type { SKRSContext2D } from "@napi-rs/canvas";

type Canvas = typeof import("@napi-rs/canvas");

export const FARBE = {
  grund: "#111214",
  feld: "#1d1f23",
  text: "#f2f2f2",
  leise: "#8a8f98",
  akzent: "#f0a030",   // aktives Pattern, Wertebalken
  live: "#d3262b",     // App fährt
  ma: "#1f7a3a",       // MA fährt
  blenden: "#d9771e",
} as const;

export interface TastenInhalt {
  titel: string;
  unter?: string;
  grund?: string;
  rahmen?: string;
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
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, breite - 8, hoehe - 8);
    }
    ctx.fillStyle = inhalt.leise ? FARBE.leise : FARBE.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Lange Titel (z. B. Preset-Namen) auf zwei Zeilen statt winzig
    const zeilen = umbrechen(ctx, inhalt.titel, breite - 14, 26, 18);
    const mitte = inhalt.unter ? hoehe * (zeilen.length > 1 ? 0.36 : 0.42) : hoehe / 2;
    const abstand = zeilen.length > 1 ? parseInt(ctx.font.split(" ")[1]!, 10) * 1.1 : 0;
    zeilen.forEach((z, n) => ctx.fillText(z, breite / 2, mitte + (n - (zeilen.length - 1) / 2) * abstand));
    if (inhalt.unter) {
      ctx.fillStyle = inhalt.grund ? FARBE.text : FARBE.leise;
      passendeSchrift(ctx, inhalt.unter, breite - 12, 17, 600);
      ctx.fillText(inhalt.unter, breite / 2, hoehe * 0.74);
    }
    return rgba(ctx, breite, hoehe);
  }

  streifen(breite: number, hoehe: number, felder: Feld[], seite: string): Uint8Array {
    const canvas = this.c.createCanvas(breite, hoehe);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = FARBE.grund;
    ctx.fillRect(0, 0, breite, hoehe);
    const b = breite / felder.length;
    felder.forEach((f, i) => {
      const x = i * b;
      ctx.fillStyle = FARBE.feld;
      ctx.fillRect(x + 4, 4, b - 8, hoehe - 8);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = FARBE.leise;
      ctx.font = "600 18px sans-serif";
      ctx.fillText(f.titel, x + 14, 12);
      ctx.fillStyle = FARBE.text;
      passendeSchrift(ctx, f.wert, b - 28, 32);
      ctx.fillText(f.wert, x + 14, 38);
      if (f.anteil !== null) {
        ctx.fillStyle = "#33363c";
        ctx.fillRect(x + 14, hoehe - 18, b - 28, 6);
        ctx.fillStyle = FARBE.akzent;
        ctx.fillRect(x + 14, hoehe - 18, (b - 28) * Math.min(1, Math.max(0, f.anteil)), 6);
      }
    });
    ctx.fillStyle = FARBE.leise;
    ctx.font = "600 14px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(seite, breite - 12, 10);
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
