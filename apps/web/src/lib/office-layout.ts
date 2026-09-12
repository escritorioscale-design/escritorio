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

import { navigate } from "./office-navigation.ts";

export const TILE = 32;
export const WALL_THICKNESS = 0.4;
export const DOOR_WIDTH = 2.5;
/** Extra room around a table's physical footprint for conversation/movement. */
export const TABLE_SPEECH_PADDING = 1.2;
/** Occupied table areas appear as someone approaches this many extra tiles. */
export const TABLE_REVEAL_DISTANCE = 2.5;

export type DoorSide = "top" | "bottom";
export type AvatarDirection = "up" | "down" | "left" | "right";
export type Rect = { x: number; y: number; w: number; h: number };
export type RoomKind = "MEETING" | "DIRECTOR" | "FOCUS" | "CREATIVE" | "AUDITORIUM" | "CUSTOM";

export type LayoutRoom = {
  id: string;
  parentId?: string;
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
export type ConversationTable = {
  id: string;
  roomId: string;
  x: number;
  y: number;
  radius: number;
  seatIds: string[];
};

/**
 * Behaviours attached to a rectangular part of the map. Keeping effects
 * separate from the geometry lets an admin combine them (for example, a
 * quiet library area that also exposes a handbook link) without inventing a
 * new room type for every product feature.
 */
export type InteractionZoneEffect =
  | { type: "SILENT" }
  | { type: "CONVERSATION" }
  | { type: "OPEN_LINK"; url: string; label?: string };

export type InteractionZone = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  effects: InteractionZoneEffect[];
};

export type OfficeLayout = {
  version: number;
  mapCols: number;
  mapRows: number;
  rooms: LayoutRoom[];
  furniture: LayoutFurniture[];
  zones: InteractionZone[];
};

export const INTERACTION_EFFECT_LABELS: Record<InteractionZoneEffect["type"], string> = {
  SILENT: "Área silenciosa",
  CONVERSATION: "Conversa da área",
  OPEN_LINK: "Ação contextual",
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
  "table-long": { w: 6.8, h: 2.8 },
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
  const scale = piece.scale ?? 1;
  return { x: piece.x - footprint.w * scale / 2, y: piece.y - footprint.h * scale / 2, w: footprint.w * scale, h: footprint.h * scale };
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
export function doorWidth(room: LayoutRoom) { return Math.min(DOOR_WIDTH, Math.max(1, room.w - 2)); }
export function doorRect(room: LayoutRoom): Rect {
  return { x: doorX(room) - doorWidth(room) / 2, y: doorAtBottom(room) ? doorY(room) - WALL_THICKNESS : doorY(room), w: doorWidth(room), h: WALL_THICKNESS };
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

/** Desks and meeting tables each own one rounded conversation area. Chairs
 * are assigned to the closest table in the same (smallest) room, so custom
 * layouts created in the editor follow the same rule as the default layout. */
export function getConversationTables(layout: OfficeLayout): ConversationTable[] {
  const seats = getAllSeats(layout);
  const tables = layout.furniture
    .filter((piece) => piece.key.startsWith("desk") || piece.key === "table-long")
    .map((piece) => {
      const footprint = defaultFootprint(piece.key) ?? { w: 3.2, h: 1.6 };
      const scale = piece.scale ?? 1;
      return {
        id: piece.id,
        roomId: roomAt(layout, piece.x, piece.y)?.id ?? "",
        x: piece.x,
        y: piece.y,
        radius: Math.max(footprint.w * scale, footprint.h * scale) / 2 + TABLE_SPEECH_PADDING,
        seatIds: [] as string[],
      };
    });
  for (const seat of seats) {
    const table = tables
      .filter((candidate) => candidate.roomId === seat.roomId)
      .sort((a, b) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(b.x - seat.x, b.y - seat.y))[0];
    if (table) table.seatIds.push(seat.id);
  }
  return tables.filter((table) => table.seatIds.length > 0);
}

export function tableForSeat(layout: OfficeLayout, seatId?: string | null): ConversationTable | undefined {
  return seatId ? getConversationTables(layout).find((table) => table.seatIds.includes(seatId)) : undefined;
}

export function isInsideTable(table: ConversationTable, point: { x: number; y: number }, margin = 0): boolean {
  return Math.abs(table.x - point.x) < table.radius + margin && Math.abs(table.y - point.y) < table.radius + margin;
}

export function tableRect(table: ConversationTable): Rect {
  return { x: table.x - table.radius, y: table.y - table.radius, w: table.radius * 2, h: table.radius * 2 };
}

export function isInsideInteractionZone(zone: InteractionZone, x: number, y: number): boolean {
  return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
}

export function interactionZonesAt(layout: OfficeLayout, x: number, y: number): InteractionZone[] {
  return (layout.zones ?? []).filter((zone) => isInsideInteractionZone(zone, x, y));
}

export function zoneHasEffect(zone: InteractionZone, type: InteractionZoneEffect["type"]): boolean {
  return zone.effects.some((effect) => effect.type === type);
}

/** Only http(s) destinations can become clickable, including legacy map data. */
export function safeZoneLink(effect: InteractionZoneEffect): string | null {
  if (effect.type !== "OPEN_LINK") return null;
  try {
    const url = new URL(effect.url);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Doors currently visually open — proximity-based, and never true for a
 * locked room regardless of how close someone stands. */
export function openDoorsForPosition(layout: OfficeLayout, x: number, y: number): Set<string> {
  return new Set(layout.rooms.filter((room) => {
    if (room.locked) return false;
    const dx = doorX(room), dy = doorY(room);
    return Math.abs(dx - x) <= doorWidth(room) / 2 + .75 && Math.abs(dy - y) <= 2.2;
  }).map((room) => room.id));
}

/** All callers use the same collision-aware path planner as the game loop. */
export function findPath(layout: OfficeLayout, fromX: number, fromY: number, toX: number, toY: number, extraBlockers: Rect[] = []) {
  return navigate({ x: fromX, y: fromY }, { x: toX, y: toY },
    [...getWalls(layout, unlockedRoomIds(layout)), ...getFurnitureColliders(layout), ...extraBlockers],
    layout.mapCols, layout.mapRows);
}

function buildDefaultLayout(): OfficeLayout {
  const rooms: LayoutRoom[] = [];
  const furniture: LayoutFurniture[] = [];
  const add = (id: string, key: string, x: number, y: number, extra: Partial<LayoutFurniture> = {}) =>
    furniture.push({ id, key, x, y, ...extra });
  const workrooms = [
    { id: "squad-1", name: "Produto", x: 2, y: 2, bottom: false, kind: "FOCUS" as const },
    { id: "squad-2", name: "Tecnologia", x: 25, y: 2, bottom: false, kind: "FOCUS" as const },
    { id: "squad-3", name: "Comercial", x: 48, y: 2, bottom: false, kind: "FOCUS" as const },
    { id: "squad-4", name: "Criação", x: 2, y: 38, bottom: true, kind: "CREATIVE" as const },
  ];

  // Each team has a complete open workspace and a private four-person room.
  for (const workroom of workrooms) {
    const { id, name, x, y, bottom, kind } = workroom;
    rooms.push({ id, name, kind, x, y, w: 21, h: 18, doorSide: bottom ? "top" : "bottom", locked: false });
    const meeting: LayoutRoom = {
      id: `${id}-meeting`, parentId: id, name: `Sala · ${name}`, kind: "MEETING",
      x: x + 14.2, y: y + (bottom ? 7.4 : 2), w: 5.8, h: 8.2,
      doorSide: bottom ? "top" : "bottom", locked: false,
    };
    rooms.push(meeting);
    for (let desk = 0; desk < 4; desk++) {
      const dx = x + (desk % 2 ? 9.8 : 3.8), dy = y + (desk < 2 ? 5.2 : 12.3);
      add(`${id}-desk-${desk + 1}`, "desk-cubicle", dx, dy);
      add(`${id}-monitor-${desk + 1}`, "monitor", dx, dy - .2, { collides: null });
      add(`${id}-chair-${desk + 1}`, desk % 2 ? "chair-orange" : "chair-navy", dx, dy + 1.9, { facing: "up" });
      add(`${id}-papers-${desk + 1}`, "papers", dx + .9, dy + .1, { collides: null });
    }
    const mx = meeting.x + meeting.w / 2, my = meeting.y + meeting.h / 2;
    add(`${id}-meeting-table`, "table-long", mx, my, { scale: .48 });
    for (const [seat, sx, sy, facing] of [
      [1, mx - .85, my - 1.45, "down"], [2, mx + .85, my - 1.45, "down"],
      [3, mx - .85, my + 1.45, "up"], [4, mx + .85, my + 1.45, "up"],
    ] as const) add(`${id}-meeting-chair-${seat}`, "chair-orange", sx, sy, { facing });
    add(`${id}-board`, "whiteboard", x + 7.2, y + 1.25, { collides: null });
    add(`${id}-shelf`, "bookshelf", x + 1.35, y + 1.7);
    add(`${id}-plant`, "plant-tree", x + 19.4, bottom ? y + 2 : y + 16);
    add(`${id}-water`, "watercooler", x + 1.35, y + 16);
  }

  rooms.push(
    { id: "manager", kind: "DIRECTOR", name: "Diretoria", x: 71, y: 2, w: 23, h: 18, doorSide: "bottom", locked: false },
    { id: "cafe", kind: "CUSTOM", name: "Café & Lounge", x: 25, y: 38, w: 21, h: 18, doorSide: "top", locked: false },
    { id: "general", kind: "AUDITORIUM", name: "All Hands", x: 48, y: 38, w: 28, h: 18, doorSide: "top", locked: false },
    { id: "library", kind: "CUSTOM", name: "Biblioteca", x: 78, y: 38, w: 16, h: 18, doorSide: "top", locked: false },
  );

  add("manager-desk", "desk-cubicle-dark", 82.5, 9);
  add("manager-monitor", "monitor", 82.5, 8.7, { collides: null });
  add("manager-chair", "chair-orange", 82.5, 11.2, { facing: "up" });
  add("manager-sofa", "sofa", 75.5, 14.8);
  add("manager-shelf", "bookshelf", 72.5, 4);
  add("manager-plant", "plant-tree", 92, 16);
  add("manager-board", "world-map", 82, 3.4, { collides: null });

  add("general-table", "table-long", 62, 47.5, { scale: 1.8 });
  for (let i = 0; i < 6; i++) {
    add(`general-chair-n-${i}`, "chair-navy", 54.5 + i * 3, 43.9, { facing: "down" });
    add(`general-chair-s-${i}`, "chair-navy", 54.5 + i * 3, 51.1, { facing: "up" });
  }
  add("general-board", "whiteboard", 69, 39.3, { collides: null });
  add("general-plant", "plant-tree", 74.2, 53.8);
  add("general-water", "watercooler", 49.5, 53.8);

  add("cafe-counter", "desk-cubicle-dark", 35.5, 42, { scale: 1.45 });
  add("cafe-machine", "coffee-machine", 35.5, 41.5, { collides: null, scale: 1.2 });
  add("cafe-sofa-west", "sofa", 29.5, 49.5, { scale: .85 });
  add("cafe-sofa-east", "sofa", 41.5, 49.5, { scale: .85 });
  add("cafe-rug", "rug", 35.5, 50, { scale: 4, collides: null });
  add("cafe-pouf-1", "pouf", 34, 49.7, { scale: 1.1, collides: null });
  add("cafe-pouf-2", "pouf", 37, 49.7, { scale: 1.1, collides: null });
  add("cafe-plant-1", "plant-pot-a", 27, 54, { scale: 1.2, collides: null });
  add("cafe-plant-2", "plant-pot-b", 44, 54, { scale: 1.2, collides: null });

  add("library-shelf-1", "bookshelf", 80, 41);
  add("library-shelf-2", "bookshelf", 83, 41);
  add("library-shelf-3", "bookshelf", 86, 41);
  add("library-shelf-4", "bookshelf", 89, 41);
  add("library-sofa", "sofa", 86, 50, { scale: .9 });
  add("library-rug", "rug", 86, 49.8, { scale: 3.2, collides: null });
  add("library-lamp", "desk-lamp", 91.5, 53, { scale: 1.3, collides: null });
  add("library-plant", "plant-tree", 80, 53.5);

  // The open middle floor is the social heart of the campus.
  add("commons-reception", "desk-cubicle-dark", 48, 25, { scale: 1.2 });
  add("commons-laptop", "laptop", 48, 24.6, { collides: null, scale: 1.2 });
  add("commons-rug-1", "rug", 40, 29, { scale: 4, collides: null });
  add("commons-rug-2", "rug", 56, 29, { scale: 4, collides: null });
  add("commons-sofa-1", "sofa", 33, 30, { scale: .75 });
  add("commons-sofa-2", "sofa", 63, 30, { scale: .75 });
  add("commons-board", "corkboard", 48, 32.8, { collides: null, scale: 1.5 });
  for (const [id, x, y] of [["nw", 3.5, 23.5], ["sw", 3.5, 35.5], ["ne", 92.5, 23.5], ["se", 92.5, 35.5]] as const) {
    add(`hall-plant-${id}`, "plant-tree", x, y);
  }
  add("garden-sofa", "sofa", 11.5, 29, { scale: 1.2 });
  add("garden-rug", "rug", 11.5, 29, { scale: 4, collides: null });
  add("welcome-table", "table-long", 83, 28.8, { scale: .75 });
  add("welcome-pouf-1", "pouf", 80.5, 31.2, { collides: null });
  add("welcome-pouf-2", "pouf", 85.5, 31.2, { collides: null });

  const zones: InteractionZone[] = [
    { id: "focus-garden", name: "Jardim de foco", x: 2, y: 23, w: 19, h: 12, effects: [{ type: "SILENT" }] },
    { id: "central-commons", name: "Praça central", x: 24, y: 23, w: 48, h: 12, effects: [{ type: "CONVERSATION" }] },
    { id: "welcome-hub", name: "Recepção social", x: 75, y: 23, w: 19, h: 12, effects: [{ type: "CONVERSATION" }] },
    { id: "cafe-talk", name: "Conversa do café", x: 25.5, y: 38.5, w: 20, h: 17, effects: [{ type: "CONVERSATION" }] },
    { id: "library-silent", name: "Silêncio na biblioteca", x: 78.5, y: 38.5, w: 15, h: 17, effects: [{ type: "SILENT" }] },
  ];
  return { version: 4, mapCols: 96, mapRows: 58, rooms, furniture, zones };
}

export const DEFAULT_OFFICE_LAYOUT = buildDefaultLayout();
export function cloneLayout(layout: OfficeLayout): OfficeLayout { return JSON.parse(JSON.stringify(layout)) as OfficeLayout; }
export function isOfficeLayout(value: unknown): value is OfficeLayout {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfficeLayout>;
  return Array.isArray(candidate.rooms) && Array.isArray(candidate.furniture)
    && (candidate.zones === undefined || Array.isArray(candidate.zones))
    && typeof candidate.mapCols === "number" && typeof candidate.mapRows === "number";
}

/** Upgrade only the old unedited seed, never a customer's custom floorplan. */
export function resolveOfficeLayout(layout?: OfficeLayout): OfficeLayout {
  if (!layout) return DEFAULT_OFFICE_LAYOUT;
  const value = JSON.stringify([layout.mapCols, layout.mapRows,
    layout.rooms.map(r => [r.id, r.name, r.kind, r.x, r.y, r.w, r.h, r.doorSide, r.locked]),
    layout.furniture.map(f => [f.id, f.key, f.x, f.y, f.scale ?? 1, f.facing ?? null, f.collides ?? null])]);
  let fingerprint = 2166136261;
  for (const character of value) fingerprint = Math.imul(fingerprint ^ character.charCodeAt(0), 16777619);
  const oldSeed = layout.version === 1 && (fingerprint >>> 0).toString(16) === "b4adb066";
  const previousBundledSeed = layout.version <= 3 && layout.mapCols === 78 && layout.mapRows === 43
    && layout.rooms.length === 10 && layout.furniture.length === 125
    && ["squad-1", "squad-2", "squad-3", "squad-4", "manager", "general"].every((id) => layout.rooms.some((room) => room.id === id));
  if (oldSeed || previousBundledSeed) return DEFAULT_OFFICE_LAYOUT;
  // Layouts already stored before zones existed remain valid and gain an
  // empty collection without a database migration (mapData is JSON).
  return { ...layout, version: Math.max(layout.version, 4), zones: Array.isArray(layout.zones) ? layout.zones : [] };
}
