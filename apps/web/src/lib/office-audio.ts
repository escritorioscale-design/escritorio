// Who can hear whom, as plain data — no React, no LiveKit — so the rules can
// be exercised directly by tests. This model was silently lost once already
// (commit 29454ae dropped the room awareness that b7c851b had added), which
// is exactly why it does not live inside the component any more.

import { roomAt, SEAT_LOCK_RADIUS, type OfficeLayout, type RoomKind } from "./office-layout.ts";

/** Inside this many tiles, remote voices play at full volume. */
export const PROXIMITY_FULL_VOLUME_TILES = 3.5;
/** Beyond this many tiles, remote voices are inaudible. */
export const PROXIMITY_SILENT_TILES = 9;

/** Map coordinates as percentages, the way presence sends them. */
export type Point = { x: number; y: number };
export type SeatState = { sitting?: boolean; seatLocked?: boolean };

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

/** Three rules, in order of precedence:
 *
 * 1. A locked desk wins over everything. It is the one gesture that means
 *    "just us", so it holds even on a meeting-room chair — full volume just
 *    inside the bubble, silent just past it, and a stranger in the doorway
 *    (already kept out physically by the same lock, see office-builder.tsx)
 *    can't listen in either.
 * 2. Walls block. Two people in different rooms — or one in, one out — never
 *    hear each other, however close they stand across the wall.
 * 3. Inside a room-wide room, everyone hears everyone. Anywhere else (at a
 *    desk in a squad room, or out in the corridor) it is distance falloff.
 */
export function volumeFor(
  layout: OfficeLayout,
  selfPos: Point, peerPos: Point,
  selfSeat: SeatState, peerSeat: SeatState,
): number {
  const self = toTiles(layout, selfPos), peer = toTiles(layout, peerPos);
  const distance = Math.hypot(self.x - peer.x, self.y - peer.y);
  const anyLocked = (selfSeat.sitting && selfSeat.seatLocked) || (peerSeat.sitting && peerSeat.seatLocked);
  if (anyLocked) return distance <= SEAT_LOCK_RADIUS ? 1 : 0;
  const selfRoom = roomAt(layout, self.x, self.y);
  const peerRoom = roomAt(layout, peer.x, peer.y);
  if (selfRoom?.id !== peerRoom?.id) return 0;
  if (isRoomWide(selfRoom)) return 1;
  return volumeForDistance(distance);
}

export function canHear(
  layout: OfficeLayout,
  selfPos: Point, peerPos: Point,
  selfSeat: SeatState, peerSeat: SeatState,
): boolean {
  return volumeFor(layout, selfPos, peerPos, selfSeat, peerSeat) > 0;
}
