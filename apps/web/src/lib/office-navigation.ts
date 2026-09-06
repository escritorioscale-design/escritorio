export type Point = { x: number; y: number };
export type Obstacle = Point & { w: number; h: number };
export const PLAYER_HALF = 0.28;
const CELL = 0.5;

export function canStand(point: Point, blockers: readonly Obstacle[], cols: number, rows: number) {
  const { x, y } = point;
  return Number.isFinite(x) && Number.isFinite(y) && x >= PLAYER_HALF && y >= PLAYER_HALF
    && x <= cols - PLAYER_HALF && y <= rows - PLAYER_HALF
    && !blockers.some((r) => x + PLAYER_HALF > r.x && x - PLAYER_HALF < r.x + r.w
      && y + PLAYER_HALF > r.y && y - PLAYER_HALF < r.y + r.h);
}

export function clearSegment(from: Point, to: Point, blockers: readonly Obstacle[], cols: number, rows: number) {
  if (!canStand(from, blockers, cols, rows) || !canStand(to, blockers, cols, rows)) return false;
  // Slab intersection against expanded rectangles is exact at diagonal
  // corners; sampling can skip a sliver and strand the follower at a door.
  for (const rect of blockers) {
    let entry = 0, exit = 1;
    for (const axis of ["x", "y"] as const) {
      const delta = to[axis] - from[axis];
      const min = rect[axis] - PLAYER_HALF + 1e-8;
      const max = rect[axis] + (axis === "x" ? rect.w : rect.h) + PLAYER_HALF - 1e-8;
      if (Math.abs(delta) < 1e-10) {
        if (from[axis] <= min || from[axis] >= max) { entry = 2; break; }
      } else {
        const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
        entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (entry <= exit && exit >= 0 && entry <= 1) return false;
  }
  return true;
}

/** Swept, axis-separated movement: even a slow frame cannot skip a wall. */
export function moveSafely(from: Point, dx: number, dy: number, blockers: readonly Obstacle[], cols: number, rows: number): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.12));
  let { x, y } = from;
  for (let i = 0; i < steps; i++) {
    if (canStand({ x: x + dx / steps, y }, blockers, cols, rows)) x += dx / steps;
    if (canStand({ x, y: y + dy / steps }, blockers, cols, rows)) y += dy / steps;
  }
  return { x, y };
}

export function nearestWalkable(point: Point, blockers: readonly Obstacle[], cols: number, rows: number): Point | null {
  if (canStand(point, blockers, cols, rows)) return point;
  let best: Point | null = null, distance = Infinity;
  for (let y = CELL; y < rows; y += CELL) for (let x = CELL; x < cols; x += CELL) {
    const d = (x - point.x) ** 2 + (y - point.y) ** 2;
    if (d < distance && canStand({ x, y }, blockers, cols, rows)) { best = { x, y }; distance = d; }
  }
  return best;
}

/** A* validates every edge with the same body footprint as keyboard movement.
 * A blocked/unreachable click never falls back to a line through furniture. */
export function navigate(from: Point, to: Point, blockers: readonly Obstacle[], cols: number, rows: number): Point[] {
  if (!canStand(from, blockers, cols, rows) || !canStand(to, blockers, cols, rows)) return [];
  if (clearSegment(from, to, blockers, cols, rows)) return [to];
  const width = Math.ceil(cols / CELL) + 1, height = Math.ceil(rows / CELL) + 1;
  const count = width * height;
  const point = (i: number): Point => ({ x: (i % width) * CELL, y: Math.floor(i / width) * CELL });
  const blocked = new Uint8Array(count);
  for (let i = 0; i < count; i++) blocked[i] = canStand(point(i), blockers, cols, rows) ? 0 : 1;
  const connector = (target: Point) => {
    let index = -1, best = Infinity;
    const cx = Math.round(target.x / CELL), cy = Math.round(target.y / CELL);
    for (let y = Math.max(0, cy - 3); y <= Math.min(height - 1, cy + 3); y++) for (let x = Math.max(0, cx - 3); x <= Math.min(width - 1, cx + 3); x++) {
      const i = y * width + x, p = point(i), d = Math.hypot(p.x - target.x, p.y - target.y);
      if (!blocked[i] && d < best && clearSegment(target, p, blockers, cols, rows)) { best = d; index = i; }
    }
    return index;
  };
  const start = connector(from), goal = connector(to);
  if (start < 0 || goal < 0) return [];
  const score = new Float64Array(count).fill(Infinity), previous = new Int32Array(count).fill(-1);
  const visited = new Uint8Array(count);
  score[start] = 0;
  const heuristic = (i: number) => Math.hypot(point(i).x - to.x, point(i).y - to.y);
  const open = [{ i: start, f: heuristic(start) }];
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const current = open.splice(best, 1)[0].i;
    if (current === goal) break;
    if (visited[current]) continue;
    visited[current] = 1;
    const p = point(current);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = current % width + dx, y = Math.floor(current / width) + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const next = y * width + x;
      if (blocked[next] || visited[next] || !clearSegment(p, point(next), blockers, cols, rows)) continue;
      const cost = score[current] + Math.hypot(dx, dy) * CELL;
      if (cost < score[next]) { score[next] = cost; previous[next] = current; open.push({ i: next, f: cost + heuristic(next) }); }
    }
  }
  if (!Number.isFinite(score[goal])) return [];
  const path: Point[] = [to];
  for (let i = goal; i !== -1; i = previous[i]) path.unshift(point(i));
  const smooth: Point[] = [];
  let anchor = from, index = 0;
  while (index < path.length) {
    let next = index;
    while (next + 1 < path.length && clearSegment(anchor, path[next + 1], blockers, cols, rows)) next++;
    smooth.push(path[next]); anchor = path[next]; index = next + 1;
  }
  return smooth;
}
