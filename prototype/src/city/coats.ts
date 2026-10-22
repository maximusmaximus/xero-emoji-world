export const COATS = {
  clay: { wall: "#d4896a", shade: "#6e3b32", roof: "#8d4b3a" },
  sage: { wall: "#8eae82", shade: "#2c4636", roof: "#3e5c45" },
  slate: { wall: "#8aa4bc", shade: "#243140", roof: "#35506a" },
  sand: { wall: "#efd09a", shade: "#8a6840", roof: "#b08a52" },
  plum: { wall: "#c498b6", shade: "#4a2c44", roof: "#6b3a56" },
  cream: { wall: "#f4e6cc", shade: "#8f7354", roof: "#c4a67a" },
  teal: { wall: "#7ec4ba", shade: "#1c4442", roof: "#2f6a64" },
  brick: { wall: "#d36a56", shade: "#6a2e28", roof: "#8a3a32" },
} as const;

export type CoatName = keyof typeof COATS;

const NAMES = Object.keys(COATS) as CoatName[];

export function isCoat(value: unknown): value is CoatName {
  return typeof value === "string" && value in COATS;
}

/** A new building picks a coat. An existing one never receives one here. */
export function pickCoat(rng: () => number, requested?: string): CoatName {
  if (isCoat(requested)) return requested;
  return NAMES[Math.floor(rng() * NAMES.length)] ?? "clay";
}
