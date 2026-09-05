export const TILE = 32;
export const MAP_COLS = 48;
export const MAP_ROWS = 30;

export type RoomKind = "MEETING" | "CREATIVE" | "MANAGER" | "SQUAD";
export type DoorSide = "top" | "bottom";
export type ModernRoom = { id: string; kind: RoomKind; name: string; x: number; y: number; w: number; h: number; doorSide: DoorSide };
export type Rect = { x: number; y: number; w: number; h: number };
export type Seat = { id: string; roomId: string; x: number; y: number; direction: "up" | "down" | "left" | "right" };
export type FurniturePiece = { key: string; x: number; y: number; scale?: number; collides?: Rect };

export const ROOMS: ModernRoom[] = [
  { id: "general", kind: "MEETING", name: "Sala geral", x: 1, y: 1, w: 14, h: 9, doorSide: "bottom" },
  { id: "creative", kind: "CREATIVE", name: "Criação", x: 17, y: 1, w: 14, h: 9, doorSide: "bottom" },
  { id: "manager", kind: "MANAGER", name: "Gerente", x: 33, y: 1, w: 14, h: 9, doorSide: "bottom" },
  { id: "squad-1", kind: "SQUAD", name: "Squad 1", x: 1, y: 19, w: 14, h: 10, doorSide: "top" },
  { id: "squad-2", kind: "SQUAD", name: "Squad 2", x: 17, y: 19, w: 14, h: 10, doorSide: "top" },
  { id: "squad-3", kind: "SQUAD", name: "Squad 3", x: 33, y: 19, w: 14, h: 10, doorSide: "top" },
];

const WALL_THICKNESS = .42;
const DOOR_WIDTH = 2.5;

export function doorAtBottom(room: ModernRoom) { return room.doorSide === "bottom"; }
export function doorX(room: ModernRoom) { return room.x + room.w / 2; }
export function doorY(room: ModernRoom) { return doorAtBottom(room) ? room.y + room.h : room.y; }
export function doorApproach(room: ModernRoom, offset = 1.2) {
  const y = doorY(room);
  return { x: doorX(room), y: doorAtBottom(room) ? y - offset : y + offset };
}

export function wallSegments(room: ModernRoom, open: boolean): Rect[] {
  const left = room.x, right = room.x + room.w, top = room.y, bottom = room.y + room.h;
  const y = doorAtBottom(room) ? bottom - WALL_THICKNESS : top;
  const firstW = (room.w - DOOR_WIDTH) / 2;
  const horizontal = open
    ? [{ x: left, y, w: firstW, h: WALL_THICKNESS }, { x: left + firstW + DOOR_WIDTH, y, w: firstW, h: WALL_THICKNESS }]
    : [{ x: left, y, w: room.w, h: WALL_THICKNESS }];
  return [
    { x: left, y: top, w: WALL_THICKNESS, h: room.h },
    { x: right - WALL_THICKNESS, y: top, w: WALL_THICKNESS, h: room.h },
    ...horizontal,
  ];
}

export function getWalls(open: ReadonlySet<string> = new Set()): Rect[] {
  const border: Rect[] = [
    { x: 0, y: 0, w: MAP_COLS, h: .45 },
    { x: 0, y: MAP_ROWS - .45, w: MAP_COLS, h: .45 },
    { x: 0, y: 0, w: .45, h: MAP_ROWS },
    { x: MAP_COLS - .45, y: 0, w: .45, h: MAP_ROWS },
  ];
  return [...border, ...ROOMS.flatMap((room) => wallSegments(room, open.has(room.id)))];
}

function gridDesks(room: ModernRoom) {
  return [
    { x: room.x + 4.1, y: room.y + 3.3 }, { x: room.x + 9.9, y: room.y + 3.3 },
    { x: room.x + 4.1, y: room.y + 7.2 }, { x: room.x + 9.9, y: room.y + 7.2 },
  ];
}

export function roomFurniture(room: ModernRoom): FurniturePiece[] {
  if (room.kind === "MEETING") {
    const cx = room.x + room.w / 2, cy = room.y + 5.1;
    return [
      { key: "table-long", x: cx, y: cy, scale: 1.25, collides: { x: cx - 4.3, y: cy - 1.1, w: 8.6, h: 2.2 } },
      { key: "whiteboard", x: room.x + 2.1, y: room.y + 1.2, scale: .8 },
      { key: "bookshelf", x: room.x + room.w - 1.5, y: room.y + 1.5, scale: .75 },
      ...[-3.3, -1.1, 1.1, 3.3].flatMap((offset, index) => [
        { key: index % 2 ? "chair-orange" : "chair-navy", x: cx + offset, y: cy - 2.1 },
        { key: index % 2 ? "chair-navy" : "chair-orange", x: cx + offset, y: cy + 2.1 },
      ]),
    ];
  }
  if (room.kind === "CREATIVE") {
    const cx = room.x + room.w / 2;
    return [
      { key: "table-long", x: cx, y: room.y + 4.8, scale: .9, collides: { x: cx - 4.5, y: room.y + 3.7, w: 9, h: 2.2 } },
      { key: "table-long", x: cx, y: room.y + 7.6, scale: .75, collides: { x: cx - 3.5, y: room.y + 6.8, w: 7, h: 1.6 } },
      { key: "corkboard", x: room.x + 2.3, y: room.y + 1.3, scale: .8 },
      { key: "wall-art-orange", x: room.x + room.w - 2.2, y: room.y + 1.4, scale: .7 },
      { key: "sofa", x: room.x + room.w - 2.1, y: room.y + 5.8, scale: .65, collides: { x: room.x + room.w - 4.1, y: room.y + 4.8, w: 3.8, h: 2.1 } },
      { key: "plant-pot-a", x: room.x + 1.4, y: room.y + room.h - 1.5, scale: .8 },
    ];
  }
  if (room.kind === "MANAGER") {
    return [
      { key: "desk-cubicle-dark", x: room.x + 7, y: room.y + 4.2, scale: 1.05, collides: { x: room.x + 4.5, y: room.y + 3.1, w: 5, h: 2.4 } },
      { key: "monitor", x: room.x + 7, y: room.y + 3.5 },
      { key: "chair-orange", x: room.x + 7, y: room.y + 6.4 },
      { key: "sofa", x: room.x + 3, y: room.y + 7.2, scale: .58, collides: { x: room.x + 1.3, y: room.y + 6.1, w: 3.6, h: 2 } },
      { key: "bookshelf", x: room.x + 12.4, y: room.y + 2.1, scale: .75 },
      { key: "plant-tree", x: room.x + 12.5, y: room.y + 7.6, scale: .65 },
    ];
  }
  const desks: FurniturePiece[] = gridDesks(room).flatMap(({ x, y }, index) => [
    { key: index % 2 ? "desk-plain" : "desk-cubicle", x, y, collides: { x: x - 1.55, y: y - 1, w: 3.1, h: 1.7 } },
    { key: "monitor", x, y: y - .55 },
  ]);
  return desks.concat([
    { key: "divider", x: room.x + 1.4, y: room.y + 1.5, scale: .7 },
    { key: "watercooler", x: room.x + room.w - 1.4, y: room.y + 1.5, scale: .7 },
  ]);
}

export function getFurnitureColliders(): Rect[] {
  return ROOMS.flatMap((room) => roomFurniture(room).flatMap((piece) => piece.collides ? [piece.collides] : []));
}

export function roomSeats(room: ModernRoom): Seat[] {
  if (room.kind === "MEETING") {
    const cx = room.x + room.w / 2, cy = room.y + 5.1;
    return [-3.3, -1.1, 1.1, 3.3].flatMap((offset, index) => [
      { id: `${room.id}-seat-${index * 2 + 1}`, roomId: room.id, x: cx + offset, y: cy - 2.1, direction: "down" as const },
      { id: `${room.id}-seat-${index * 2 + 2}`, roomId: room.id, x: cx + offset, y: cy + 2.1, direction: "up" as const },
    ]);
  }
  if (room.kind === "CREATIVE") return [
    { id: `${room.id}-seat-1`, roomId: room.id, x: room.x + 4.5, y: room.y + 6.2, direction: "up" },
    { id: `${room.id}-seat-2`, roomId: room.id, x: room.x + 9.5, y: room.y + 6.2, direction: "up" },
    { id: `${room.id}-seat-3`, roomId: room.id, x: room.x + 5.3, y: room.y + 8.5, direction: "up" },
    { id: `${room.id}-seat-4`, roomId: room.id, x: room.x + 8.7, y: room.y + 8.5, direction: "up" },
  ];
  if (room.kind === "MANAGER") return [{ id: `${room.id}-seat-1`, roomId: room.id, x: room.x + 7, y: room.y + 6.4, direction: "up" }];
  return gridDesks(room).map(({ x, y }, index) => ({ id: `${room.id}-seat-${index + 1}`, roomId: room.id, x, y: y + 1.35, direction: "up" as const }));
}

export function getAllSeats() { return ROOMS.flatMap(roomSeats); }

export function isInsideRoom(x: number, y: number, room: ModernRoom) {
  return x > room.x + .45 && x < room.x + room.w - .45 && y > room.y + .45 && y < room.y + room.h - .45;
}

export function openDoorsForPosition(x: number, y: number): Set<string> {
  return new Set(ROOMS.filter((room) => Math.hypot(doorX(room) - x, doorY(room) - y) <= 2.7 || isInsideRoom(x, y, room)).map((room) => room.id));
}

export function roomAt(x: number, y: number) {
  return ROOMS.find((room) => isInsideRoom(x, y, room));
}
