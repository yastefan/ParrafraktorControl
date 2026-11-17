// Aussehen der Vorschau. Von außen änderbar (z. B. für einen Vortrag) mit setzeVorschauStil;
// Werte ohne # sind RGB-Tripel, die mit eigener Transparenz gezeichnet werden.
export const VORSCHAU_STIL = {
  grund: "#0b0a0f",
  rahmen: "#2a2d33",
  spiegel: "#c9ccd1",
  live: "#ff1f4f",
  licht: "255,214,160",        // warmes Gegenlicht wie in der Simulation
  lichtLive: "240,160,48",
  rueckseite: "#2a2630",
  spiegelHell: "235,235,247",  // Vorderseite von vorn: Rand und Mitte des Verlaufs bei vollem Glanz
  spiegelMitte: "170,170,190",
  spiegelKante: "232,236,244", // Reflexion: Vorderseite; Nebel: Kante der Spiegel
  linie: "255,255,255",        // Raster, Wände, Boden, Rahmen der Elemente von vorn
  scherenschnitt: "6,5,10",    // Nebel: Spiegel vor dem Licht
  nebelGrund: "4,3,8",         // Nebel: Raum ohne Licht
  punkt: "0,229,255",          // Phaser: Neonfarben wie in der Oberfläche
  punktLive: "255,31,79",
  punktElemente: [] as string[], // Phaser: je Element eine eigene Farbe (RGB-Tripel), leer = überall „punkt“
  achse: "140,136,168",        // Phaser: Raster, Nulllinie, Rahmen, Beschriftung
  text: "255,255,255",
  schrift: "600 10px -apple-system, sans-serif",   // Größe wird je Stelle ersetzt
  schein: true,                // Schein um Punkte und Scheinwerfer
  hinweise: true,              // „Scheinwerfer ziehen“
  messwerte: true,             // Nebel: Strahlen, Rechenzeit, Bilder/s
  bahn: false,                 // von vorn, bei Öffnung: feste Bahn, Spur der letzten Sekunden und das Loch als Linie
  bahnFarbe: "255,255,255",
  phaserAchse: 0,              // Phaser: feste Höhe der Achse in Grad (±), 0 = so hoch wie nötig
};
export type VorschauStil = typeof VORSCHAU_STIL;
export function setzeVorschauStil(stil: Partial<VorschauStil>): void {
  Object.assign(VORSCHAU_STIL, stil);
}
// Schrift der Vorschau in einer bestimmten Größe
export const schrift = (px: number): string => VORSCHAU_STIL.schrift.replace(/\d+(\.\d+)?px/, `${px}px`);
