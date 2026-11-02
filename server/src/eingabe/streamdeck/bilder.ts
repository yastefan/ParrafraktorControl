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
    ctx.fillStyle = FARBE.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const mitte = inhalt.unter ? hoehe * 0.42 : hoehe / 2;
    passendeSchrift(ctx, inhalt.titel, breite - 14, 26);
    ctx.fillText(inhalt.titel, breite / 2, mitte);
    if (inhalt.unter) {
      ctx.fillStyle = inhalt.grund ? FARBE.text : FARBE.leise;
      passendeSchrift(ctx, inhalt.unter, breite - 12, 17, 600);
      ctx.fillText(inhalt.unter, breite / 2, hoehe * 0.72);
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
