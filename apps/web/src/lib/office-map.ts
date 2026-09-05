export const TILE = 32;
// Kept as shared scale constants for proximity audio and legacy consumers.
// The active workspace uses the 16x16 reference map as its visual world.
export const MAP_COLS = 16;
export const MAP_ROWS = 16;
export const CORRIDOR_Y = MAP_ROWS / 2;
export const WALL_THICKNESS = 0.4;
export const DOOR_WIDTH = 2.5;

export type DoorSide = "top" | "bottom";
export type AvatarDirection = "up" | "down" | "left" | "right";
export type Rect = { x: number; y: number; w: number; h: number };
export type RoomKind = "AUDITORIUM" | "DIRECTOR" | "FOCUS" | "MEETING" | "CUSTOM";

export type TileRoom = {
  id: string;
  kind: RoomKind;
  name: string;
  x: number; y: number; w: number; h: number;
  doorSide: DoorSide;
  parentId?: string;
  /** Manually locked by an admin — always solid, never opens for anyone. */
  locked: boolean;
};

export type FurniturePiece = {
  id: string;
  key: string;
  x: number; y: number;
  scale?: number;
  /** Seat-sit direction — only meaningful for `chair-*` items. */
  facing?: AvatarDirection;
  /** Explicit collision rect. `null` = never collides. `undefined` = derive
   * a reasonable default footprint from `key` (see `furnitureFootprint`). */
  collides?: Rect | null;
};

export type Seat = { id: string; roomId: string; x: number; y: number; direction: AvatarDirection };

export type OfficeLayout = {
  version: number;
  mapCols: number;
  mapRows: number;
  rooms: TileRoom[];
  furniture: FurniturePiece[];
};

// Reasonable default collision footprints (tile units) for furniture placed
// via the editor without an explicit `collides` override. Anything not
// listed (chairs, wall art, rugs, small desk clutter…) is walk-through.
const FOOTPRINT: Record<string, { w: number; h: number }> = {
  "desk-cubicle": { w: 3.2, h: 1.6 },
  "desk-cubicle-dark": { w: 4.4, h: 2.2 },
  "desk-plain": { w: 3.2, h: 1.6 },
  "table-long": { w: 4.8, h: 1.8 },
  sofa: { w: 5.2, h: 1.8 },
  cabinet: { w: 1.6, h: 1.2 },
  safe: { w: 1.4, h: 1.2 },
  "server-rack": { w: 1.4, h: 1.2 },
  printer: { w: 1.4, h: 1 },
  watercooler: { w: 1, h: 1 },
  "plant-tree": { w: 1, h: 1 },
  divider: { w: 0.6, h: 2 },
  "coffee-machine": { w: 1.6, h: 1.2 },
};

export function furniturePieceCollider(piece: FurniturePiece): Rect | null {
  if (piece.collides === null) return null;
  if (piece.collides) return piece.collides;
  const footprint = FOOTPRINT[piece.key];
  if (!footprint) return null;
  return { x: piece.x - footprint.w / 2, y: piece.y - footprint.h / 2, w: footprint.w, h: footprint.h };
}

export function findRoom(layout: OfficeLayout, id: string): TileRoom | undefined {
  return layout.rooms.find((room) => room.id === id);
}

export function topLevelRoom(layout: OfficeLayout, room: TileRoom): TileRoom {
  return room.parentId ? findRoom(layout, room.parentId) ?? room : room;
}

export function doorAtBottom(room: TileRoom) {
  return room.doorSide === "bottom";
}
export function doorX(room: TileRoom) {
  return room.x + room.w / 2;
}
export function doorY(room: TileRoom) {
  return doorAtBottom(room) ? room.y + room.h : room.y;
}
export function doorApproach(room: TileRoom, offset = 1.5) {
  const y = doorY(room);
  return { x: doorX(room), y: doorAtBottom(room) ? y - offset : y + offset };
}
/** A point just outside the room's door, in whatever space surrounds it (the
 * shared corridor for top-level rooms, or the parent room's floor for a
 * nested one). */
export function doorOutside(room: TileRoom, offset = 1.5) {
  const y = doorY(room);
  return { x: doorX(room), y: doorAtBottom(room) ? y + offset : y - offset };
}

export function wallSegments(room: TileRoom, open: boolean): Rect[] {
  const left = room.x, right = room.x + room.w, top = room.y, bottom = room.y + room.h;
  const hy = doorAtBottom(room) ? bottom - WALL_THICKNESS : top;
  const firstW = (room.w - DOOR_WIDTH) / 2;
  const horizontals: Rect[] = open
    ? [
      { x: left, y: hy, w: firstW, h: WALL_THICKNESS },
      { x: left + firstW + DOOR_WIDTH, y: hy, w: firstW, h: WALL_THICKNESS },
    ]
    : [{ x: left, y: hy, w: room.w, h: WALL_THICKNESS }];
  return [
    { x: left, y: top, w: WALL_THICKNESS, h: room.h },
    { x: right - WALL_THICKNESS, y: top, w: WALL_THICKNESS, h: room.h },
    ...horizontals,
  ];
}

export function isInsideRoom(x: number, y: number, room: TileRoom) {
  return x > room.x + 0.3 && x < room.x + room.w - 0.3 && y > room.y + 0.3 && y < room.y + room.h - 0.3;
}

/** The innermost room containing the point (a nested room takes priority
 * over whatever contains it). */
export function roomAt(layout: OfficeLayout, x: number, y: number): TileRoom | undefined {
  const matches = layout.rooms.filter((room) => isInsideRoom(x, y, room));
  if (!matches.length) return undefined;
  return matches.sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

/** Every room id whose door should be treated as passable for pathing and
 * proximity purposes — everything except rooms an admin has locked. */
export function unlockedRoomIds(layout: OfficeLayout): Set<string> {
  return new Set(layout.rooms.filter((room) => !room.locked).map((room) => room.id));
}

export function getWalls(layout: OfficeLayout, open: ReadonlySet<string> = new Set()): Rect[] {
  return layout.rooms.flatMap((room) => wallSegments(room, open.has(room.id)));
}

export function getFurnitureColliders(layout: OfficeLayout): Rect[] {
  return layout.furniture.flatMap((piece) => {
    const rect = furniturePieceCollider(piece);
    return rect ? [rect] : [];
  });
}

/** Any placed chair becomes a sittable seat — its facing direction controls
 * which way the seated avatar looks. */
export function getAllSeats(layout: OfficeLayout): Seat[] {
  return layout.furniture
    .filter((piece) => piece.key.startsWith("chair"))
    .map((piece) => ({
      id: piece.id,
      roomId: roomAt(layout, piece.x, piece.y)?.id ?? "",
      x: piece.x,
      y: piece.y,
      direction: piece.facing ?? "up",
    }));
}

/** Doors currently visually open — proximity-based, and never true for a
 * locked room regardless of how close someone stands. */
export function openDoorsForPosition(layout: OfficeLayout, x: number, y: number): Set<string> {
  return new Set(layout.rooms.filter((room) => {
    if (room.locked) return false;
    const dx = doorX(room), dy = doorY(room);
    return Math.hypot(dx - x, dy - y) <= 3 || isInsideRoom(x, y, room);
  }).map((room) => room.id));
}

// ---------------------------------------------------------------------------
// Pathfinding — a plain grid A* over half-tile cells. Layouts are now
// free-form (rooms can be anywhere), so the old "always aligned to one
// shared corridor" waypoint heuristic no longer holds; this works for any
// layout. Every unlocked door is treated as passable (it opens on approach
// in practice, per `openDoorsForPosition`) — a locked room's door stays a
// solid wall segment, so no path can be found through it.
const CELL = 0.5;

function buildBlockedGrid(layout: OfficeLayout, cols: number, rows: number): Uint8Array {
  const rects = [...getWalls(layout, unlockedRoomIds(layout)), ...getFurnitureColliders(layout)];
  const blocked = new Uint8Array(cols * rows);
  const margin = 0.16;
  for (const r of rects) {
    const minGx = Math.max(0, Math.floor((r.x - margin) / CELL));
    const maxGx = Math.min(cols - 1, Math.ceil((r.x + r.w + margin) / CELL));
    const minGy = Math.max(0, Math.floor((r.y - margin) / CELL));
    const maxGy = Math.min(rows - 1, Math.ceil((r.y + r.h + margin) / CELL));
    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) blocked[gy * cols + gx] = 1;
    }
  }
  return blocked;
}

function nearestOpenCell(blocked: Uint8Array, cols: number, rows: number, gx: number, gy: number): number {
  const start = gy * cols + gx;
  if (gx >= 0 && gx < cols && gy >= 0 && gy < rows && !blocked[start]) return start;
  for (let radius = 1; radius < Math.max(cols, rows); radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const idx = ny * cols + nx;
        if (!blocked[idx]) return idx;
      }
    }
  }
  return start;
}

/** Removes interior waypoints that lie on the same straight line as their
 * neighbors, so the follower doesn't stop-and-go on every grid cell. */
function simplifyPath(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1], b = points[i], c = points[i + 1];
    const collinear = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-6;
    if (!collinear) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function findPath(layout: OfficeLayout, fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] {
  const cols = Math.ceil(layout.mapCols / CELL);
  const rows = Math.ceil(layout.mapRows / CELL);
  const blocked = buildBlockedGrid(layout, cols, rows);

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.round(v / CELL)));
  const startIdx = nearestOpenCell(blocked, cols, rows, clamp(fromX, cols), clamp(fromY, rows));
  const goalIdx = nearestOpenCell(blocked, cols, rows, clamp(toX, cols), clamp(toY, rows));
  if (startIdx === goalIdx) return [{ x: toX, y: toY }];

  const goalGx = goalIdx % cols, goalGy = Math.floor(goalIdx / cols);
  const heuristic = (idx: number) => {
    const gx = idx % cols, gy = Math.floor(idx / cols);
    return Math.hypot(gx - goalGx, gy - goalGy);
  };

  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const visited = new Uint8Array(cols * rows);
  gScore[startIdx] = 0;
  // A tiny binary-heap-free open set is fine at this grid size (a few
  // thousand cells) — this runs once per click, not per frame.
  const open: { idx: number; f: number }[] = [{ idx: startIdx, f: heuristic(startIdx) }];
  const neighbors = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ] as const;

  while (open.length) {
    let bestI = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestI].f) bestI = i;
    const { idx: current } = open.splice(bestI, 1)[0];
    if (current === goalIdx) break;
    if (visited[current]) continue;
    visited[current] = 1;
    const cx = current % cols, cy = Math.floor(current / cols);
    for (const [dx, dy, cost] of neighbors) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const nIdx = ny * cols + nx;
      if (blocked[nIdx] || visited[nIdx]) continue;
      // No cutting diagonally through a blocked corner.
      if (dx !== 0 && dy !== 0 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
      const tentative = gScore[current] + cost;
      if (tentative < gScore[nIdx]) {
        gScore[nIdx] = tentative;
        cameFrom[nIdx] = current;
        open.push({ idx: nIdx, f: tentative + heuristic(nIdx) });
      }
    }
  }

  if (gScore[goalIdx] === Infinity) return [{ x: toX, y: toY }];
  const cellPath: { x: number; y: number }[] = [];
  for (let at = goalIdx; at !== -1; at = cameFrom[at]) {
    cellPath.push({ x: (at % cols) * CELL, y: Math.floor(at / cols) * CELL });
  }
  cellPath.reverse();
  cellPath.push({ x: toX, y: toY });
  return simplifyPath(cellPath);
}
