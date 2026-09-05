// Legacy tile renderer retained for rollback compatibility. The active
// workspace now uses ModernOfficePreview and the supplied reference asset.
// @ts-nocheck
"use client";

import type * as PhaserNS from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  CORRIDOR_Y, doorApproach, doorAtBottom, doorOutside, doorX, doorY, getAllSeats, getFurnitureColliders, getWalls,
  openDoorsForPosition, roomAt, roomFurniture, topLevelRoom, ROOMS, TILE, WALL_THICKNESS, MAP_COLS, MAP_ROWS,
  type AvatarDirection, type RoomKind, type Seat,
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
// The map is bigger than any screen now, so instead of shrinking the whole
// world to fit (which made everything tiny), the view starts at a modest
// zoom-in and the camera is free — the player drags it around by hand
// (wheel to zoom) rather than it auto-following the character.
const BASE_ZOOM = 1;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.6;

export type LocalMoveState = { xPercent: number; yPercent: number; direction: AvatarDirection; moving: boolean; sitting: boolean; seatId: string | null };
export type OfficeTheme = "day" | "neon" | "studio";
export type CameraViewport = { scrollX: number; scrollY: number; zoom: number };

const THEME_FLOOR: Record<OfficeTheme, string> = { day: "floor-mo-wood", neon: "floor-mo-purple", studio: "floor-mo-slate" };
const THEME_BG: Record<OfficeTheme, number> = { day: 0xe4e2dc, neon: 0x201c30, studio: 0xdadde2 };
const THEME_WALL: Record<OfficeTheme, number> = { day: 0x6b6f76, neon: 0xa98dea, studio: 0x53575e };
const ITEM_KEYS = [
  "desk-cubicle", "desk-cubicle-dark", "desk-plain", "chair-navy", "chair-orange", "chair-wood",
  "monitor", "laptop", "printer", "cabinet", "safe", "whiteboard", "whiteboard-blank",
  "watercooler", "server-rack", "sofa", "pouf", "table-long", "divider",
  "plant-small", "plant-tree", "clock",
  "wall-art-blue", "wall-art-orange", "plant-pot-a", "plant-pot-b", "corkboard",
  "papers", "backpack", "keyboard", "coffee-machine", "rug",
];
const SURFACE_KEYS = ["floor-mo-wood", "floor-mo-purple", "floor-mo-slate", "floor-mo-gray"];
// Nested meeting rooms and the director's office get a distinct floor so
// they read visually apart from the squad floor around them, regardless of
// theme.
const FLOOR_BY_KIND: Partial<Record<RoomKind, string>> = {
  MEETING: "floor-mo-purple",
  DIRECTOR: "floor-mo-gray",
};

type OfficeRegistry = {
  occupiedSeatIds: ReadonlySet<string>;
  onUpdate: (state: LocalMoveState) => void;
  onViewport: (viewport: CameraViewport) => void;
  theme: OfficeTheme;
  active: boolean;
};

function directionFromVector(x: number, y: number, fallback: AvatarDirection): AvatarDirection {
  if (Math.abs(x) < .01 && Math.abs(y) < .01) return fallback;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
}

function buildPath(fromX: number, fromY: number, toX: number, toY: number) {
  const fromRoom = roomAt(fromX, fromY);
  const toRoom = roomAt(toX, toY);
  const fromTop = fromRoom ? topLevelRoom(fromRoom) : undefined;
  const toTop = toRoom ? topLevelRoom(toRoom) : undefined;
  const path: { x: number; y: number }[] = [];

  // Leave a nested meeting room into its parent squad's open floor first.
  if (fromRoom?.parentId && fromRoom.id !== toRoom?.id) {
    path.push(doorOutside(fromRoom));
  }

  if (fromTop?.id !== toTop?.id) {
    // Exit the current top-level room via its own door (if any), then
    // always slide along the open corridor to line up with the target
    // door's x BEFORE turning to enter it — aiming straight at a point that
    // changes both x and y at once can cut diagonally through a
    // neighboring room's wall, even starting from open corridor space.
    if (fromTop) path.push({ x: doorX(fromTop), y: CORRIDOR_Y });
    if (toTop) {
      path.push({ x: doorX(toTop), y: CORRIDOR_Y });
      path.push(doorApproach(toTop));
      if (toTop.kind === "FOCUS") {
        // Squads have a clear aisle straight down the middle — go down that
        // aisle to the target's row (or just to the internal meeting room's
        // door, if that's the final destination) before turning, instead of
        // cutting diagonally across a desk.
        const aisleY = toRoom?.parentId ? doorOutside(toRoom).y : toY;
        path.push({ x: doorX(toTop), y: aisleY });
      }
    }
  }

  // Step into a nested meeting room from inside its parent squad.
  if (toRoom?.parentId && toRoom.id !== fromRoom?.id) {
    path.push(doorOutside(toRoom));
    path.push(doorApproach(toRoom));
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
    lastViewport = "";
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

      const startX = (MAP_COLS / 2) * TILE;
      const startY = CORRIDOR_Y * TILE;
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

      // A click walks the character there; a drag pans the camera instead —
      // the camera is otherwise free (it doesn't auto-follow the player), so
      // this is the only way to look at a part of the map off-screen.
      let dragOrigin: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
      let dragged = false;
      const DRAG_THRESHOLD = 6;
      this.input.on("pointerdown", (pointer: PhaserNS.Input.Pointer) => {
        dragOrigin = { x: pointer.x, y: pointer.y, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY };
        dragged = false;
      });
      this.input.on("pointermove", (pointer: PhaserNS.Input.Pointer) => {
        if (!dragOrigin || !pointer.isDown) return;
        const dx = pointer.x - dragOrigin.x, dy = pointer.y - dragOrigin.y;
        if (!dragged && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragged = true;
        if (dragged) {
          this.cameras.main.scrollX = dragOrigin.scrollX - dx / this.cameras.main.zoom;
          this.cameras.main.scrollY = dragOrigin.scrollY - dy / this.cameras.main.zoom;
        }
      });
      this.input.on("pointerup", (pointer: PhaserNS.Input.Pointer) => {
        if (!dragged) {
          const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          this.walkTo(world.x / TILE, world.y / TILE);
        }
        dragOrigin = null;
      });
      this.input.on("wheel", (_pointer: PhaserNS.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
        const next = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.0012, MIN_ZOOM, MAX_ZOOM);
        this.cameras.main.setZoom(next);
      });

      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      this.cameras.main.setZoom(BASE_ZOOM);
      this.cameras.main.centerOn(startX, startY);
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
      const accent = FLOOR_BY_KIND[room.kind as RoomKind];
      return accent ?? THEME_FLOOR[theme];
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
        const edgeY = doorY(room) * TILE;
        // The closed-door marker has to sit fully inside the wall's own
        // thickness — centering it on the wall's outer edge (instead of its
        // middle) made it stick out past the wall into the corridor as a
        // little bump.
        const wallHalf = (WALL_THICKNESS / 2) * TILE;
        const wallCenterY = doorAtBottom(room) ? edgeY - wallHalf : edgeY + wallHalf;
        const markerH = WALL_THICKNESS * TILE + 2;
        this.doorGraphics.fillStyle(isOpen ? 0x5fe0c4 : THEME_WALL[theme], 1);
        this.doorGraphics.fillRoundedRect(x - TILE * 0.5, wallCenterY - markerH / 2, TILE, markerH, 3);
        if (isOpen) {
          this.doorGraphics.lineStyle(2, 0x5fe0c4, 0.7);
          this.doorGraphics.strokeCircle(x, edgeY, TILE * 0.5);
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

      // The DOM overlay (room titles, avatars) mirrors the camera's
      // scroll/zoom with a matching CSS transform so it lines up with the
      // Phaser canvas underneath even though the camera no longer shows the
      // whole world at once.
      const camera = this.cameras.main;
      const viewportKey = `${camera.scrollX.toFixed(1)}|${camera.scrollY.toFixed(1)}|${camera.zoom.toFixed(3)}`;
      if (viewportKey !== this.lastViewport) {
        this.lastViewport = viewportKey;
        registry.onViewport({ scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: camera.zoom });
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
  const phaserParentRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserNS.Game | null>(null);
  const [viewport, setViewport] = useState<CameraViewport>({ scrollX: 0, scrollY: 0, zoom: BASE_ZOOM });
  const registryRef = useRef<OfficeRegistry>({ occupiedSeatIds, onUpdate, onViewport: setViewport, theme, active });

  registryRef.current.occupiedSeatIds = occupiedSeatIds;
  registryRef.current.onUpdate = onUpdate;
  registryRef.current.theme = theme;
  registryRef.current.active = active;

  useEffect(() => {
    // Without this the mouse wheel used to zoom the office also scrolls the
    // page underneath it.
    const el = phaserParentRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => event.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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
    <div className="office-game-container">
      <div className="office-game-frame">
        <div ref={phaserParentRef} className="office-game-canvas" />
        <div className="office-game-overlay">
          <div
            className="office-game-world"
            style={{
              width: WORLD_W,
              height: WORLD_H,
              transform: `scale(${viewport.zoom}) translate(${-viewport.scrollX}px, ${-viewport.scrollY}px)`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
