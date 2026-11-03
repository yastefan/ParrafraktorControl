// Erzeugt test/referenz.json aus der Website-Simulation (parrafraktor.js), damit der Test
// prüfen kann, ob die Engine genau dieselben Winkel rechnet.
// Aufruf: node packages/engine/scripts/referenz-erzeugen.mjs <pfad/zu/parrafraktor.js>
import { readFileSync, writeFileSync } from "node:fs";

const pfad = process.argv[2];
if (!pfad) {
  console.error("Aufruf: node referenz-erzeugen.mjs <pfad/zu/parrafraktor.js>");
  process.exit(1);
}
const quelle = readFileSync(pfad, "utf8");

// Von "const weich" bis vor "function spiegel()" stehen alle Funktionen der Pattern-Engine
const anfang = quelle.indexOf("const weich");
const ende = quelle.indexOf("function spiegel()");
if (anfang < 0 || ende < 0) throw new Error("Pattern-Engine in parrafraktor.js nicht gefunden");
const SPIEGEL_N = 12;
const erzeuge = new Function("zustand", "SPIEGEL_N", `${quelle.slice(anfang, ende)}\nreturn { pattern };`);

const modi = ["sinus", "pendelwelle", "wind", "saegezahn", "puls", "flyout", "blinder", "funkeln"];
const varianten = [
  { group: 0, ordnung: "links", elementFolge: "vorneHinten", gegenlauf: false, pingpong: false, faecher: 0, phase: 360 },
  { group: 5, ordnung: "mitteAussen", elementFolge: "vorneHinten", gegenlauf: true, pingpong: false, faecher: 60, phase: 180 },
  { group: 0, ordnung: "aussenMitte", elementFolge: "zusammen", gegenlauf: true, pingpong: false, faecher: 0, phase: 360 },
  { group: 4, ordnung: "rechts", elementFolge: "zusammen", gegenlauf: false, pingpong: true, faecher: 100, phase: 120 },
  { group: 0, ordnung: "verschachtelt", elementFolge: "hintenVorne", gegenlauf: false, pingpong: true, faecher: 0, phase: 720 },
  { group: 3, ordnung: "zufall", elementFolge: "vorneHinten", gegenlauf: true, pingpong: false, faecher: 30, phase: 0 },
];

const faelle = [];
for (const modus of modi) {
  for (const v of varianten) {
    const parameter = {
      modus, offset: 12, offsetGetrennt: false, offsetElemente: [0, 0, 0], amplitude: 55, speedVon: 3, speedBis: 0,
      zyklusS: 45, wellenlaenge: 6, laeuft: true, ...v,
    };
    for (let schritt = 0; schritt < 6; schritt++) {
      // Umlauf je Spiegel beliebig, aber fest: geprüft wird die Form, nicht der Lauf
      const umlaufVon = schritt * 0.1731;
      const umlauf = Array.from({ length: 3 * SPIEGEL_N }, (_, g) => +(umlaufVon + schritt * 0.0377 * ((g * 7) % 11)).toFixed(6));
      const zustand = { ...parameter, umlaufVon, umlauf };
      const { pattern } = erzeuge(zustand, SPIEGEL_N);
      const tilt = [];
      for (let g = 0; g < 3 * SPIEGEL_N; g++) {
        tilt.push(+(zustand.offset + pattern(Math.floor(g / SPIEGEL_N), g % SPIEGEL_N, g)).toFixed(6));
      }
      faelle.push({ parameter, umlaufVon, umlauf, tilt });
    }
  }
}

const ziel = new URL("../test/referenz.json", import.meta.url);
writeFileSync(ziel, JSON.stringify(faelle) + "\n");
console.log(`${faelle.length} Fälle nach ${ziel.pathname} geschrieben`);
