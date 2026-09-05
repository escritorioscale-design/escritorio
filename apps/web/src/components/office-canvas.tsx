"use client";

import { Application, Assets, Graphics, Sprite } from "pixi.js";
import { useEffect, useRef } from "react";

type Room = { id: string; name: string; kind: string; x: number; y: number; width: number; height: number };
type Theme = "day" | "neon" | "studio";
type ThemeColors = { floor: number; grid: number; wall: number; meeting: number; social: number; focus: number; manager: number; desk: number; trim: number; screen: number; chair: number };

const colors: Record<Theme, ThemeColors> = {
  day: { floor: 0xc8c0ae, grid: 0x8c806c, wall: 0x746552, meeting: 0xd6c7bd, social: 0xe4c6ae, focus: 0xc8ddd3, manager: 0xd8d5bc, desk: 0xa97b54, trim: 0x665748, screen: 0x628d98, chair: 0x7164b4 },
  neon: { floor: 0x302b45, grid: 0x8473bd, wall: 0x9f83de, meeting: 0x514171, social: 0x683f66, focus: 0x345c62, manager: 0x4c584b, desk: 0x8a5b8e, trim: 0xdbc9ff, screen: 0x57d8c0, chair: 0xf06b9b },
  studio: { floor: 0xc7b8b0, grid: 0x9f7f77, wall: 0x78636a, meeting: 0xd2b9b2, social: 0xe5baa0, focus: 0xc0d4c8, manager: 0xd4cfb3, desk: 0xb37a55, trim: 0x6e5660, screen: 0x6591a2, chair: 0xd45b75 },
};

function box(g: Graphics, x: number, y: number, width: number, height: number, fill: number, stroke: number, strokeWidth = 2) {
  g.rect(x, y, width, height).fill(fill).stroke({ color: stroke, width: strokeWidth });
}

function drawDesk(g: Graphics, x: number, y: number, width: number, height: number, c: ThemeColors) {
  box(g, x, y, width, height, c.desk, c.trim, 3);
  box(g, x + width * .27, y + height * .12, width * .46, height * .38, c.screen, c.trim, 2);
  g.rect(x + width * .43, y + height * .5, width * .14, height * .13).fill(c.trim);
  g.rect(x + width * .29, y + height * .78, width * .42, Math.max(3, height * .12)).fill(c.chair);
}

function drawRoom(g: Graphics, room: Room, width: number, height: number, c: ThemeColors) {
  const x = width * room.x / 100;
  const y = height * room.y / 100;
  const w = width * room.width / 100;
  const h = height * room.height / 100;
  const fill = room.kind === "MEETING" ? c.meeting : room.kind === "SOCIAL" ? c.social : room.kind === "FOCUS" ? c.focus : c.manager;

  box(g, x, y, w, h, fill, c.wall, 4);
  g.rect(x + 7, y + 7, w - 14, h - 14).stroke({ color: c.trim, width: 1, alpha: .48 });

  if (room.kind === "MEETING") {
    const tableW = w * .57;
    const tableH = h * .38;
    const tx = x + (w - tableW) / 2;
    const ty = y + h * .37;
    box(g, tx, ty, tableW, tableH, c.desk, c.trim, 3);
    box(g, tx + tableW * .36, ty + tableH * .2, tableW * .28, tableH * .3, c.screen, c.trim, 2);
    const chairs = [[.18, .18], [.5, .06], [.82, .18], [.88, .56], [.68, .82], [.32, .82], [.12, .56]];
    for (const [cx, cy] of chairs) g.rect(x + w * cx, y + h * cy, Math.max(7, w * .075), Math.max(5, h * .065)).fill(c.chair).stroke({ color: c.trim, width: 1 });
    return;
  }

  if (room.kind === "PROXIMITY") {
    box(g, x + w * .18, y + h * .37, w * .58, h * .23, c.desk, c.trim, 3);
    box(g, x + w * .4, y + h * .41, w * .16, h * .1, c.screen, c.trim, 2);
    g.rect(x + w * .4, y + h * .75, w * .2, h * .1).fill(c.chair).stroke({ color: c.trim, width: 2 });
    box(g, x + w * .77, y + h * .3, w * .1, h * .3, c.manager, c.trim, 2);
    return;
  }

  const deskW = w * .28;
  const deskH = h * .14;
  for (let i = 0; i < 4; i += 1) {
    const dx = x + w * (.12 + (i % 2) * .48);
    const dy = y + h * (.34 + Math.floor(i / 2) * .34);
    drawDesk(g, dx, dy, deskW, deskH, c);
  }
  if (room.kind === "SOCIAL") {
    box(g, x + w * .76, y + h * .1, w * .12, h * .2, c.screen, c.trim, 2);
    g.rect(x + w * .78, y + h * .14, w * .08, h * .03).fill(c.chair);
  }
}

function drawDoors(g: Graphics, rooms: Room[], width: number, height: number, theme: Theme, openDoorIds: string[]) {
  const c = colors[theme];
  for (const room of rooms) {
    const doorX = width * (room.x + room.width / 2) / 100;
    const doorY = height * (room.y < 40 ? room.y + room.height : room.y) / 100;
    const isOpen = openDoorIds.includes(room.id);
    const doorWidth = Math.max(16, width * .06);
    g.rect(doorX - doorWidth / 2, doorY - 2, doorWidth, 5).fill(isOpen ? 0x63e8cc : c.wall);
    if (isOpen) {
      g.moveTo(doorX - doorWidth / 2, doorY + 2).lineTo(doorX - doorWidth / 2, doorY + Math.min(22, height * .035)).stroke({ color: 0x63e8cc, width: 2, alpha: .9 });
    } else {
      g.rect(doorX - doorWidth / 2, doorY - 2, doorWidth, 5).stroke({ color: c.trim, width: 1, alpha: .9 });
    }
  }
}

export function OfficeCanvas({ rooms, theme, openDoorIds = [] }: { rooms: Room[]; theme: Theme; openDoorIds?: string[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const openDoorKey = openDoorIds.join(",");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    let officeTexture: Awaited<ReturnType<typeof Assets.load>> | null = null;

    const render = () => {
      if (disposed || !app.renderer) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      app.renderer.resize(width, height);
      app.stage.removeChildren();
      if (officeTexture) {
        const sprite = new Sprite(officeTexture);
        sprite.width = width;
        sprite.height = height;
        app.stage.addChild(sprite);
        const doors = new Graphics();
        drawDoors(doors, rooms, width, height, theme, openDoorIds);
        app.stage.addChild(doors);
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
      app.stage.addChild(g);
      const doors = new Graphics();
      drawDoors(doors, rooms, width, height, theme, openDoorIds);
      app.stage.addChild(doors);
    };

    void app.init({ antialias: false, backgroundAlpha: 0, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) }).then(async () => {
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);
      try { officeTexture = await Assets.load("/office/office-map.png"); } catch { officeTexture = null; }
      render();
      const observer = new ResizeObserver(render);
      observer.observe(host);
      (host as HTMLDivElement & { __officeObserver?: ResizeObserver }).__officeObserver = observer;
    });

    return () => {
      disposed = true;
      const observer = (host as HTMLDivElement & { __officeObserver?: ResizeObserver }).__officeObserver;
      observer?.disconnect();
      app.destroy(true);
    };
  }, [openDoorKey, rooms, theme]);

  return <div ref={hostRef} className="pixel-office-canvas" aria-hidden="true" />;
}
