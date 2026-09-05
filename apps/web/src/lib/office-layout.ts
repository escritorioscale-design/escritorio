// The one dynamic, per-workspace office layout: rooms and furniture are
// plain data (persisted as Space.mapData) instead of hardcoded constants, so
// an admin can freely add/move/delete rooms and furniture in the editor and
// have it render exactly the same way in the live office. See
// `office-builder.tsx` (renderer) and `office-editor.tsx` (the builder UI).
//
// Deliberately self-contained: it does NOT read from modern-office-map.ts
// (a separate, still-evolving reference-image preview) so this default never
// breaks if that file's room shapes or asset keys change — every key used
// below is one of this module's own ITEM_KEYS.

export const TILE = 32;
export const WALL_THICKNESS = 0.4;
export const DOOR_WIDTH = 2.5;
/** Radius (tiles) of a self-locked seat's private bubble — used both to keep
 * other people's characters from walking in and to cap how far the
 * conversation carries once someone locks their own desk. */
export const SEAT_LOCK_RADIUS = 1.8;

export type DoorSide = "top" | "bottom";
export type AvatarDirection = "up" | "down" | "left" | "right";
export type Rect = { x: number; y: number; w: number; h: number };
export type RoomKind = "MEETING" | "DIRECTOR" | "FOCUS" | "CREATIVE" | "AUDITORIUM" | "CUSTOM";

export type LayoutRoom = {
  id: string;
  kind: RoomKind;
  name: string;
  x: number; y: number; w: number; h: number;
  doorSide: DoorSide;
  /** Manually locked by an admin — the door never opens for anyone,
   * regardless of proximity, and no path can be found through it. */
  locked: boolean;
};

export type LayoutFurniture = {
  id: string;
  key: string;
  x: number; y: number;
  scale?: number;
  /** Seat-sit direction — only meaningful for `chair-*` items. */
  facing?: AvatarDirection;
  /** Explicit collision rect. `null` = never collides. `undefined` = derive
   * a reasonable default footprint from `key` (see FOOTPRINT below). */
  collides?: Rect | null;
};

export type Seat = { id: string; roomId: string; x: number; y: number; direction: AvatarDirection };

export type OfficeLayout = {
  version: number;
  mapCols: number;
  mapRows: number;
  rooms: LayoutRoom[];
  furniture: LayoutFurniture[];
};

// The full palette of furniture/decor available in the editor — every item
// here has a matching /tileset/items/<key>.png asset.
export const ITEM_KEYS = [
  "desk-cubicle", "desk-cubicle-dark", "desk-plain", "chair-navy", "chair-orange", "chair-wood",
  "monitor", "laptop", "printer", "cabinet", "safe", "whiteboard", "whiteboard-blank",
  "watercooler", "server-rack", "sofa", "pouf", "table-long", "divider", "bookshelf",
  "plant-small", "plant-tree", "clock",
  "wall-art-blue", "wall-art-orange", "plant-pot-a", "plant-pot-b", "corkboard",
  "papers", "backpack", "keyboard", "coffee-machine", "rug",
] as const;
export const SURFACE_KEYS = ["floor-mo-wood", "floor-mo-purple", "floor-mo-slate", "floor-mo-gray"] as const;

const ITEM_LABELS: Partial<Record<string, string>> = {
  "desk-cubicle": "Mesa", "desk-cubicle-dark": "Mesa executiva", "desk-plain": "Mesa simples",
  "chair-navy": "Cadeira azul", "chair-orange": "Cadeira laranja", "chair-wood": "Cadeira de madeira",
  monitor: "Monitor", laptop: "Notebook", printer: "Impressora", cabinet: "Armário", safe: "Cofre",
  whiteboard: "Quadro branco", "whiteboard-blank": "Quadro em branco", watercooler: "Bebedouro",
  "server-rack": "Rack de servidor", sofa: "Sofá", pouf: "Pufe", "table-long": "Mesa de reunião",
  divider: "Divisória", bookshelf: "Estante", "plant-small": "Planta pequena", "plant-tree": "Árvore",
  clock: "Relógio", "wall-art-blue": "Quadro decorativo", "wall-art-orange": "Quadro decorativo",
  "plant-pot-a": "Vaso de planta", "plant-pot-b": "Vaso de planta", corkboard: "Mural de cortiça",
  papers: "Papéis", backpack: "Mochila", keyboard: "Teclado", "coffee-machine": "Máquina de café",
  rug: "Tapete",
};
export function itemLabel(key: string): string {
  return ITEM_LABELS[key] ?? key;
}

export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  MEETING: "Sala de reunião", DIRECTOR: "Diretoria", FOCUS: "Squad / foco",
  CREATIVE: "Criação", AUDITORIUM: "Auditório", CUSTOM: "Sala",
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
  bookshelf: { w: 1.6, h: 1.2 },
  safe: { w: 1.4, h: 1.2 },
  "server-rack": { w: 1.4, h: 1.2 },
  printer: { w: 1.4, h: 1 },
  watercooler: { w: 1, h: 1 },
  "plant-tree": { w: 1, h: 1 },
  divider: { w: 0.6, h: 2 },
  "coffee-machine": { w: 1.6, h: 1.2 },
};

export function defaultFootprint(key: string): { w: number; h: number } | null {
  return FOOTPRINT[key] ?? null;
}

// Plain shapes instead of drawn sprites — a colored rectangle or circle per
// item category. Much easier to tweak than pixel art, and keeps the map
// rendering-agnostic (no image assets to load or keep in sync).
export type FurnitureVisual = { shape: "rect" | "circle"; color: string; w: number; h: number };

function visualCategory(key: string): { shape: "rect" | "circle"; color: string } {
  if (key.startsWith("chair")) {
    return { shape: "circle", color: key.includes("navy") ? "#3b4a63" : key.includes("orange") ? "#c9793b" : "#8a6a4a" };
  }
  if (key.startsWith("desk") || key === "table-long") return { shape: "rect", color: "#c9a876" };
  if (key.startsWith("plant")) return { shape: "circle", color: "#4a8f5c" };
  if (["cabinet", "bookshelf", "server-rack", "safe", "printer"].includes(key)) return { shape: "rect", color: "#8890a0" };
  if (["whiteboard", "whiteboard-blank", "corkboard", "wall-art-blue", "wall-art-orange", "clock"].includes(key)) {
    return { shape: "rect", color: "#e8e4da" };
  }
  if (key === "sofa" || key === "pouf") return { shape: "rect", color: "#9c8ac2" };
  if (key === "rug") return { shape: "rect", color: "#d6c9a8" };
  return { shape: "rect", color: "#b7aa96" };
}

export function furnitureVisual(key: string): FurnitureVisual {
  const category = visualCategory(key);
  const footprint = FOOTPRINT[key];
  const size = footprint ?? (category.shape === "circle" ? { w: 0.7, h: 0.7 } : { w: 0.9, h: 0.6 });
  return { ...category, w: size.w, h: size.h };
}

export function furnitureCollider(piece: LayoutFurniture): Rect | null {
  if (piece.collides === null) return null;
  if (piece.collides) return piece.collides;
  const footprint = FOOTPRINT[piece.key];
  if (!footprint) return null;
  return { x: piece.x - footprint.w / 2, y: piece.y - footprint.h / 2, w: footprint.w, h: footprint.h };
}

export function findRoom(layout: OfficeLayout, id: string): LayoutRoom | undefined {
  return layout.rooms.find((room) => room.id === id);
}

export function doorAtBottom(room: LayoutRoom) {
  return room.doorSide === "bottom";
}
export function doorX(room: LayoutRoom) {
  return room.x + room.w / 2;
}
export function doorY(room: LayoutRoom) {
  return doorAtBottom(room) ? room.y + room.h : room.y;
}
export function doorApproach(room: LayoutRoom, offset = 1.4) {
  const y = doorY(room);
  return { x: doorX(room), y: doorAtBottom(room) ? y - offset : y + offset };
}

export function wallSegments(room: LayoutRoom, open: boolean): Rect[] {
  const left = room.x, right = room.x + room.w, top = room.y, bottom = room.y + room.h;
  const doorWallY = doorAtBottom(room) ? bottom - WALL_THICKNESS : top;
  const otherWallY = doorAtBottom(room) ? top : bottom - WALL_THICKNESS;
  const doorWidth = Math.min(DOOR_WIDTH, Math.max(1, room.w - 2));
  const firstW = (room.w - doorWidth) / 2;
  const doorSideWall: Rect[] = open
    ? [
      { x: left, y: doorWallY, w: firstW, h: WALL_THICKNESS },
      { x: left + firstW + doorWidth, y: doorWallY, w: firstW, h: WALL_THICKNESS },
    ]
    : [{ x: left, y: doorWallY, w: room.w, h: WALL_THICKNESS }];
  return [
    { x: left, y: top, w: WALL_THICKNESS, h: room.h },
    { x: right - WALL_THICKNESS, y: top, w: WALL_THICKNESS, h: room.h },
    // The side opposite the door has no gap — it was previously left
    // wall-less entirely (only the door side ever got a horizontal
    // segment), so a room's non-door edge was silently walk-through. The
    // old hand-written pathing never noticed because it always routed
    // through the actual door; real A* pathfinding finds that "shortcut".
    { x: left, y: otherWallY, w: room.w, h: WALL_THICKNESS },
    ...doorSideWall,
  ];
}

export function isInsideRoom(x: number, y: number, room: LayoutRoom) {
  return x > room.x + 0.3 && x < room.x + room.w - 0.3 && y > room.y + 0.3 && y < room.y + room.h - 0.3;
}

export function roomAt(layout: OfficeLayout, x: number, y: number): LayoutRoom | undefined {
  const matches = layout.rooms.filter((room) => isInsideRoom(x, y, room));
  if (!matches.length) return undefined;
  return matches.sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

export function unlockedRoomIds(layout: OfficeLayout): Set<string> {
  return new Set(layout.rooms.filter((room) => !room.locked).map((room) => room.id));
}

export function getWalls(layout: OfficeLayout, open: ReadonlySet<string> = new Set()): Rect[] {
  return layout.rooms.flatMap((room) => wallSegments(room, open.has(room.id)));
}

export function getFurnitureColliders(layout: OfficeLayout): Rect[] {
  return layout.furniture.flatMap((piece) => {
    const rect = furnitureCollider(piece);
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
// Pathfinding — a plain grid A* over half-tile cells. Layouts are free-form
// (rooms can be anywhere an admin puts them), so a fixed "shared corridor"
// waypoint heuristic doesn't generalize; this works for any layout. Every
// unlocked door is treated as passable (it opens on approach in practice,
// per `openDoorsForPosition`) — a locked room's door stays a solid wall
// segment, so no path can be found through it.
const CELL = 0.5;

function buildBlockedGrid(layout: OfficeLayout, cols: number, rows: number, extraBlockers: Rect[]): Uint8Array {
  const rects = [...getWalls(layout, unlockedRoomIds(layout)), ...getFurnitureColliders(layout), ...extraBlockers];
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

export function findPath(
  layout: OfficeLayout, fromX: number, fromY: number, toX: number, toY: number,
  extraBlockers: Rect[] = [],
): { x: number; y: number }[] {
  const cols = Math.max(1, Math.ceil(layout.mapCols / CELL));
  const rows = Math.max(1, Math.ceil(layout.mapRows / CELL));
  const blocked = buildBlockedGrid(layout, cols, rows, extraBlockers);

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

// ---------------------------------------------------------------------------
// Default layout — a small, sensible starting office (general meeting room,
// creation room, manager's office, three squads) so a workspace that hasn't
// customized anything yet still opens fully furnished. Every admin can
// reshape this completely in the editor; this is just the seed.
type DefaultRoom = { id: string; kind: RoomKind; name: string; x: number; y: number; w: number; h: number; doorSide: DoorSide };

const DEFAULT_ROOMS: DefaultRoom[] = [
  { id: "general", kind: "MEETING", name: "Sala geral", x: 1, y: 1, w: 14, h: 9, doorSide: "bottom" },
  { id: "creative", kind: "CREATIVE", name: "Criação", x: 17, y: 1, w: 14, h: 9, doorSide: "bottom" },
  { id: "manager", kind: "DIRECTOR", name: "Gerência", x: 33, y: 1, w: 14, h: 9, doorSide: "bottom" },
  { id: "squad-1", kind: "FOCUS", name: "Squad 1", x: 1, y: 19, w: 14, h: 10, doorSide: "top" },
  { id: "squad-2", kind: "FOCUS", name: "Squad 2", x: 17, y: 19, w: 14, h: 10, doorSide: "top" },
  { id: "squad-3", kind: "FOCUS", name: "Squad 3", x: 33, y: 19, w: 14, h: 10, doorSide: "top" },
];

function squadDesks(room: DefaultRoom) {
  return [
    { x: room.x + 4.1, y: room.y + 3.3 }, { x: room.x + 9.9, y: room.y + 3.3 },
    { x: room.x + 4.1, y: room.y + 7.2 }, { x: room.x + 9.9, y: room.y + 7.2 },
  ];
}

function defaultRoomFurniture(room: DefaultRoom): Omit<LayoutFurniture, "id">[] {
  if (room.kind === "MEETING") {
    const cx = room.x + room.w / 2, cy = room.y + 5.1;
    return [
      { key: "table-long", x: cx, y: cy, scale: 1.25, collides: { x: cx - 4.3, y: cy - 1.1, w: 8.6, h: 2.2 } },
      { key: "whiteboard", x: room.x + 2.1, y: room.y + 1.2, scale: 0.8 },
      { key: "bookshelf", x: room.x + room.w - 1.5, y: room.y + 1.5, scale: 0.75 },
      ...[-3.3, -1.1, 1.1, 3.3].flatMap((offset, index) => [
        { key: index % 2 ? "chair-orange" : "chair-navy", x: cx + offset, y: cy - 2.1, facing: "down" as const },
        { key: index % 2 ? "chair-navy" : "chair-orange", x: cx + offset, y: cy + 2.1, facing: "up" as const },
      ]),
    ];
  }
  if (room.kind === "CREATIVE") {
    const cx = room.x + room.w / 2;
    return [
      { key: "table-long", x: cx, y: room.y + 4.8, scale: 0.9, collides: { x: cx - 4.5, y: room.y + 3.7, w: 9, h: 2.2 } },
      { key: "table-long", x: cx, y: room.y + 7.6, scale: 0.75, collides: { x: cx - 3.5, y: room.y + 6.8, w: 7, h: 1.6 } },
      { key: "corkboard", x: room.x + 2.3, y: room.y + 1.3, scale: 0.8 },
      { key: "wall-art-orange", x: room.x + room.w - 2.2, y: room.y + 1.4, scale: 0.7 },
      { key: "sofa", x: room.x + room.w - 2.1, y: room.y + 5.8, scale: 0.65, collides: { x: room.x + room.w - 4.1, y: room.y + 4.8, w: 3.8, h: 2.1 } },
      { key: "plant-pot-a", x: room.x + 1.4, y: room.y + room.h - 1.5, scale: 0.8 },
    ];
  }
  if (room.kind === "DIRECTOR") {
    return [
      { key: "desk-cubicle-dark", x: room.x + 7, y: room.y + 4.2, scale: 1.05, collides: { x: room.x + 4.5, y: room.y + 3.1, w: 5, h: 2.4 } },
      { key: "monitor", x: room.x + 7, y: room.y + 3.5 },
      { key: "chair-orange", x: room.x + 7, y: room.y + 6.4, facing: "up" },
      { key: "sofa", x: room.x + 3, y: room.y + 7.2, scale: 0.58, collides: { x: room.x + 1.3, y: room.y + 6.1, w: 3.6, h: 2 } },
      { key: "bookshelf", x: room.x + 12.4, y: room.y + 2.1, scale: 0.75 },
      { key: "coffee-machine", x: room.x + 12.4, y: room.y + 7.4, scale: 0.85 },
      { key: "plant-tree", x: room.x + 1.4, y: room.y + 1.5, scale: 0.65 },
    ];
  }
  const desks = squadDesks(room).flatMap(({ x, y }, index) => [
    { key: index % 2 ? "desk-plain" : "desk-cubicle", x, y, collides: { x: x - 1.55, y: y - 1, w: 3.1, h: 1.7 } },
    { key: "monitor", x, y: y - 0.55 },
    { key: "chair-navy", x, y: y + 1.35, facing: "up" as const },
  ]);
  return [
    ...desks,
    { key: "divider", x: room.x + 1.4, y: room.y + 1.5, scale: 0.7 },
    { key: "watercooler", x: room.x + room.w - 1.4, y: room.y + 1.5, scale: 0.7 },
  ];
}

function buildDefaultLayout(): OfficeLayout {
  const rooms: LayoutRoom[] = DEFAULT_ROOMS.map((room) => ({ ...room, locked: false }));
  const furniture: LayoutFurniture[] = [];
  let counter = 0;
  for (const room of DEFAULT_ROOMS) {
    for (const piece of defaultRoomFurniture(room)) furniture.push({ id: `default-f${counter++}`, ...piece });
  }
  return { version: 1, mapCols: 48, mapRows: 30, rooms, furniture };
}

export const DEFAULT_OFFICE_LAYOUT: OfficeLayout = buildDefaultLayout();

export function cloneLayout(layout: OfficeLayout): OfficeLayout {
  return JSON.parse(JSON.stringify(layout)) as OfficeLayout;
}

/** Loose shape check for a `Space.mapData` JSON blob — a workspace that
 * hasn't customized anything yet has whatever was seeded at creation, not
 * this shape, so callers should fall back to `DEFAULT_OFFICE_LAYOUT`. */
export function isOfficeLayout(value: unknown): value is OfficeLayout {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfficeLayout>;
  return Array.isArray(candidate.rooms) && Array.isArray(candidate.furniture)
    && typeof candidate.mapCols === "number" && typeof candidate.mapRows === "number";
}
