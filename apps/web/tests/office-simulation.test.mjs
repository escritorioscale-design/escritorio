import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OFFICE_LAYOUT as layout, getAllSeats, getWalls, getFurnitureColliders, roomAt, furnitureCollider, doorRect } from '../src/lib/office-layout.ts';
import { OfficeSimulation } from '../src/lib/office-simulation.ts';
import { canStand, clearSegment, navigate, moveSafely } from '../src/lib/office-navigation.ts';

const allOpen = new Set(layout.rooms.map(r => r.id));
const blockers = [...getWalls(layout, allOpen), ...getFurnitureColliders(layout)];
const tickUntilIdle = (sim, input = {}) => {
  for (let i = 0; i < 2000; i++) {
    sim.tick(1 / 30, input);
    assert.ok(canStand(sim.position, sim.blockers(input.extraBlockers), layout.mapCols, layout.mapRows), `actor intersects obstacle at ${JSON.stringify(sim.position)}`);
    if (!sim.path.length && !sim.moving && (sim.sitting || i > 30)) return;
  }
  assert.fail(`movement did not complete: ${JSON.stringify({ position: sim.position, next: sim.path[0] })}`);
};

test('four squads each have exactly four desks, four chairs and their own internal meeting', () => {
  const squads = layout.rooms.filter(r => r.kind === 'FOCUS' || r.kind === 'CREATIVE');
  assert.equal(squads.length, 4);
  for (const room of squads) {
    assert.equal(layout.furniture.filter(f => f.key.startsWith('desk') && roomAt(layout, f.x, f.y)?.id === room.id).length, 4);
    assert.equal(getAllSeats(layout).filter(s => s.roomId === room.id).length, 4);
    const meeting = layout.rooms.find(r => r.parentId === room.id);
    assert.ok(meeting && meeting.x > room.x && meeting.y > room.y && meeting.x + meeting.w < room.x + room.w && meeting.y + meeting.h < room.y + room.h);
    assert.equal(getAllSeats(layout).filter(s => s.roomId === meeting.id).length, 4);
  }
  assert.equal(getAllSeats(layout).filter(s => s.roomId === 'general').length, 12);
});

test('all 45 seats are physically free and reachable from the corridor', () => {
  const spawn = new OfficeSimulation(layout).position;
  assert.equal(getAllSeats(layout).length, 45);
  for (const seat of getAllSeats(layout)) {
    assert.ok(canStand(seat, blockers, layout.mapCols, layout.mapRows), `${seat.id} overlaps an obstacle`);
    const path = navigate(spawn, seat, blockers, layout.mapCols, layout.mapRows);
    assert.ok(path.length, `${seat.id} is unreachable`);
    let previous = spawn;
    for (const next of path) { assert.ok(clearSegment(previous, next, blockers, layout.mapCols, layout.mapRows), seat.id); previous = next; }
  }
});

test('every seat can be reached and left with real timed doors, without clipping furniture', () => {
  for (const seat of getAllSeats(layout)) {
    const sim = new OfficeSimulation(layout), spawn = { ...sim.position };
    sim.walkTo(seat); tickUntilIdle(sim);
    assert.equal(sim.seatId, seat.id);
    sim.walkTo(spawn); tickUntilIdle(sim);
    assert.equal(sim.sitting, false);
    assert.ok(Math.hypot(sim.position.x - spawn.x, sim.position.y - spawn.y) < .1);
  }
});

test('doors really close, remain open while a peer crosses, and preserve furniture blockers', () => {
  const sim = new OfficeSimulation(layout), door = doorRect(layout.rooms[0]);
  const peer = { x: door.x + door.w / 2, y: door.y };
  for (let i = 0; i < 15; i++) sim.tick(.05, { peers: [peer] });
  assert.equal(sim.doors.get(layout.rooms[0].id).open, true);
  assert.ok(sim.blockers().some(r => r.x === getFurnitureColliders(layout)[0].x));
  for (let i = 0; i < 30; i++) sim.tick(.05);
  assert.equal(sim.doors.get(layout.rooms[0].id).open, false);
});

test('locked parent/child rooms and clicks inside furniture never produce unsafe fallback paths', () => {
  const copy = structuredClone(layout); copy.rooms.find(r => r.id === 'squad-1-meeting').locked = true;
  const sim = new OfficeSimulation(copy);
  sim.walkTo(getAllSeats(copy).find(s => s.roomId === 'squad-1-meeting'));
  assert.equal(sim.path.length, 0);
  sim.walkTo(layout.furniture.find(f => f.id === 'squad-1-desk-1'));
  assert.equal(sim.path.length, 0);
  assert.deepEqual(navigate({ x: 1, y: 1 }, { x: 1.1, y: 1.1 }, [{ x: 1, y: 1, w: 1, h: 1 }], 10, 10), []);
});

test('occupied seats are not taken and releasing a seat does not instantly sit again', () => {
  const seat = getAllSeats(layout)[0], occupied = new Set([seat.id]);
  const sim = new OfficeSimulation(layout);
  sim.walkTo(seat, { occupied }); assert.equal(sim.path.length, 0);
  sim.walkTo(seat); tickUntilIdle(sim); assert.equal(sim.sitting, true);
  sim.stand(); sim.tick(.1); assert.equal(sim.sitting, false);
});

test('swept keyboard movement cannot tunnel through walls or leave the map, and paused movement stops', () => {
  assert.ok(moveSafely({ x: 2, y: 2 }, 20, 0, [{ x: 3, y: 0, w: .4, h: 8 }], 10, 10).x < 3);
  assert.ok(moveSafely({ x: 1, y: 1 }, -20, -20, [], 10, 10).x >= .28);
  const sim = new OfficeSimulation(layout), from = { ...sim.position };
  sim.tick(.1, { keys: new Set(['left']), active: false });
  assert.deepEqual(sim.position, from); assert.equal(sim.moving, false);
});

test('scaling a piece changes its physical footprint with its visual', () => {
  const piece = { id: 'test', key: 'desk-cubicle', x: 4, y: 4 };
  const normal = furnitureCollider(piece), doubled = furnitureCollider({ ...piece, scale: 2 });
  assert.equal(doubled.w, normal.w * 2); assert.equal(doubled.h, normal.h * 2);
});
