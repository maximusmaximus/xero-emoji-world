export type Vec = { x: number; y: number };
export type Shot = { yaw: number; pitch: number; focusC: number; focusR: number };

function aim(shot: Shot) {
  const az = shot.yaw + Math.PI * 1.25;
  const elev = Math.min(1.2, Math.max(0.14, shot.pitch));
  const dist = 36;
  const tx = shot.focusC;
  const ty = shot.focusR;
  const tz = 1.5;
  const ex = tx + Math.cos(az) * Math.cos(elev) * dist;
  const ey = ty + Math.sin(az) * Math.cos(elev) * dist;
  const ez = tz + Math.sin(elev) * dist;
  let fx = tx - ex;
  let fy = ty - ey;
  let fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = fy;
  let ry = -fx;
  const rl = Math.hypot(rx, ry) || 1;
  rx /= rl;
  ry /= rl;
  const ux = ry * fz;
  const uy = -rx * fz;
  const uz = rx * fy - ry * fx;
  return { ex, ey, ez, fx, fy, fz, rx, ry, ux, uy, uz };
}

export function placedPoint(col: number, row: number, z: number, shot: Shot) {
  const cam = aim(shot);
  const dx = col - cam.ex;
  const dy = row - cam.ey;
  const dz = z / 54 - cam.ez;
  return {
    camX: dx * cam.rx + dy * cam.ry,
    camY: dx * cam.ux + dy * cam.uy + dz * cam.uz,
    camZ: dx * cam.fx + dy * cam.fy + dz * cam.fz,
  };
}

/** Screen point. Scale depends on depth, so a direction at the origin is not the direction at the sign. */
export function projectPoint(col: number, row: number, z: number, shot: Shot): Vec {
  const p = placedPoint(col, row, z, shot);
  const s = 640 / Math.max(0.4, p.camZ);
  return { x: p.camX * s, y: -p.camY * s };
}

/** Right-pointing sign lying on the road. p1 is the arrow side, along the lane. p3 crosses the lane. */
export function laneSignCorners(col: number, row: number, alongCol: boolean, span = 0.36) {
  const half = span / 2;
  const cross = span * 0.42;
  const z = 3;
  if (alongCol) {
    return {
      p0: [col - half, row - cross, z] as const,
      p1: [col + half, row - cross, z] as const,
      p3: [col - half, row + cross, z] as const,
    };
  }
  return {
    p0: [col - cross, row - half, z] as const,
    p1: [col - cross, row + half, z] as const,
    p3: [col + cross, row - half, z] as const,
  };
}

/** Pointer dy is screen-down. Pulling up lowers the camera so the view follows the hand. */
export function pitchAfterPull(pitch: number, dy: number, rate = 0.0011) {
  return Math.min(1.15, Math.max(0.18, pitch + dy * rate));
}
export function laneMismatch(shot: Shot, col: number, row: number, alongCol: boolean) {
  const g = laneSignCorners(col, row, alongCol);
  const p0 = projectPoint(g.p0[0], g.p0[1], g.p0[2], shot);
  const p1 = projectPoint(g.p1[0], g.p1[1], g.p1[2], shot);
  const a0 = projectPoint(col, row, 3, shot);
  const a1 = projectPoint(col + (alongCol ? 1 : 0), row + (alongCol ? 0 : 1), 3, shot);
  const ax = p1.x - p0.x;
  const ay = p1.y - p0.y;
  const bx = a1.x - a0.x;
  const by = a1.y - a0.y;
  return Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by);
}
