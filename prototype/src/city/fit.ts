/** A street door, as a slice of the wall. t is up the face. The slot stays door-shaped at any zoom. */
export function doorOpening(faceW: number, faceH: number) {
  const widthU = 0.24;
  const want = (1.65 * widthU * Math.max(0, faceW)) / Math.max(1, faceH);
  return {
    u0: 0.5 - widthU / 2,
    u1: 0.5 + widthU / 2,
    t: Math.min(0.2, Math.max(0.04, want)),
  };
}

/** Emoji size as a fraction of the surface it stands on. No pixel cap, so zoom keeps the ratio. */
export function fitted(surface: number, portion: number) {
  return Math.max(1, surface * portion);
}
