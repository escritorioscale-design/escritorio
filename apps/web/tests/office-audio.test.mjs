import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OFFICE_LAYOUT as layout, getAllSeats, tableForSeat } from '../src/lib/office-layout.ts';
import { audioRoomAt, canHear, isRoomWide, volumeFor, PROXIMITY_SILENT_TILES } from '../src/lib/office-audio.ts';

// Presence speaks in percentages; the rules think in tiles. Everything below
// is written in tiles and converted once, here.
const at = (x, y) => ({ x: (x / layout.mapCols) * 100, y: (y / layout.mapRows) * 100 });
const free = {};
const room = (id) => layout.rooms.find(r => r.id === id);
const centerOf = (r) => at(r.x + r.w / 2, r.y + r.h / 2);
/** A point just inside a room's edge, on the side away from its door. */
const insideCorner = (r) => at(r.x + 1, r.y + r.h / 2);

test('a meeting room is one bubble: opposite corners still hear each other', () => {
  const meeting = room('squad-1-meeting');
  assert.ok(isRoomWide(meeting), 'the per-squad meeting room should be room-wide');
  const a = at(meeting.x + 0.6, meeting.y + 0.6);
  const b = at(meeting.x + meeting.w - 0.6, meeting.y + meeting.h - 0.6);
  const tiles = Math.hypot(meeting.w - 1.2, meeting.h - 1.2);
  assert.ok(tiles > 0, 'sanity: the room has some size');
  assert.equal(volumeFor(layout, a, b, free, free), 1);
});

test('the general meeting room carries across its full length', () => {
  const general = room('general');
  assert.ok(isRoomWide(general));
  const west = at(general.x + 0.6, general.y + general.h / 2);
  const east = at(general.x + general.w - 0.6, general.y + general.h / 2);
  assert.ok(general.w - 1.2 > PROXIMITY_SILENT_TILES, 'room must be wider than plain earshot for this to prove anything');
  assert.equal(volumeFor(layout, west, east, free, free), 1);
});

test('squad rooms are NOT room-wide: desks fall off with distance', () => {
  const squad = room('squad-1');
  assert.ok(!isRoomWide(squad), 'a squad room holds desks, so it uses the radius');
  const a = at(squad.x + 2, squad.y + 2);
  const near = at(squad.x + 3, squad.y + 2);
  const far = at(squad.x + 2 + PROXIMITY_SILENT_TILES + 1, squad.y + 2);
  assert.equal(volumeFor(layout, a, near, free, free), 1, 'a neighbouring desk is full volume');
  assert.equal(volumeFor(layout, a, far, free, free), 0, 'across the room is silent');
});

test('walls block: one inside a room, one just outside, never hear each other', () => {
  const meeting = room('squad-1-meeting');
  const inside = centerOf(meeting);
  // A hair outside the room's left wall — physically close, acoustically cut.
  const outside = at(meeting.x - 0.8, meeting.y + meeting.h / 2);
  const tiles = Math.abs((meeting.x + meeting.w / 2) - (meeting.x - 0.8));
  assert.ok(tiles < PROXIMITY_SILENT_TILES, 'sanity: they are within plain earshot');
  assert.equal(volumeFor(layout, inside, outside, free, free), 0);
});

test('two different rooms never leak into each other', () => {
  const a = centerOf(room('squad-1-meeting'));
  const b = centerOf(room('squad-2-meeting'));
  assert.equal(volumeFor(layout, a, b, free, free), 0);
});

test('a seated person speaks through the table area, not a character bubble', () => {
  const seat = getAllSeats(layout).find(candidate => candidate.id === 'squad-1-chair-1');
  const table = tableForSeat(layout, seat.id);
  const seated = { sitting: true, seatId: seat.id };
  assert.ok(table);
  assert.equal(volumeFor(layout, at(seat.x, seat.y), at(table.x, table.y), seated, free), 1);
  assert.equal(volumeFor(layout, at(seat.x, seat.y), at(table.x + table.radius + .2, table.y), seated, free), 0);
});

test('everyone seated at the same meeting table shares one conversation', () => {
  const seats = getAllSeats(layout).filter(seat => seat.id.startsWith('squad-1-meeting-chair'));
  assert.equal(seats.length, 4);
  const first = { sitting: true, seatId: seats[0].id };
  const last = { sitting: true, seatId: seats[3].id };
  assert.equal(tableForSeat(layout, seats[0].id).id, tableForSeat(layout, seats[3].id).id);
  assert.equal(volumeFor(layout, at(seats[0].x, seats[0].y), at(seats[3].x, seats[3].y), first, last), 1);
});

test('locking changes access, not the sound heard by people already inside', () => {
  const seat = getAllSeats(layout).find(candidate => candidate.id === 'squad-2-chair-1');
  const table = tableForSeat(layout, seat.id);
  const peer = at(table.x, table.y);
  const unlocked = { sitting: true, seatId: seat.id };
  const locked = { ...unlocked, lockId: 'lock-session' };
  assert.equal(volumeFor(layout, at(seat.x, seat.y), peer, unlocked, free), 1);
  assert.equal(volumeFor(layout, at(seat.x, seat.y), peer, locked, free), 1);
});

test('the open corridor still falls off smoothly with distance', () => {
  // The corridor band between the top and bottom squad rows belongs to no room.
  const a = at(layout.mapCols / 2, 21.5);
  assert.equal(audioRoomAt(layout, a), undefined, 'sanity: this point is on the open floor');
  const mid = at(layout.mapCols / 2 + 3.5, 21.5);
  assert.equal(audioRoomAt(layout, mid), undefined);
  const volume = volumeFor(layout, a, mid, free, free);
  assert.ok(volume > 0 && volume < 1, `expected partial volume at 3.5 tiles, got ${volume}`);
  assert.equal(volumeFor(layout, a, at(layout.mapCols / 2 + PROXIMITY_SILENT_TILES + 1, 21.5), free, free), 0);
});

test('canHear agrees with volumeFor everywhere it matters', () => {
  const meeting = room('general');
  const pairs = [
    [centerOf(meeting), insideCorner(meeting), free, free],
    [centerOf(meeting), at(meeting.x - 1, meeting.y - 1), free, free],
    [at(5, 21.5), at(6, 21.5), free, free],
  ];
  for (const [a, b, sa, sb] of pairs) {
    assert.equal(canHear(layout, a, b, sa, sb), volumeFor(layout, a, b, sa, sb) > 0);
  }
});

test('the director office is room-wide, squad and creative rooms are not', () => {
  assert.ok(isRoomWide(room('manager')), 'Gerência is a private, enclosed conversation');
  for (const id of ['squad-1', 'squad-2', 'squad-3', 'squad-4']) {
    const r = room(id);
    if (r) assert.ok(!isRoomWide(r), `${id} holds desks, so it must use the radius`);
  }
});
