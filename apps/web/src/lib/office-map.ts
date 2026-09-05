export const TILE = 32;
export const MAP_COLS = 48;
export const MAP_ROWS = 34;
export const CORRIDOR_TOP = 15;
export const CORRIDOR_BOTTOM = 19;
export const CORRIDOR_Y = (CORRIDOR_TOP + CORRIDOR_BOTTOM) / 2;

export type RoomKind = "MEETING" | "SOCIAL" | "FOCUS" | "PROXIMITY";
export type TileRoom = { id: string; kind: RoomKind; name: string; x: number; y: number; w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type AvatarDirection = "up" | "down" | "left" | "right";
export type Seat = { id: string; roomId: string; x: number; y: number; direction: AvatarDirection };
export type FurniturePiece = { key: string; x: number; y: number; scale?: number; collides?: Rect };

export const ROOMS: TileRoom[] = [
  { id: "meeting", kind: "MEETING", name: "Sala de reunião geral", x: 2, y: 2, w: 14, h: 13 },
  { id: "social", kind: "SOCIAL", name: "Sala de criação", x: 17, y: 2, w: 14, h: 13 },
  { id: "proximity", kind: "PROXIMITY", name: "Sala do gerente", x: 32, y: 2, w: 14, h: 13 },
  { id: "squad1", kind: "FOCUS", name: "Squad 1", x: 2, y: 19, w: 14, h: 13 },
  { id: "squad2", kind: "FOCUS", name: "Squad 2", x: 17, y: 19, w: 14, h: 13 },
  { id: "squad3", kind: "FOCUS", name: "Squad 3", x: 32, y: 19, w: 14, h: 13 },
];

export function doorAtBottom(room: TileRoom) {
  return room.y < CORRIDOR_TOP;
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

const WALL_THICKNESS = 0.4;
const DOOR_WIDTH = 2.5;

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

export function roomAt(x: number, y: number): TileRoom | undefined {
  return ROOMS.find((room) => isInsideRoom(x, y, room));
}

function deskGrid(room: TileRoom) {
  const cols = [room.x + room.w * .28, room.x + room.w * .72];
  const rows = [room.y + room.h * .3, room.y + room.h * .68];
  const desks: { x: number; y: number }[] = [];
  for (const y of rows) for (const x of cols) desks.push({ x, y });
  return desks;
}

export function roomFurniture(room: TileRoom): FurniturePiece[] {
  if (room.kind === "MEETING") {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    return [
      { key: "desk", x: cx - 1.1, y: cy, scale: 1.6, collides: { x: cx - 3.3, y: cy - 0.9, w: 4.6, h: 1.8 } },
      { key: "desk", x: cx + 2.3, y: cy, scale: 1.6 },
      { key: "world-map", x: room.x + room.w - 2.2, y: room.y + 1.6 },
      { key: "calendar", x: room.x + room.w - 1, y: room.y + 1.8 },
      { key: "rug", x: cx, y: cy + 0.2, scale: 1.4 },
      { key: "plant-tree", x: room.x + 1.4, y: room.y + room.h - 1.6 },
    ];
  }
  if (room.kind === "PROXIMITY") {
    const deskX = room.x + room.w * .38;
    const deskY = room.y + room.h * .42;
    return [
      { key: "desk", x: deskX, y: deskY, collides: { x: deskX - 1, y: deskY - 0.5, w: 2, h: 1 } },
      { key: "laptop", x: deskX, y: deskY - 0.25 },
      { key: "monitor", x: deskX + 1.6, y: deskY - 0.1 },
      { key: "cabinet", x: room.x + room.w - 1.4, y: room.y + 1.7, collides: { x: room.x + room.w - 1.9, y: room.y + 1.1, w: 1, h: 1.4 } },
      { key: "bookshelf", x: room.x + room.w - 1.4, y: room.y + 3.6, collides: { x: room.x + room.w - 2, y: room.y + 2.6, w: 1.2, h: 2 } },
      { key: "plant-tree", x: room.x + 1.4, y: room.y + room.h - 1.6 },
      { key: "clock", x: room.x + room.w / 2, y: room.y + 0.6 },
    ];
  }
  const pieces: FurniturePiece[] = deskGrid(room).flatMap(({ x, y }, index) => [
    { key: "desk", x, y, collides: { x: x - 1, y: y - 0.5, w: 2, h: 1 } },
    { key: index % 2 === 0 ? "laptop" : "monitor", x, y: y - 0.25 },
    { key: "plant-small", x: x + 1.3, y: y + 0.9 },
  ]);
  pieces.push({ key: "clock", x: room.x + room.w / 2, y: room.y + 0.6 });
  if (room.kind === "SOCIAL") {
    pieces.push({ key: "sofa", x: room.x + room.w - 2.4, y: room.y + room.h - 2, collides: { x: room.x + room.w - 3.6, y: room.y + room.h - 2.8, w: 2.4, h: 1.6 } });
    pieces.push({ key: "plant-tree", x: room.x + 1.3, y: room.y + room.h - 1.6 });
  }
  return pieces;
}

const MEETING_SEATS: Array<[number, number, AvatarDirection]> = [
  [.5, .18, "down"], [.22, .35, "right"], [.78, .35, "left"],
  [.22, .65, "right"], [.78, .65, "left"], [.5, .82, "up"],
];

export function roomSeats(room: TileRoom): Seat[] {
  const seats: Seat[] = [];
  const add = (id: string, x: number, y: number, direction: AvatarDirection) => seats.push({ id, roomId: room.id, x, y, direction });

  if (room.kind === "MEETING") {
    MEETING_SEATS.forEach(([fx, fy], index) => add(`${room.id}-seat-${index + 1}`, room.x + room.w * fx, room.y + room.h * fy, index % 2 === 0 ? "down" : "up"));
    return seats;
  }
  if (room.kind === "PROXIMITY") {
    const deskX = room.x + room.w * .38;
    const deskY = room.y + room.h * .42;
    add(`${room.id}-seat-1`, deskX, deskY + 0.9, "up");
    return seats;
  }
  deskGrid(room).forEach(({ x, y }, index) => add(`${room.id}-seat-${index + 1}`, x, y + 0.95, "up"));
  return seats;
}

export function getWalls(open: ReadonlySet<string> = new Set()): Rect[] {
  return ROOMS.flatMap((room) => wallSegments(room, open.has(room.id)));
}

export function getFurnitureColliders(): Rect[] {
  return ROOMS.flatMap((room) => roomFurniture(room).flatMap((piece) => (piece.collides ? [piece.collides] : [])));
}

export function getAllSeats(): Seat[] {
  return ROOMS.flatMap(roomSeats);
}

export function openDoorsForPosition(x: number, y: number): Set<string> {
  return new Set(ROOMS.filter((room) => {
    const dx = doorX(room), dy = doorY(room);
    return Math.hypot(dx - x, dy - y) <= 3 || isInsideRoom(x, y, room);
  }).map((room) => room.id));
}
