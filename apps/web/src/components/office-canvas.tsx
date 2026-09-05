"use client";

import { Application, Assets, Container, Graphics, Sprite } from "pixi.js";
import { useEffect, useRef } from "react";
import { MEETING_SEAT_SPOTS, PROXIMITY_SEAT_SPOT, roomFurniture, type FurniturePiece, type RoomLike } from "@/lib/office-layout";

type Room = RoomLike;
type Theme = "day" | "neon" | "studio";
type ThemeColors = { floor: number; grid: number; wall: number; meeting: number; social: number; focus: number; manager: number; desk: number; trim: number; screen: number; chair: number };

const DOOR_OPEN_COLOR = 0x63e8cc;

const colors: Record<Theme, ThemeColors> = {
  day: { floor: 0xc8c0ae, grid: 0x8c806c, wall: 0x746552, meeting: 0xd6c7bd, social: 0xe4c6ae, focus: 0xc8ddd3, manager: 0xd8d5bc, desk: 0xa97b54, trim: 0x665748, screen: 0x628d98, chair: 0x7164b4 },
  neon: { floor: 0x302b45, grid: 0x8473bd, wall: 0x9f83de, meeting: 0x514171, social: 0x683f66, focus: 0x345c62, manager: 0x4c584b, desk: 0x8a5b8e, trim: 0xdbc9ff, screen: 0x57d8c0, chair: 0xf06b9b },
  studio: { floor: 0xc7b8b0, grid: 0x9f7f77, wall: 0x78636a, meeting: 0xd2b9b2, social: 0xe5baa0, focus: 0xc0d4c8, manager: 0xd4cfb3, desk: 0xb37a55, trim: 0x6e5660, screen: 0x6591a2, chair: 0xd45b75 },
};

function box(g: Graphics, x: number, y: number, width: number, height: number, fill: number, stroke: number, strokeWidth = 2) {
  g.rect(x, y, width, height).fill(fill).stroke({ color: stroke, width: strokeWidth });
}

/** Converts a furniture rect from office-layout's absolute-percent space to pixels. Kept in lockstep with collision on purpose. */
function toPixels(rect: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  return { x: width * rect.x / 100, y: height * rect.y / 100, w: width * rect.width / 100, h: height * rect.height / 100 };
}

function drawFurniture(g: Graphics, piece: FurniturePiece, room: Room, width: number, height: number, c: ThemeColors) {
  const { x, y, w, h } = toPixels(piece, width, height);
  if (piece.shape === "table") {
    box(g, x, y, w, h, c.desk, c.trim, 3);
    box(g, x + w * .36, y + h * .2, w * .28, h * .3, c.screen, c.trim, 2);
    const roomPx = toPixels(room, width, height);
    for (const [fx, fy] of MEETING_SEAT_SPOTS) {
      const cx = roomPx.x + roomPx.w * fx;
      const cy = roomPx.y + roomPx.h * fy;
      g.rect(cx - Math.max(4, w * .04), cy - Math.max(3, h * .035), Math.max(8, w * .08), Math.max(6, h * .07)).fill(c.chair).stroke({ color: c.trim, width: 1 });
    }
    return;
  }
  if (piece.shape === "cabinet") {
    box(g, x, y, w, h, c.manager, c.trim, 2);
    return;
  }
  // desk
  box(g, x, y, w, h, c.desk, c.trim, 3);
  box(g, x + w * .27, y + h * .12, w * .46, h * .38, c.screen, c.trim, 2);
  g.rect(x + w * .43, y + h * .5, w * .14, h * .13).fill(c.trim);
  g.rect(x + w * .29, y + h * .78, w * .42, Math.max(3, h * .12)).fill(c.chair);
}

function drawRoom(g: Graphics, room: Room, width: number, height: number, c: ThemeColors) {
  const { x, y, w, h } = toPixels(room, width, height);
  const fill = room.kind === "MEETING" ? c.meeting : room.kind === "SOCIAL" ? c.social : room.kind === "FOCUS" ? c.focus : c.manager;

  box(g, x, y, w, h, fill, c.wall, 4);
  g.rect(x + 7, y + 7, w - 14, h - 14).stroke({ color: c.trim, width: 1, alpha: .48 });

  for (const piece of roomFurniture(room)) drawFurniture(g, piece, room, width, height, c);

  if (room.kind === "PROXIMITY") {
    const roomPx = toPixels(room, width, height);
    const [fx, fy] = PROXIMITY_SEAT_SPOT;
    g.rect(roomPx.x + roomPx.w * fx - w * .1, roomPx.y + roomPx.h * fy - h * .05, w * .2, h * .1).fill(c.chair).stroke({ color: c.trim, width: 2 });
  }
  if (room.kind === "SOCIAL") {
    box(g, x + w * .76, y + h * .1, w * .12, h * .2, c.screen, c.trim, 2);
    g.rect(x + w * .78, y + h * .14, w * .08, h * .03).fill(c.chair);
  }
}

function drawDoors(g: Graphics, rooms: Room[], width: number, height: number, theme: Theme, openDoorIds: readonly string[]) {
  const c = colors[theme];
  g.clear();
  for (const room of rooms) {
    const doorX = width * (room.x + room.width / 2) / 100;
    const doorY = height * (room.y < 40 ? room.y + room.height : room.y) / 100;
    const isOpen = openDoorIds.includes(room.id);
    const doorWidth = Math.max(16, width * .06);
    g.rect(doorX - doorWidth / 2, doorY - 2, doorWidth, 5).fill(isOpen ? DOOR_OPEN_COLOR : c.wall);
    if (isOpen) {
      g.moveTo(doorX - doorWidth / 2, doorY + 2).lineTo(doorX - doorWidth / 2, doorY + Math.min(22, height * .035)).stroke({ color: DOOR_OPEN_COLOR, width: 2, alpha: .9 });
    } else {
      g.rect(doorX - doorWidth / 2, doorY - 2, doorWidth, 5).stroke({ color: c.trim, width: 1, alpha: .9 });
    }
  }
}

function drawBase(container: Container, texture: Awaited<ReturnType<typeof Assets.load>> | null, rooms: Room[], theme: Theme, width: number, height: number) {
  container.removeChildren();
  if (texture) {
    const sprite = new Sprite(texture);
    sprite.width = width;
    sprite.height = height;
    container.addChild(sprite);
    return;
  }
  const c = colors[theme];
  const g = new Graphics();
  g.rect(0, 0, width, height).fill(c.floor);
  for (let x = 0; x < width; x += 16) g.moveTo(x, 0).lineTo(x, height).stroke({ color: c.grid, width: 1, alpha: .15 });
  for (let y = 0; y < height; y += 16) g.moveTo(0, y).lineTo(width, y).stroke({ color: c.grid, width: 1, alpha: .15 });
  g.rect(7, 7, width - 14, height - 14).stroke({ color: c.wall, width: 4, alpha: .7 });
  g.rect(width * .03, height * .384, width * .94, height * .046).fill(c.floor).stroke({ color: c.wall, width: 2, alpha: .35 });
  for (const room of rooms) drawRoom(g, room, width, height, c);
  container.addChild(g);
}

export function OfficeCanvas({ rooms, theme, openDoorIds = [] }: { rooms: Room[]; theme: Theme; openDoorIds?: string[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const openDoorIdsRef = useRef(openDoorIds);
  const doorsLayerRef = useRef<Graphics | null>(null);
  openDoorIdsRef.current = openDoorIds;
  const openDoorKey = openDoorIds.join(",");

  // Builds the office once per theme/layout change. Door state is handled by a
  // separate, much cheaper effect below so opening a door never tears down
  // and rebuilds the whole PixiJS application (that used to crash mid-init).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let initialized = false;
    let destroyed = false;
    const app = new Application();
    const baseLayer = new Container();
    const doorsLayer = new Graphics();
    let officeTexture: Awaited<ReturnType<typeof Assets.load>> | null = null;

    const destroyOnce = () => {
      if (destroyed || !initialized) return;
      destroyed = true;
      app.destroy(true);
    };

    const render = () => {
      if (!initialized || !app.renderer) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      app.renderer.resize(width, height);
      drawBase(baseLayer, officeTexture, rooms, theme, width, height);
      drawDoors(doorsLayer, rooms, width, height, theme, openDoorIdsRef.current);
    };

    app.init({ antialias: false, backgroundAlpha: 0, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) }).then(async () => {
      initialized = true;
      if (disposed) { destroyOnce(); return; }
      host.appendChild(app.canvas);
      app.stage.addChild(baseLayer);
      app.stage.addChild(doorsLayer);
      doorsLayerRef.current = doorsLayer;
      try { officeTexture = await Assets.load("/office/office-map.png"); } catch { officeTexture = null; }
      if (disposed) { destroyOnce(); return; }
      render();
      const observer = new ResizeObserver(render);
      observer.observe(host);
      (host as HTMLDivElement & { __officeObserver?: ResizeObserver }).__officeObserver = observer;
    });

    return () => {
      disposed = true;
      doorsLayerRef.current = null;
      const observer = (host as HTMLDivElement & { __officeObserver?: ResizeObserver }).__officeObserver;
      observer?.disconnect();
      destroyOnce();
    };
  }, [rooms, theme]);

  // Cheap: just redraws the doors layer in place when the open-door set changes.
  useEffect(() => {
    const host = hostRef.current;
    const doorsLayer = doorsLayerRef.current;
    if (!host || !doorsLayer) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    drawDoors(doorsLayer, rooms, width, height, theme, openDoorIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDoorKey, rooms, theme]);

  return <div ref={hostRef} className="pixel-office-canvas" aria-hidden="true" />;
}
