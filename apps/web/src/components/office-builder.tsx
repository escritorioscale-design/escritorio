"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_OFFICE_LAYOUT, TILE,
  doorAtBottom, doorX, doorY, findPath,
  getAllSeats, getFurnitureColliders, getWalls, openDoorsForPosition,
  type AvatarDirection, type LayoutRoom, type OfficeLayout, type Rect,
} from "@/lib/office-layout";

// Plain CSS/DOM rendering instead of a Phaser canvas — much easier to reason
// about and debug than a canvas engine, at the cost of fancier pixel art for
// now. The underlying data/collision/pathfinding (office-layout.ts) doesn't
// change at all; only how it's drawn and moved through does.

const SPEED = 4.6; // tiles per second
const ARRIVE = 0.35; // tiles
const PLAYER_HALF = 0.28; // tiles — collision half-size

export type LocalMoveState = { xPercent: number; yPercent: number; direction: AvatarDirection; moving: boolean; sitting: boolean; seatId: string | null };
export type OfficeTheme = "day" | "neon" | "studio";

const THEME_FLOOR: Record<OfficeTheme, string> = { day: "#cbb28c", neon: "#4d3f78", studio: "#c3c7cf" };
const THEME_BG: Record<OfficeTheme, string> = { day: "#e4e2dc", neon: "#201c30", studio: "#dadde2" };
const THEME_WALL: Record<OfficeTheme, string> = { day: "#6b6f76", neon: "#a98dea", studio: "#53575e" };
const FLOOR_BY_KIND: Partial<Record<LayoutRoom["kind"], string>> = {
  MEETING: "#b9a8e0",
  DIRECTOR: "#aeb4bd",
};

function floorColorFor(kind: string, theme: OfficeTheme) {
  return FLOOR_BY_KIND[kind as LayoutRoom["kind"]] ?? THEME_FLOOR[theme];
}

function directionFromVector(x: number, y: number, fallback: AvatarDirection): AvatarDirection {
  if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) return fallback;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
}

function collidesAt(px: number, py: number, blockers: Rect[]) {
  return blockers.some((r) => px + PLAYER_HALF > r.x && px - PLAYER_HALF < r.x + r.w && py + PLAYER_HALF > r.y && py - PLAYER_HALF < r.y + r.h);
}

const KEY_MAP: Record<string, "up" | "down" | "left" | "right"> = {
  w: "up", arrowup: "up", s: "down", arrowdown: "down",
  a: "left", arrowleft: "left", d: "right", arrowright: "right",
};

export function OfficeBuilder({ layout, occupiedSeatIds, onUpdate, theme, active, children }: {
  layout?: OfficeLayout;
  occupiedSeatIds: ReadonlySet<string>;
  onUpdate: (state: LocalMoveState) => void;
  theme: OfficeTheme;
  active: boolean;
  children?: React.ReactNode;
}) {
  const resolvedLayout = layout ?? DEFAULT_OFFICE_LAYOUT;
  const worldW = resolvedLayout.mapCols * TILE, worldH = resolvedLayout.mapRows * TILE;

  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [openDoors, setOpenDoors] = useState<ReadonlySet<string>>(new Set());

  const layoutRef = useRef(resolvedLayout);
  const activeRef = useRef(active);
  const occupiedRef = useRef(occupiedSeatIds);
  const onUpdateRef = useRef(onUpdate);
  layoutRef.current = resolvedLayout;
  activeRef.current = active;
  occupiedRef.current = occupiedSeatIds;
  onUpdateRef.current = onUpdate;

  const posRef = useRef({ x: resolvedLayout.mapCols / 2, y: resolvedLayout.mapRows / 2 });
  const pathRef = useRef<{ x: number; y: number }[]>([]);
  const directionRef = useRef<AvatarDirection>("down");
  const sittingRef = useRef(false);
  const seatIdRef = useRef<string | null>(null);
  const openDoorsRef = useRef<ReadonlySet<string>>(new Set());
  const keysRef = useRef<Set<string>>(new Set());
  const lastReportRef = useRef("");

  // Shrink the map to fit entirely inside the container (never crop a room
  // off-screen) and center it — any leftover space is split evenly on
  // whichever axis doesn't match the map's aspect ratio, instead of piling
  // up in one corner.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const cw = container.clientWidth, ch = container.clientHeight;
      if (!cw || !ch) return;
      const zoom = Math.min(cw / worldW, ch / worldH);
      setFit({ zoom, offsetX: (cw - worldW * zoom) / 2, offsetY: (ch - worldH * zoom) / 2 });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [worldW, worldH]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const dir = KEY_MAP[event.key.toLowerCase()];
      if (dir) keysRef.current.add(dir);
    }
    function onKeyUp(event: KeyboardEvent) {
      const dir = KEY_MAP[event.key.toLowerCase()];
      if (dir) keysRef.current.delete(dir);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    function step(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      raf = requestAnimationFrame(step);
      if (!activeRef.current) return;
      const layoutNow = layoutRef.current;
      const keys = keysRef.current;
      let vx = 0, vy = 0;
      if (keys.has("up")) vy -= 1;
      if (keys.has("down")) vy += 1;
      if (keys.has("left")) vx -= 1;
      if (keys.has("right")) vx += 1;
      const keyboardActive = vx !== 0 || vy !== 0;

      if (keyboardActive) {
        pathRef.current = [];
        if (sittingRef.current) { sittingRef.current = false; seatIdRef.current = null; }
      } else if (pathRef.current.length) {
        const target = pathRef.current[0];
        const dx = target.x - posRef.current.x, dy = target.y - posRef.current.y;
        if (Math.hypot(dx, dy) < ARRIVE) pathRef.current.shift();
        else { vx = dx; vy = dy; }
      }

      const magnitude = Math.hypot(vx, vy);
      let moving = false;
      if (magnitude > 0.001) {
        moving = true;
        const speed = SPEED / magnitude;
        const blockers = [...getWalls(layoutNow, openDoorsRef.current), ...getFurnitureColliders(layoutNow)];
        const { x, y } = posRef.current;
        const nx = x + vx * speed * dt;
        const ny = y + vy * speed * dt;
        const nextX = collidesAt(nx, y, blockers) ? x : nx;
        const nextY = collidesAt(nextX, ny, blockers) ? y : ny;
        posRef.current = { x: nextX, y: nextY };
        directionRef.current = directionFromVector(vx, vy, directionRef.current);
      }

      if (!moving && !pathRef.current.length && !sittingRef.current) {
        const { x, y } = posRef.current;
        const nearestSeat = getAllSeats(layoutNow)
          .filter((seat) => !occupiedRef.current.has(seat.id))
          .map((seat) => ({ seat, distance: Math.hypot(seat.x - x, seat.y - y) }))
          .filter(({ distance }) => distance <= 1.1)
          .sort((a, b) => a.distance - b.distance)[0]?.seat;
        if (nearestSeat) {
          posRef.current = { x: nearestSeat.x, y: nearestSeat.y };
          directionRef.current = nearestSeat.direction;
          sittingRef.current = true;
          seatIdRef.current = nearestSeat.id;
        }
      }

      const nextOpen = openDoorsForPosition(layoutNow, posRef.current.x, posRef.current.y);
      const openKey = [...nextOpen].sort().join(",");
      if (openKey !== [...openDoorsRef.current].sort().join(",")) {
        openDoorsRef.current = nextOpen;
        setOpenDoors(nextOpen);
      }

      const state: LocalMoveState = {
        xPercent: (posRef.current.x / layoutNow.mapCols) * 100,
        yPercent: (posRef.current.y / layoutNow.mapRows) * 100,
        direction: directionRef.current,
        moving,
        sitting: sittingRef.current,
        seatId: seatIdRef.current,
      };
      const reportKey = JSON.stringify(state);
      if (reportKey !== lastReportRef.current) {
        lastReportRef.current = reportKey;
        onUpdateRef.current(state);
      }
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  function walkTo(tileX: number, tileY: number) {
    if (!activeRef.current) return;
    pathRef.current = findPath(layoutRef.current, posRef.current.x, posRef.current.y, tileX, tileY);
    if (sittingRef.current) { sittingRef.current = false; seatIdRef.current = null; }
  }

  function handlePointerUp(event: React.PointerEvent) {
    const world = worldRef.current;
    if (!world) return;
    const rect = world.getBoundingClientRect();
    const tileX = ((event.clientX - rect.left) / rect.width) * resolvedLayout.mapCols;
    const tileY = ((event.clientY - rect.top) / rect.height) * resolvedLayout.mapRows;
    walkTo(tileX, tileY);
  }

  const wallColor = THEME_WALL[theme];
  const walls = getWalls(resolvedLayout, openDoors);

  return (
    <div ref={containerRef} className="office-game-container">
      <div className="office-game-frame">
        <div
          ref={worldRef}
          className="css-office-world"
          style={{ width: worldW, height: worldH, transform: `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.zoom})`, background: THEME_BG[theme] }}
          onPointerUp={handlePointerUp}
        >
          {resolvedLayout.rooms.map((room) => (
            <div
              key={`floor-${room.id}`}
              className="css-office-floor"
              style={{ left: room.x * TILE, top: room.y * TILE, width: room.w * TILE, height: room.h * TILE, background: floorColorFor(room.kind, theme) }}
            />
          ))}
          {resolvedLayout.furniture.map((piece) => (
            <img
              key={piece.id}
              src={`/tileset/items/${piece.key}.png`}
              alt=""
              className="css-office-furniture"
              style={{
                left: piece.x * TILE, top: piece.y * TILE,
                transform: `translate(-50%,-50%) scale(${piece.scale ?? 1})`,
                zIndex: Math.round(20 + (piece.y / resolvedLayout.mapRows) * 100),
              }}
            />
          ))}
          {walls.map((rect, index) => (
            <div key={index} className="css-office-wall" style={{ left: rect.x * TILE, top: rect.y * TILE, width: rect.w * TILE, height: rect.h * TILE, background: wallColor }} />
          ))}
          {resolvedLayout.rooms.map((room) => {
            const isOpen = openDoors.has(room.id);
            const x = doorX(room) * TILE, edgeY = doorY(room) * TILE;
            const wallHalf = (0.4 / 2) * TILE;
            const centerY = doorAtBottom(room) ? edgeY - wallHalf : edgeY + wallHalf;
            const color = room.locked ? "#d45757" : isOpen ? "#5fe0c4" : wallColor;
            return (
              <div key={`door-${room.id}`} className={`css-office-door ${isOpen ? "open" : ""}`} style={{ left: x, top: centerY, background: color, borderColor: isOpen ? "#5fe0c4" : "transparent" }} />
            );
          })}
          <div className="css-office-actors">{children}</div>
        </div>
      </div>
    </div>
  );
}
