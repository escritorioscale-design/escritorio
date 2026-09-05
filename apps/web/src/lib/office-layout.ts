export type Point = { x: number; y: number };
export type Obstacle = Point & { width: number; height: number };
export type AvatarDirection = "up" | "down" | "left" | "right";
export type Seat = Point & { id: string; roomId: string; direction: AvatarDirection };
export type RoomLike = { id: string; name: string; kind: string; x: number; y: number; width: number; height: number };
export type FurniturePiece = Obstacle & { shape: "desk" | "table" | "cabinet" };

/**
 * Single source of truth for room furniture. office-canvas.tsx draws these
 * exact rects and workspace-shell.tsx blocks movement using the same rects,
 * so what you see always matches what you can walk into.
 */
function deskGridFurniture(room: RoomLike): FurniturePiece[] {
  return Array.from({ length: 4 }, (_, index) => ({
    x: room.x + room.width * (.12 + (index % 2) * .48),
    y: room.y + room.height * (.34 + Math.floor(index / 2) * .34),
    width: room.width * .28,
    height: room.height * .14,
    shape: "desk" as const,
  }));
}

export function roomFurniture(room: RoomLike): FurniturePiece[] {
  if (room.kind === "MEETING") {
    return [{
      x: room.x + room.width * .215, y: room.y + room.height * .37,
      width: room.width * .57, height: room.height * .38, shape: "table",
    }];
  }
  if (room.kind === "PROXIMITY") {
    return [
      { x: room.x + room.width * .18, y: room.y + room.height * .37, width: room.width * .58, height: room.height * .23, shape: "desk" },
      { x: room.x + room.width * .77, y: room.y + room.height * .3, width: room.width * .1, height: room.height * .3, shape: "cabinet" },
    ];
  }
  // FOCUS rooms and every SOCIAL room share the same four-desk grid.
  return deskGridFurniture(room);
}

export function roomWalls(room: RoomLike, doorOpen: boolean): Obstacle[] {
  const thickness = 1.2;
  const doorWidth = 6;
  const left = room.x;
  const right = room.x + room.width;
  const top = room.y;
  const bottom = room.y + room.height;
  const horizontalY = room.y < 40 ? bottom - thickness : top;
  const firstWidth = (room.width - doorWidth) / 2;
  const horizontalWalls = doorOpen
    ? [
      { x: left, y: horizontalY, width: firstWidth, height: thickness },
      { x: left + firstWidth + doorWidth, y: horizontalY, width: firstWidth, height: thickness },
    ]
    : [{ x: left, y: horizontalY, width: room.width, height: thickness }];
  return [
    { x: left, y: top, width: thickness, height: room.height },
    { x: right - thickness, y: top, width: thickness, height: room.height },
    ...horizontalWalls,
  ];
}

/** Room-relative fractions, shared with office-canvas.tsx so chair art lines up with sittable spots. */
export const MEETING_SEAT_SPOTS: Array<[number, number, AvatarDirection]> = [
  [.18, .18, "down"], [.5, .06, "down"], [.82, .18, "down"],
  [.88, .56, "left"], [.68, .82, "up"], [.32, .82, "up"], [.12, .56, "right"],
];
export const PROXIMITY_SEAT_SPOT: [number, number, AvatarDirection] = [.5, .8, "up"];

export function roomSeats(room: RoomLike): Seat[] {
  const seats: Seat[] = [];
  const add = (id: string, x: number, y: number, direction: AvatarDirection) => seats.push({ id, roomId: room.id, x, y, direction });

  if (room.kind === "MEETING") {
    MEETING_SEAT_SPOTS.forEach(([fx, fy, direction], index) => add(`${room.id}-chair-${index + 1}`, room.x + room.width * fx, room.y + room.height * fy, direction));
    return seats;
  }

  if (room.kind === "PROXIMITY") {
    const [fx, fy, direction] = PROXIMITY_SEAT_SPOT;
    add(`${room.id}-chair-1`, room.x + room.width * fx, room.y + room.height * fy, direction);
    return seats;
  }

  deskGridFurniture(room).forEach((desk, index) => {
    add(`${room.id}-chair-${index + 1}`, desk.x + room.width * .15, desk.y + room.height * .27, "up");
  });
  return seats;
}

export function getObstacles(rooms: RoomLike[], openDoorIds: ReadonlySet<string> = new Set()): Obstacle[] {
  return rooms.flatMap((room) => [...roomWalls(room, openDoorIds.has(room.id)), ...roomFurniture(room)]);
}

export function getSeats(rooms: RoomLike[]): Seat[] {
  return rooms.flatMap(roomSeats);
}

export function doorPoint(room: RoomLike): Point {
  return { x: room.x + room.width / 2, y: room.y < 40 ? room.y + room.height : room.y };
}

/**
 * A waypoint a couple of units inside the room, clear of the door's wall
 * line. Click-to-walk aims for this once it has reached the shared corridor
 * (see corridorY below) and is stepping through a specific room's door.
 */
export function doorApproach(room: RoomLike, offset = 3): Point {
  const x = room.x + room.width / 2;
  const doorAtBottom = room.y < 40;
  const edgeY = doorAtBottom ? room.y + room.height : room.y;
  return { x, y: doorAtBottom ? edgeY - offset : edgeY + offset };
}

export function doorX(room: RoomLike): number {
  return room.x + room.width / 2;
}

/**
 * The open walkway between the two rows of rooms, derived from the actual
 * room rects rather than hardcoded. Routing cross-room walks through this
 * shared strip (exit door -> slide along the corridor -> entry door) keeps
 * the path away from every room's walls except at the door it's using,
 * instead of cutting a diagonal that can clip a neighboring room's corner.
 */
export function corridorY(rooms: RoomLike[]): number {
  const topRowBottoms = rooms.filter((room) => room.y < 40).map((room) => room.y + room.height);
  const bottomRowTops = rooms.filter((room) => room.y >= 40).map((room) => room.y);
  if (!topRowBottoms.length || !bottomRowTops.length) return 40;
  return (Math.max(...topRowBottoms) + Math.min(...bottomRowTops)) / 2;
}

export function isInsideRoom(point: Point, room: RoomLike) {
  return point.x > room.x + 1.5 && point.x < room.x + room.width - 1.5
    && point.y > room.y + 1.5 && point.y < room.y + room.height - 1.5;
}

export function openDoorsForPosition(point: Point, rooms: RoomLike[]): Set<string> {
  return new Set(rooms.filter((room) => {
    const door = doorPoint(room);
    return Math.hypot(door.x - point.x, door.y - point.y) <= 5.5 || isInsideRoom(point, room);
  }).map((room) => room.id));
}

export function inside(point: Point, obstacle: Obstacle, padding = 1.6) {
  return point.x > obstacle.x - padding && point.x < obstacle.x + obstacle.width + padding
    && point.y > obstacle.y - padding && point.y < obstacle.y + obstacle.height + padding;
}

export function clampPoint(point: Point): Point {
  return { x: Math.max(2, Math.min(98, point.x)), y: Math.max(5, Math.min(96, point.y)) };
}

export function openPosition(point: Point, obstacles: Obstacle[]) {
  return !obstacles.some((obstacle) => inside(point, obstacle));
}

export function nearestOpenPosition(point: Point, obstacles: Obstacle[]): Point {
  const clamped = clampPoint(point);
  if (openPosition(clamped, obstacles)) return clamped;
  for (let radius = 1; radius <= 12; radius += 1) {
    for (let angle = 0; angle < 360; angle += 22.5) {
      const radians = angle * Math.PI / 180;
      const candidate = clampPoint({ x: clamped.x + Math.cos(radians) * radius, y: clamped.y + Math.sin(radians) * radius });
      if (openPosition(candidate, obstacles)) return candidate;
    }
  }
  return clamped;
}

export function resolveMovement(current: Point, delta: Point, obstacles: Obstacle[]): Point {
  const direct = clampPoint({ x: current.x + delta.x, y: current.y + delta.y });
  const clearPath = (candidate: Point, pathDelta = delta) => {
    const pathSamples = Math.max(1, Math.ceil(Math.hypot(pathDelta.x, pathDelta.y) / .45));
    for (let index = 1; index <= pathSamples; index += 1) {
      const progress = index / pathSamples;
      if (!openPosition(clampPoint({ x: current.x + pathDelta.x * progress, y: current.y + pathDelta.y * progress }), obstacles)) return false;
    }
    return openPosition(candidate, obstacles);
  };
  if (clearPath(direct)) return direct;
  const horizontal = clampPoint({ x: current.x + delta.x, y: current.y });
  if (clearPath(horizontal, { x: delta.x, y: 0 })) return horizontal;
  const vertical = clampPoint({ x: current.x, y: current.y + delta.y });
  return clearPath(vertical, { x: 0, y: delta.y }) ? vertical : current;
}

export function directionFromVector(x: number, y: number, fallback: AvatarDirection): AvatarDirection {
  if (Math.abs(x) < .001 && Math.abs(y) < .001) return fallback;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
  return y > 0 ? "down" : "up";
}
