// Layout of the Parrafraktor: three elements with twelve rotatable mirrors each
export const ELEMENTS = 3;
export const MIRRORS_PER_ELEMENT = 12;
export const MIRRORS_TOTAL = ELEMENTS * MIRRORS_PER_ELEMENT;

// How the elements run relative to each other (element 1 = front). Applies to the base movement and,
// set separately, to the impulses. The values are saved data and stay German:
//   zusammen     all elements alike ("together", formerly "per element")
//   vorneHinten  the pattern runs from element 1 via 2 to 3 (formerly "all 36")
//   hintenVorne  the other way round
//   mitteAussen  first the middle element, then both outer ones at once; the first element is the
//                mirror image of the third (ordering mirrored, with counter-motion also the angle),
//                so the whole installation runs symmetrically
export const ELEMENT_ORDERS = ["zusammen", "vorneHinten", "hintenVorne", "mitteAussen"] as const;
export type ElementOrder = (typeof ELEMENT_ORDERS)[number];
export const ELEMENT_ORDER_NAME: Record<ElementOrder, string> = {
  zusammen: "together",
  vorneHinten: "front → back",
  hintenVorne: "back → front",
  mitteAussen: "center → out",
};
export const isElementOrder = (x: unknown): x is ElementOrder => (ELEMENT_ORDERS as readonly unknown[]).includes(x);

// Rank of element k in the order, null = all together
export function elementRank(order: ElementOrder, k: number): number | null {
  switch (order) {
    case "vorneHinten": return k;
    case "hintenVorne": return ELEMENTS - 1 - k;
    case "mitteAussen": return k === 1 ? 0 : 1;
    default: return null;
  }
}

// How many ranks the element order has (center → out: the middle, then both outer ones)
export const elementRanks = (order: ElementOrder): number => (order === "mitteAussen" ? 2 : ELEMENTS);

// Is element k the mirrored one (center → out: the first, left or front)?
export const elementMirrored = (order: ElementOrder, k: number): boolean => order === "mitteAussen" && k === 0;
