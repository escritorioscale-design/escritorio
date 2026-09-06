import { doorRect, getAllSeats, getFurnitureColliders, getWalls, openDoorsForPosition, type AvatarDirection, type OfficeLayout, type Rect, type Seat } from "./office-layout.ts";
import { clearSegment, moveSafely, navigate, nearestWalkable, type Point } from "./office-navigation.ts";

export type MovementState = { xPercent: number; yPercent: number; direction: AvatarDirection; moving: boolean; sitting: boolean; seatId: string | null };
export type WorldInput = { keys?: ReadonlySet<string>; occupied?: ReadonlySet<string>; extraBlockers?: Rect[]; peers?: Point[]; active?: boolean };
export type DoorState = { progress: number; hold: number; open: boolean };
const SPEED = 4.6;

/** Renderer-independent game state, also exercised by the navigation tests. */
export class OfficeSimulation {
  position: Point;
  direction: AvatarDirection = "down";
  moving = false;
  sitting = false;
  seatId: string | null = null;
  path: Point[] = [];
  targetSeat: string | null = null;
  hint = "Clique no chão para andar ou em uma cadeira para sentar.";
  doors = new Map<string, DoorState>();
  private staticBlockers: Rect[];
  private seats: Seat[];
  private standCooldown = 0;
  private stationary = 0;
  layout: OfficeLayout;
  constructor(layout: OfficeLayout) {
    this.layout = layout;
    // Always retain furniture when doors change state.
    this.staticBlockers = [...getWalls(layout, new Set(layout.rooms.map((room) => room.id))), ...getFurnitureColliders(layout)];
    this.seats = getAllSeats(layout);
    for (const room of layout.rooms) this.doors.set(room.id, { progress: 0, hold: 0, open: false });
    this.position = nearestWalkable({ x: layout.mapCols / 2, y: layout.mapRows / 2 }, this.blockers(), layout.mapCols, layout.mapRows) ?? { x: 1, y: 1 };
  }
  blockers(extra: Rect[] = [], pathing = false) {
    return [...this.staticBlockers, ...this.layout.rooms.filter((room) => room.locked || (!pathing && !this.doors.get(room.id)?.open)).map(doorRect), ...extra];
  }
  private clear(from: Point, to: Point, blockers: Rect[]) { return clearSegment(from, to, blockers, this.layout.mapCols, this.layout.mapRows); }
  private leaveSeat() {
    this.sitting = false; this.seatId = null; this.targetSeat = null; this.standCooldown = .8; this.stationary = 0;
  }
  stand() { this.leaveSeat(); this.path = []; this.hint = "Você levantou. Clique para ir a outro lugar."; }
  walkTo(point: Point, input: WorldInput = {}) {
    if (input.active === false) return;
    const seat = this.seats.filter((s) => Math.hypot(s.x - point.x, s.y - point.y) < .85)
      .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
    if (seat && input.occupied?.has(seat.id)) { this.hint = "Esta cadeira já está ocupada."; return; }
    const destination = seat ?? point;
    const blockers = this.blockers(input.extraBlockers, true);
    const path = navigate(this.position, destination, blockers, this.layout.mapCols, this.layout.mapRows);
    if (!path.length) { this.hint = "Sem passagem até esse ponto. Escolha o chão ou uma cadeira acessível."; this.path = []; return; }
    this.leaveSeat(); this.path = path; this.targetSeat = seat?.id ?? null;
    this.hint = seat ? "Indo até a cadeira…" : "Caminhando…";
  }
  interact(input: WorldInput = {}) {
    if (this.sitting) { this.stand(); return; }
    const seat = this.nearbySeat(input, 1.2);
    if (seat) this.walkTo(seat, input);
  }
  private nearbySeat(input: WorldInput, distance: number) {
    const blockers = this.blockers(input.extraBlockers);
    return this.seats.filter((seat) => !input.occupied?.has(seat.id)
      && Math.hypot(seat.x - this.position.x, seat.y - this.position.y) <= distance
      && this.clear(this.position, seat, blockers))
      .sort((a, b) => Math.hypot(a.x - this.position.x, a.y - this.position.y) - Math.hypot(b.x - this.position.x, b.y - this.position.y))[0];
  }
  tick(delta: number, input: WorldInput = {}) {
    const dt = Math.min(Math.max(delta, 0), .1);
    // Other participants also hold a door open while crossing it.
    const nearbyDoors = new Set([this.position, ...(input.peers ?? [])].flatMap((p) => [...openDoorsForPosition(this.layout, p.x, p.y)]));
    for (const room of this.layout.rooms) {
      const state = this.doors.get(room.id)!;
      state.hold = nearbyDoors.has(room.id) && !room.locked ? .7 : Math.max(0, state.hold - dt);
      const wantsOpen = !room.locked && state.hold > 0;
      state.progress = Math.max(0, Math.min(1, state.progress + (wantsOpen ? 1 : -1) * dt / .24));
      state.open = !room.locked && state.progress >= .85;
    }
    if (input.active === false) { this.path = []; this.targetSeat = null; this.moving = false; return; }
    this.standCooldown = Math.max(0, this.standCooldown - dt);
    if (this.seatId && input.occupied?.has(this.seatId)) this.stand();
    const keys = input.keys ?? new Set<string>();
    let vx = Number(keys.has("right")) - Number(keys.has("left")), vy = Number(keys.has("down")) - Number(keys.has("up"));
    const keyboard = vx !== 0 || vy !== 0;
    if (keyboard) { this.path = []; this.targetSeat = null; if (this.sitting) this.leaveSeat(); }
    const blockers = this.blockers(input.extraBlockers);
    const before = this.position;
    if (keyboard) {
      const length = Math.hypot(vx, vy);
      this.position = moveSafely(before, vx / length * SPEED * dt, vy / length * SPEED * dt, blockers, this.layout.mapCols, this.layout.mapRows);
    } else if (this.path.length) {
      let remaining = SPEED * dt;
      while (remaining > .0001 && this.path.length) {
        const target = this.path[0], dx = target.x - this.position.x, dy = target.y - this.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance < .015) { this.position = target; this.path.shift(); continue; }
        vx = dx; vy = dy;
        const travel = Math.min(distance, remaining);
        const next = { x: this.position.x + dx / distance * travel, y: this.position.y + dy / distance * travel };
        // Wait for the door animation to clear the physical opening.
        if (!this.clear(this.position, next, blockers)) break;
        this.position = next; remaining -= travel;
        if (travel >= distance - .001) this.path.shift();
      }
    }
    this.moving = Math.hypot(this.position.x - before.x, this.position.y - before.y) > .0001;
    if (this.moving) {
      this.direction = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      this.stationary = 0;
    } else this.stationary += dt;
    if (!this.sitting && !this.path.length && !keyboard) {
      const requested = this.targetSeat ? this.seats.find((s) => s.id === this.targetSeat) : undefined;
      const seat = requested && !input.occupied?.has(requested.id) && this.clear(this.position, requested, blockers)
        ? requested : this.standCooldown === 0 && this.stationary > .25 ? this.nearbySeat(input, .8) : undefined;
      if (seat) {
        this.position = { x: seat.x, y: seat.y }; this.sitting = true; this.seatId = seat.id; this.targetSeat = null;
        this.direction = seat.direction; this.moving = false; this.hint = "Sentado · E para levantar, ou clique para andar.";
      } else if (!this.sitting && this.stationary > .25) this.hint = "Clique no chão para andar ou em uma cadeira para sentar.";
    }
  }
  state(): MovementState {
    return { xPercent: this.position.x / this.layout.mapCols * 100, yPercent: this.position.y / this.layout.mapRows * 100,
      direction: this.direction, moving: this.moving, sitting: this.sitting, seatId: this.seatId };
  }
}
