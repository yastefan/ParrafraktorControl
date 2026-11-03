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
const erzeuge = new Function("zustand", "SPIEGEL_N", `${quelle.slice(anfang, ende)}\nreturn { pattern, anteilVon };`);

const modi = ["sinus", "dreieck", "rechteck", "saegezahn", "puls", "flyout", "blinder", "funkeln"];
const varianten = [
  { group: 0, jeElement: false, speedBis: 0, symmetrie: "aus", richtung: "vor", faecher: 0, phase: 360 },
  { group: 5, jeElement: false, speedBis: 7, symmetrie: "innen", richtung: "vor", faecher: 60, phase: 180 },
  { group: 0, jeElement: true, speedBis: 2, symmetrie: "aussen", richtung: "zurueck", faecher: 0, phase: 360 },
  { group: 4, jeElement: true, speedBis: 0, symmetrie: "aus", richtung: "pingpong", faecher: 100, phase: 120 },
  { group: 0, jeElement: false, speedBis: 0, symmetrie: "innen", richtung: "pingpong", faecher: 0, phase: 720 },
  { group: 3, jeElement: false, speedBis: 5, symmetrie: "aussen", richtung: "zurueck", faecher: 30, phase: 0 },
];

const faelle = [];
for (const modus of modi) {
  for (const v of varianten) {
    const parameter = {
      modus, offset: 12, amplitude: 55, speedVon: 3, speedBis: v.speedBis, phase: v.phase, group: v.group,
      symmetrie: v.symmetrie, richtung: v.richtung, faecher: v.faecher, jeElement: v.jeElement, laeuft: true,
    };
    for (let schritt = 0; schritt < 6; schritt++) {
      const umlaufVon = schritt * 0.1731;
      const umlaufBis = schritt * (v.speedBis ? 0.2913 : 0.1731);
      const zustand = { ...parameter, anordnung: v.jeElement ? "classic" : "reihe", umlaufVon, umlauf: [] };
      const { pattern, anteilVon } = erzeuge(zustand, SPIEGEL_N);
      // Umlauf je Spiegel wie nach gleichmäßigem Lauf mit Speed von/bis
      for (let g = 0; g < 3 * SPIEGEL_N; g++) zustand.umlauf[g] = umlaufVon + (umlaufBis - umlaufVon) * anteilVon(g);
      const tilt = [];
      for (let g = 0; g < 3 * SPIEGEL_N; g++) {
        tilt.push(+(zustand.offset + pattern(Math.floor(g / SPIEGEL_N), g % SPIEGEL_N, g)).toFixed(6));
      }
      faelle.push({ parameter, umlaufVon, umlaufBis, tilt });
    }
  }
}

const ziel = new URL("../test/referenz.json", import.meta.url);
writeFileSync(ziel, JSON.stringify(faelle) + "\n");
console.log(`${faelle.length} Fälle nach ${ziel.pathname} geschrieben`);
