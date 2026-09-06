// Who can hear whom, as plain data — no React, no LiveKit — so the rules can
// be exercised directly by tests. This model was silently lost once already
// (commit 29454ae dropped the room awareness that b7c851b had added), which
// is exactly why it does not live inside the component any more.

import { isInsideTable, roomAt, tableForSeat, type OfficeLayout, type RoomKind } from "./office-layout.ts";

/** Inside this many tiles, remote voices play at full volume. */
export const PROXIMITY_FULL_VOLUME_TILES = 2;
/** Beyond this many tiles, remote voices are inaudible. */
export const PROXIMITY_SILENT_TILES = 5;

/** Map coordinates as percentages, the way presence sends them. */
export type Point = { x: number; y: number };
export type SeatState = { sitting?: boolean; seatId?: string | null; lockId?: string | null };

function toTiles(layout: OfficeLayout, p: Point) {
  return { x: (p.x / 100) * layout.mapCols, y: (p.y / 100) * layout.mapRows };
}

/** Rooms whose whole interior is a single conversation: walking in is enough
 * to hear everyone, however far across the table they sit. Squad and creative
 * rooms are deliberately absent — those hold the desks, and a desk's reach is
 * the plain proximity radius drawn around it. */
const ROOM_WIDE_KINDS = new Set<RoomKind>(["MEETING", "DIRECTOR", "AUDITORIUM"]);

export function isRoomWide(room?: { kind: RoomKind }): boolean {
  return !!room && ROOM_WIDE_KINDS.has(room.kind);
}

/** The room a map position falls in, for audio purposes — the smallest room
 * containing it (so a meeting room wins over the squad room around it), or
 * undefined out on the open floor. */
export function audioRoomAt(layout: OfficeLayout, position: Point) {
  const tile = toTiles(layout, position);
  return roomAt(layout, tile.x, tile.y);
}

function volumeForDistance(distance: number) {
  if (distance <= PROXIMITY_FULL_VOLUME_TILES) return 1;
  if (distance >= PROXIMITY_SILENT_TILES) return 0;
  return 1 - (distance - PROXIMITY_FULL_VOLUME_TILES) / (PROXIMITY_SILENT_TILES - PROXIMITY_FULL_VOLUME_TILES);
}

/** Rules, in order of precedence:
 *
 * 1. Walls block. Two people in different rooms — or one in, one out — never
 *    hear each other, however close they stand across the wall.
 * 2. A seated person's voice belongs to that table. Everyone inside the same
 *    table area hears it; people outside and people at another table do not.
 * 3. Inside a room-wide room, people not attached to a table hear everyone.
 *    Anywhere else the smaller personal-distance falloff is used.
 */
export function volumeFor(
  layout: OfficeLayout,
  selfPos: Point, peerPos: Point,
  selfSeat: SeatState, peerSeat: SeatState,
): number {
  const self = toTiles(layout, selfPos), peer = toTiles(layout, peerPos);
  const selfRoom = roomAt(layout, self.x, self.y);
  const peerRoom = roomAt(layout, peer.x, peer.y);
  if (selfRoom?.id !== peerRoom?.id) return 0;
  const selfTable = selfSeat.sitting ? tableForSeat(layout, selfSeat.seatId) : undefined;
  const peerTable = peerSeat.sitting ? tableForSeat(layout, peerSeat.seatId) : undefined;
  if (selfTable || peerTable) {
    if (selfTable && peerTable && selfTable.id !== peerTable.id) return 0;
    const table = selfTable ?? peerTable!;
    return isInsideTable(table, self) && isInsideTable(table, peer) ? 1 : 0;
  }
  if (isRoomWide(selfRoom)) return 1;
  const distance = Math.hypot(self.x - peer.x, self.y - peer.y);
  return volumeForDistance(distance);
}

export function canHear(
  layout: OfficeLayout,
  selfPos: Point, peerPos: Point,
  selfSeat: SeatState, peerSeat: SeatState,
): boolean {
  return volumeFor(layout, selfPos, peerPos, selfSeat, peerSeat) > 0;
}
