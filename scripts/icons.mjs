// Erzeugt die App-Icons des Clients (client/public) mit @napi-rs/canvas.
// Aufruf: npm run icons
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";

const ziel = new URL("../client/public/", import.meta.url);

// Drei Elemente mit schräg gestellten Spiegeln, wie in der Vorschau
function icon(groesse, rand) {
  const c = createCanvas(groesse, groesse);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0e0f11";
  ctx.fillRect(0, 0, groesse, groesse);
  const innen = groesse * (1 - 2 * rand);
  const x0 = groesse * rand;
  const element = innen / 3.3;
  ctx.strokeStyle = "#f0a030";
  ctx.lineCap = "round";
  ctx.lineWidth = groesse * 0.035;
  for (let k = 0; k < 3; k++) {
    const ex = x0 + k * element * 1.15;
    for (let i = 0; i < 4; i++) {
      const winkel = ((k - 1) * 25 + (i - 1.5) * 12 + 50) * (Math.PI / 180);
      const px = ex + (i + 0.5) * (element / 4);
      const l = element * 0.42;
      ctx.beginPath();
      ctx.moveTo(px - (Math.cos(winkel) * l) / 2, groesse / 2 - (Math.sin(winkel) * l) / 2);
      ctx.lineTo(px + (Math.cos(winkel) * l) / 2, groesse / 2 + (Math.sin(winkel) * l) / 2);
      ctx.stroke();
    }
  }
  return c.toBuffer("image/png");
}

const dateien = {
  "apple-touch-icon.png": icon(180, 0.12),
  "icon-192.png": icon(192, 0.12),
  "icon-512.png": icon(512, 0.12),
  // maskable: Inhalt in der sicheren Zone (innere 80 %)
  "icon-maskable-512.png": icon(512, 0.2),
};
for (const [name, png] of Object.entries(dateien)) writeFileSync(new URL(name, ziel), png);
console.log(`${Object.keys(dateien).length} Icons nach client/public geschrieben`);
