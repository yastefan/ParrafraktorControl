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
const erzeuge = new Function("zustand", "SPIEGEL_N", `${quelle.slice(anfang, ende)}\nreturn pattern;`);

const modi = ["sinus", "dreieck", "rechteck", "saegezahn", "sinus-innen", "sinus-aussen", "faecher",
  "flyout", "blinder", "chase", "pingpong", "funkeln"];
const varianten = [
  { group: 0, jeElement: false, speedBis: 0 },
  { group: 5, jeElement: false, speedBis: 7 },
  { group: 0, jeElement: true, speedBis: 2 },
  { group: 4, jeElement: true, speedBis: 0 },
];
const PHASE = { sinus: 360, "sinus-innen": 180, "sinus-aussen": 180, dreieck: 360, rechteck: 360,
  saegezahn: 360, flyout: 120, chase: 360 };

const faelle = [];
for (const modus of modi) {
  for (const v of varianten) {
    const parameter = {
      modus, offset: 12, amplitude: 55, speedVon: 3, speedBis: v.speedBis,
      phase: PHASE[modus] ?? 0, group: v.group, jeElement: v.jeElement, laeuft: true,
    };
    for (let schritt = 0; schritt < 8; schritt++) {
      const zustand = {
        ...parameter,
        anordnung: v.jeElement ? "classic" : "reihe",
        umlaufVon: schritt * 0.1731,
        umlaufBis: schritt * (v.speedBis ? 0.2913 : 0.1731),
      };
      const pattern = erzeuge(zustand, SPIEGEL_N);
      const tilt = [];
      for (let g = 0; g < 3 * SPIEGEL_N; g++) {
        tilt.push(+(zustand.offset + pattern(Math.floor(g / SPIEGEL_N), g % SPIEGEL_N, g)).toFixed(6));
      }
      faelle.push({ parameter, umlaufVon: zustand.umlaufVon, umlaufBis: zustand.umlaufBis, tilt });
    }
  }
}

const ziel = new URL("../test/referenz.json", import.meta.url);
writeFileSync(ziel, JSON.stringify(faelle) + "\n");
console.log(`${faelle.length} Fälle nach ${ziel.pathname} geschrieben`);
