// Aufbau des Parrafraktors: drei Elemente mit je zwölf drehbaren Spiegeln
export const ELEMENTE = 3;
export const SPIEGEL_N = 12;   // Spiegel pro Element
export const SPIEGEL_GESAMT = ELEMENTE * SPIEGEL_N;

// Wie die Elemente zueinander laufen (Element 1 = vorn). Gilt für die Grundbewegung und,
// getrennt eingestellt, für die Impulse.
//   zusammen     alle Elemente gleich (bisher "je Element")
//   vorneHinten  das Muster läuft von Element 1 über 2 nach 3 (bisher "alle 36")
//   hintenVorne  umgekehrt
//   mitteAussen  erst das mittlere Element, dann beide äußeren zugleich; das erste Element ist
//                das Spiegelbild des dritten (Ordnung gespiegelt, mit Gegenlauf auch der Winkel),
//                damit die ganze Installation symmetrisch läuft
export const ELEMENT_FOLGEN = ["zusammen", "vorneHinten", "hintenVorne", "mitteAussen"] as const;
export type ElementFolge = (typeof ELEMENT_FOLGEN)[number];
export const ELEMENT_FOLGE_NAME: Record<ElementFolge, string> = {
  zusammen: "zusammen",
  vorneHinten: "vorn → hinten",
  hintenVorne: "hinten → vorn",
  mitteAussen: "Mitte → außen",
};
export const istElementFolge = (x: unknown): x is ElementFolge => (ELEMENT_FOLGEN as readonly unknown[]).includes(x);

// Platz des Elements k in der Folge, null = alle zusammen
export function elementRang(folge: ElementFolge, k: number): number | null {
  switch (folge) {
    case "vorneHinten": return k;
    case "hintenVorne": return ELEMENTE - 1 - k;
    case "mitteAussen": return k === 1 ? 0 : 1;
    default: return null;
  }
}

// Wie viele Plätze die Element-Folge hat (Mitte → außen: Mitte, dann beide äußeren)
export const elementRaenge = (folge: ElementFolge): number => (folge === "mitteAussen" ? 2 : ELEMENTE);

// Ist Element k das gespiegelte (Mitte → außen: das erste, links bzw. vorn)?
export const elementGespiegelt = (folge: ElementFolge, k: number): boolean => folge === "mitteAussen" && k === 0;
