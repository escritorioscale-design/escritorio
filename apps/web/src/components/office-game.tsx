"use client";

import type * as PhaserNS from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  CORRIDOR_Y, doorApproach, doorX, getAllSeats, getFurnitureColliders, getWalls,
  openDoorsForPosition, roomAt, roomFurniture, ROOMS, TILE, MAP_COLS, MAP_ROWS,
  type AvatarDirection, type Seat,
} from "@/lib/office-map";

// Phaser touches `window` as soon as its module is evaluated, so it can never
// be a top-level import in a file that Next.js also renders on the server —
// only the type namespace is imported eagerly; the real module loads inside
// an effect, browser-only, and the scene class is built from it there.
type PhaserModule = typeof PhaserNS;

const WORLD_W = MAP_COLS * TILE;
const WORLD_H = MAP_ROWS * TILE;
const SPEED = TILE * 4.6;
const ARRIVE = TILE * 0.35;

export type LocalMoveState = { xPercent: number; yPercent: number; direction: AvatarDirection; moving: boolean; sitting: boolean; seatId: string | null };
export type OfficeTheme = "day" | "neon" | "studio";

const THEME_FLOOR: Record<OfficeTheme, string> = { day: "floor-wood", neon: "floor-carpet-purple", studio: "floor-tile-blue" };
const THEME_BG: Record<OfficeTheme, number> = { day: 0xe8e0cf, neon: 0x241f37, studio: 0xe0d6cc };
const THEME_WALL: Record<OfficeTheme, number> = { day: 0x8a7a63, neon: 0xa98dea, studio: 0x8a7078 };
const ITEM_KEYS = [
  "desk", "desk-alt", "laptop", "desk-lamp", "chair", "cabinet", "bookshelf",
  "plant-small", "plant-tree", "sofa", "world-map", "calendar", "clock", "rug", "monitor",
];
const SURFACE_KEYS = ["floor-wood", "floor-carpet-green", "floor-tile-blue", "floor-carpet-purple"];

type OfficeRegistry = {
  occupiedSeatIds: ReadonlySet<string>;
  onUpdate: (state: LocalMoveState) => void;
  theme: OfficeTheme;
  active: boolean;
};

function directionFromVector(x: number, y: number, fallback: AvatarDirection): AvatarDirection {
  if (Math.abs(x) < .01 && Math.abs(y) < .01) return fallback;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
}

function buildPath(fromX: number, fromY: number, toX: number, toY: number) {
  const currentRoom = roomAt(fromX, fromY);
  const targetRoom = roomAt(toX, toY);
  const path: { x: number; y: number }[] = [];
  if (currentRoom?.id !== targetRoom?.id) {
    // Exit the current room via its own door (if any), then always slide
    // along the open corridor to line up with the target door's x BEFORE
    // turning to enter it — aiming straight at a point that changes both x
    // and y at once can cut diagonally through a neighboring room's wall,
    // even when starting from open corridor space rather than a room.
    if (currentRoom) path.push({ x: doorX(currentRoom), y: CORRIDOR_Y });
    if (targetRoom) {
      path.push({ x: doorX(targetRoom), y: CORRIDOR_Y });
      path.push(doorApproach(targetRoom));
      if (targetRoom.kind === "FOCUS" || targetRoom.kind === "SOCIAL") path.push({ x: doorX(targetRoom), y: toY });
    }
  }
  path.push({ x: toX, y: toY });
  return path;
}

type PlayerBody = PhaserNS.GameObjects.Rectangle & { body: PhaserNS.Physics.Arcade.Body };

function createOfficeScene(Phaser: PhaserModule) {
  return class OfficeScene extends Phaser.Scene {
    player!: PlayerBody;
    wallColliders?: PhaserNS.Physics.Arcade.StaticGroup;
    wallGraphics!: PhaserNS.GameObjects.Graphics;
    doorGraphics!: PhaserNS.GameObjects.Graphics;
    keys!: Record<string, PhaserNS.Input.Keyboard.Key>;
    path: { x: number; y: number }[] = [];
    direction: AvatarDirection = "down";
    sitting = false;
    seatId: string | null = null;
    openDoorIds = new Set<string>();
    lastReported = "";
    currentTheme!: OfficeTheme;
    floorTiles: { tile: PhaserNS.GameObjects.TileSprite; kind: string }[] = [];

    constructor() { super("office"); }

    preload() {
      for (const key of ITEM_KEYS) this.load.image(key, `/tileset/items/${key}.png`);
      for (const key of SURFACE_KEYS) this.load.image(key, `/tileset/surfaces/${key}.png`);
    }

    create() {
      const registry = this.registry.get("office") as OfficeRegistry;
      this.currentTheme = registry.theme;
      this.cameras.main.setBackgroundColor(THEME_BG[registry.theme]);
      // Scale.RESIZE makes the canvas track its container's pixel size, and
      // Phaser defaults the physics world bounds to that same (shrunk) size
      // rather than the game's configured width/height — without this the
      // player collides with an invisible edge partway through the map.
      this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

      this.drawFloors(registry.theme);
      this.drawFurniture();

      this.wallGraphics = this.add.graphics().setDepth(5);
      this.doorGraphics = this.add.graphics().setDepth(6);

      const startX = 24.5 * TILE;
      const startY = 17 * TILE;
      const rect = this.add.rectangle(startX, startY, TILE * 0.55, TILE * 0.55, 0xffffff, 0) as PlayerBody;
      this.physics.add.existing(rect);
      rect.body.setCollideWorldBounds(true);
      this.player = rect;

      this.wallColliders = this.physics.add.staticGroup();
      this.buildWallColliders(new Set());
      for (const collider of getFurnitureColliders()) this.addStaticRect(collider, this.wallColliders);
      this.physics.add.collider(this.player, this.wallColliders);
      this.redrawWalls(registry.theme, new Set());

      this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as Record<string, PhaserNS.Input.Keyboard.Key>;

      this.input.on("pointerdown", (pointer: PhaserNS.Input.Pointer) => {
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.walkTo(world.x / TILE, world.y / TILE);
      });

      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      // Scale.RESIZE only changes the canvas's pixel size — it doesn't zoom
      // the camera to compensate, so without this the camera just shows a
      // 1:1 pixel window into the world (cropping whatever doesn't fit)
      // instead of the whole map shrunk to fit.
      const fitZoom = () => this.cameras.main.setZoom(this.scale.width / WORLD_W);
      fitZoom();
      this.scale.on(Phaser.Scale.Events.RESIZE, fitZoom);
    }

    addStaticRect(rect: { x: number; y: number; w: number; h: number }, group: PhaserNS.Physics.Arcade.StaticGroup) {
      const body = this.add.rectangle((rect.x + rect.w / 2) * TILE, (rect.y + rect.h / 2) * TILE, rect.w * TILE, rect.h * TILE, 0, 0);
      group.add(body);
    }

    buildWallColliders(open: ReadonlySet<string>) {
      for (const child of [...(this.wallColliders?.getChildren() ?? [])]) {
        if ((child as unknown as { isWall?: boolean }).isWall) child.destroy();
      }
      for (const rect of getWalls(open)) {
        const body = this.add.rectangle((rect.x + rect.w / 2) * TILE, (rect.y + rect.h / 2) * TILE, rect.w * TILE, rect.h * TILE, 0, 0);
        (body as unknown as { isWall?: boolean }).isWall = true;
        this.wallColliders!.add(body);
      }
    }

    floorKeyFor(room: { kind: string }, theme: OfficeTheme) {
      return room.kind === "MEETING" ? "floor-carpet-purple" : THEME_FLOOR[theme];
    }

    drawFloors(theme: OfficeTheme) {
      for (const room of ROOMS) {
        const tile = this.add.tileSprite((room.x + room.w / 2) * TILE, (room.y + room.h / 2) * TILE, room.w * TILE, room.h * TILE, this.floorKeyFor(room, theme));
        tile.setDepth(0);
        this.floorTiles.push({ tile, kind: room.kind });
      }
    }

    applyTheme(theme: OfficeTheme) {
      this.currentTheme = theme;
      this.cameras.main.setBackgroundColor(THEME_BG[theme]);
      for (const { tile, kind } of this.floorTiles) tile.setTexture(this.floorKeyFor({ kind }, theme));
      this.redrawWalls(theme, this.openDoorIds);
    }

    drawFurniture() {
      for (const room of ROOMS) {
        for (const piece of roomFurniture(room)) {
          const image = this.add.image(piece.x * TILE, piece.y * TILE, piece.key);
          if (piece.scale) image.setScale(piece.scale);
          image.setDepth(piece.y);
        }
      }
    }

    redrawWalls(theme: OfficeTheme, open: ReadonlySet<string>) {
      this.wallGraphics.clear();
      this.wallGraphics.fillStyle(THEME_WALL[theme], 1);
      for (const rect of getWalls(open)) this.wallGraphics.fillRect(rect.x * TILE, rect.y * TILE, rect.w * TILE, rect.h * TILE);

      this.doorGraphics.clear();
      for (const room of ROOMS) {
        const isOpen = open.has(room.id);
        const x = doorX(room) * TILE;
        const y = (room.y < CORRIDOR_Y ? room.y + room.h : room.y) * TILE;
        this.doorGraphics.fillStyle(isOpen ? 0x5fe0c4 : THEME_WALL[theme], 1);
        this.doorGraphics.fillRoundedRect(x - TILE * 0.5, y - 4, TILE, 8, 3);
        if (isOpen) {
          this.doorGraphics.lineStyle(2, 0x5fe0c4, 0.7);
          this.doorGraphics.strokeCircle(x, y, TILE * 0.5);
        }
      }
    }

    walkTo(x: number, y: number) {
      this.path = buildPath(this.player.x / TILE, this.player.y / TILE, x, y);
      if (this.sitting) { this.sitting = false; this.seatId = null; }
    }

    update() {
      const registry = this.registry.get("office") as OfficeRegistry;
      if (registry.theme !== this.currentTheme) this.applyTheme(registry.theme);
      const body = this.player.body;
      if (!registry.active) {
        body.setVelocity(0, 0);
        this.path = [];
        return;
      }
      const keys = this.keys;
      let vx = 0, vy = 0;
      if (keys.W?.isDown || keys.UP?.isDown) vy -= 1;
      if (keys.S?.isDown || keys.DOWN?.isDown) vy += 1;
      if (keys.A?.isDown || keys.LEFT?.isDown) vx -= 1;
      if (keys.D?.isDown || keys.RIGHT?.isDown) vx += 1;
      const keyboardActive = vx !== 0 || vy !== 0;

      if (keyboardActive) {
        this.path = [];
        if (this.sitting) { this.sitting = false; this.seatId = null; }
      } else if (this.path.length) {
        const target = this.path[0];
        const dx = target.x * TILE - this.player.x;
        const dy = target.y * TILE - this.player.y;
        if (Math.hypot(dx, dy) < ARRIVE) {
          this.path.shift();
        } else {
          vx = dx; vy = dy;
        }
      }

      const magnitude = Math.hypot(vx, vy);
      let moving = false;
      if (magnitude > 0.001) {
        body.setVelocity((vx / magnitude) * SPEED, (vy / magnitude) * SPEED);
        moving = true;
        this.direction = directionFromVector(vx, vy, this.direction);
      } else {
        body.setVelocity(0, 0);
      }

      if (!moving && !this.path.length && !this.sitting) {
        const tileX = this.player.x / TILE, tileY = this.player.y / TILE;
        const nearestSeat = getAllSeats()
          .filter((seat) => !registry.occupiedSeatIds.has(seat.id))
          .map((seat) => ({ seat, distance: Math.hypot(seat.x - tileX, seat.y - tileY) }))
          .filter(({ distance }) => distance <= 1.1)
          .sort((a, b) => a.distance - b.distance)[0]?.seat as Seat | undefined;
        if (nearestSeat) {
          this.player.setPosition(nearestSeat.x * TILE, nearestSeat.y * TILE);
          this.direction = nearestSeat.direction;
          this.sitting = true;
          this.seatId = nearestSeat.id;
        }
      }

      const tileX = this.player.x / TILE, tileY = this.player.y / TILE;
      const nextOpen = openDoorsForPosition(tileX, tileY);
      const key = [...nextOpen].sort().join(",");
      const prevKey = [...this.openDoorIds].sort().join(",");
      if (key !== prevKey) {
        this.openDoorIds = nextOpen;
        this.buildWallColliders(nextOpen);
        this.redrawWalls(registry.theme, nextOpen);
      }

      const state: LocalMoveState = {
        xPercent: (this.player.x / WORLD_W) * 100,
        yPercent: (this.player.y / WORLD_H) * 100,
        direction: this.direction,
        moving,
        sitting: this.sitting,
        seatId: this.seatId,
      };
      const reportKey = JSON.stringify(state);
      if (reportKey !== this.lastReported) {
        this.lastReported = reportKey;
        registry.onUpdate(state);
      }
    }
  };
}

export function OfficeGame({ occupiedSeatIds, onUpdate, theme, active, children }: {
  occupiedSeatIds: ReadonlySet<string>;
  onUpdate: (state: LocalMoveState) => void;
  theme: OfficeTheme;
  active: boolean;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const phaserParentRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserNS.Game | null>(null);
  const registryRef = useRef<OfficeRegistry>({ occupiedSeatIds, onUpdate, theme, active });
  const [frame, setFrame] = useState({ width: WORLD_W, height: WORLD_H });

  registryRef.current.occupiedSeatIds = occupiedSeatIds;
  registryRef.current.onUpdate = onUpdate;
  registryRef.current.theme = theme;
  registryRef.current.active = active;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const cw = container.clientWidth, ch = container.clientHeight;
      if (!cw || !ch) return;
      const scale = Math.min(cw / WORLD_W, ch / WORLD_H);
      setFrame({ width: WORLD_W * scale, height: WORLD_H * scale });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    const parent = phaserParentRef.current;
    if (!parent) return;
    import("phaser").then((Phaser) => {
      if (disposed) return;
      const OfficeScene = createOfficeScene(Phaser);
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: WORLD_W,
        height: WORLD_H,
        backgroundColor: "#e8e0cf",
        scale: { mode: Phaser.Scale.RESIZE },
        physics: { default: "arcade", arcade: { debug: false } },
        scene: OfficeScene,
      });
      game.registry.set("office", registryRef.current);
      gameRef.current = game;
    });
    return () => {
      disposed = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gameRef.current?.registry.set("office", registryRef.current);
  }, [occupiedSeatIds, onUpdate, theme, active]);

  return (
    <div ref={containerRef} className="office-game-container">
      <div className="office-game-frame" style={{ width: frame.width, height: frame.height }}>
        <div ref={phaserParentRef} className="office-game-canvas" />
        <div className="office-game-overlay">{children}</div>
      </div>
    </div>
  );
}
