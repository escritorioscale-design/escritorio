/** Collision geometry for the supplied 512px Modern Office reference. */
export const TILE = 32;
export const MAP_COLS = 16;
export const MAP_ROWS = 16;

export type RoomKind = "MEETING" | "CREATIVE" | "MANAGER" | "SQUAD";
export type DoorSide = "top" | "bottom";
export type ModernRoom = { id: string; kind: RoomKind; name: string; x: number; y: number; w: number; h: number; doorSide: DoorSide };
export type Rect = { x: number; y: number; w: number; h: number };
export type Seat = { id: string; roomId: string; x: number; y: number; direction: "up" | "down" | "left" | "right" };
export type FurniturePiece = { key: string; x: number; y: number; scale?: number; collides?: Rect };

// Boundaries mirror the walls in 1-Foto-1.jpg. Furniture is baked into the
// reference image; the geometry below is used only for interaction/collision.
export const ROOMS: ModernRoom[] = [
  { id: "open-office", kind: "SQUAD", name: "Escritório", x: .58, y: .2, w: 14.84, h: 10.08, doorSide: "bottom" },
  { id: "creative", kind: "CREATIVE", name: "Criação", x: 3.58, y: 10.35, w: 6.7, h: 5.45, doorSide: "top" },
  { id: "manager", kind: "MANAGER", name: "Gerente", x: 10.42, y: 10.35, w: 4.98, h: 5.45, doorSide: "top" },
];

const WALL_THICKNESS = .32;
const DOOR_WIDTH = 1.05;
export function doorAtBottom(room: ModernRoom) { return room.doorSide === "bottom"; }
export function doorX(room: ModernRoom) { return room.x + room.w / 2; }
export function doorY(room: ModernRoom) { return doorAtBottom(room) ? room.y + room.h : room.y; }
export function doorApproach(room: ModernRoom, offset = .72) { const y = doorY(room); return { x: doorX(room), y: doorAtBottom(room) ? y - offset : y + offset }; }

export function wallSegments(room: ModernRoom, open: boolean): Rect[] {
  const left = room.x, right = room.x + room.w, top = room.y, bottom = room.y + room.h;
  const y = doorAtBottom(room) ? bottom - WALL_THICKNESS : top;
  const firstW = (room.w - DOOR_WIDTH) / 2;
  const horizontal = open ? [{ x: left, y, w: firstW, h: WALL_THICKNESS }, { x: left + firstW + DOOR_WIDTH, y, w: firstW, h: WALL_THICKNESS }] : [{ x: left, y, w: room.w, h: WALL_THICKNESS }];
  return [{ x: left, y: top, w: WALL_THICKNESS, h: room.h }, { x: right - WALL_THICKNESS, y: top, w: WALL_THICKNESS, h: room.h }, ...horizontal];
}

export function getWalls(open: ReadonlySet<string> = new Set()): Rect[] {
  const border: Rect[] = [{ x: 0, y: 0, w: MAP_COLS, h: .2 }, { x: 0, y: MAP_ROWS - .2, w: MAP_COLS, h: .2 }, { x: 0, y: 0, w: .2, h: MAP_ROWS }, { x: MAP_COLS - .2, y: 0, w: .2, h: MAP_ROWS }];
  return [...border, ...ROOMS.flatMap((room) => wallSegments(room, open.has(room.id)))];
}

function deskColumns(room: ModernRoom) { return [room.x + 2.55, room.x + 5.75, room.x + 8.95, room.x + 12.15]; }
function deskRows(room: ModernRoom) { return [room.y + 2.55, room.y + 6.05]; }
export function roomFurniture(room: ModernRoom): FurniturePiece[] {
  if (room.id === "open-office") return deskColumns(room).flatMap((x) => deskRows(room).map((y) => ({ key: "reference-desk", x, y, collides: { x: x - .82, y: y - .55, w: 1.64, h: 1.15 } })));
  if (room.id === "creative") return [{ key: "reference-creative-table", x: room.x + 3.05, y: room.y + 2.75, collides: { x: room.x + 1.25, y: room.y + 1.7, w: 3.6, h: 1.95 } }, { key: "reference-creative-table-2", x: room.x + 3.15, y: room.y + 4.5, collides: { x: room.x + 1.5, y: room.y + 3.8, w: 3.4, h: 1.25 } }];
  return [{ key: "reference-manager-desk", x: room.x + 2.75, y: room.y + 2.75, collides: { x: room.x + 1.05, y: room.y + 1.65, w: 3.5, h: 1.95 } }, { key: "reference-manager-sofa", x: room.x + 1.2, y: room.y + 4.45, collides: { x: room.x + .55, y: room.y + 3.75, w: 1.6, h: 1.35 } }];
}
export function getFurnitureColliders(): Rect[] { return ROOMS.flatMap((room) => roomFurniture(room).flatMap((piece) => piece.collides ? [piece.collides] : [])); }

export function roomSeats(room: ModernRoom): Seat[] {
  if (room.id === "open-office") return deskRows(room).flatMap((y, row) => deskColumns(room).map((x, column) => ({ id: `${room.id}-seat-${row * 4 + column + 1}`, roomId: room.id, x, y: y + .72, direction: "up" as const })));
  if (room.id === "creative") return [{ id: `${room.id}-seat-1`, roomId: room.id, x: room.x + 2.1, y: room.y + 3.9, direction: "up" }, { id: `${room.id}-seat-2`, roomId: room.id, x: room.x + 4.35, y: room.y + 3.9, direction: "up" }];
  return [{ id: `${room.id}-seat-1`, roomId: room.id, x: room.x + 3.05, y: room.y + 4.25, direction: "up" }];
}
export function getAllSeats() { return ROOMS.flatMap(roomSeats); }
export function isInsideRoom(x: number, y: number, room: ModernRoom) { return x > room.x + .25 && x < room.x + room.w - .25 && y > room.y + .25 && y < room.y + room.h - .25; }
export function openDoorsForPosition(x: number, y: number): Set<string> { return new Set(ROOMS.filter((room) => Math.hypot(doorX(room) - x, doorY(room) - y) <= 1.7 || isInsideRoom(x, y, room)).map((room) => room.id)); }
export function roomAt(x: number, y: number) { return ROOMS.find((room) => isInsideRoom(x, y, room)); }
