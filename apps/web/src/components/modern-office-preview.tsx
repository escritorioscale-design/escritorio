"use client";

import type * as PhaserNS from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  MAP_COLS, MAP_ROWS, ROOMS, TILE, doorApproach, doorAtBottom, doorX, doorY,
  getAllSeats, getFurnitureColliders, getWalls, openDoorsForPosition, roomAt,
} from "@/lib/modern-office-map";

type PhaserModule = typeof PhaserNS;
const WORLD_W = MAP_COLS * TILE;
const WORLD_H = MAP_ROWS * TILE;
export type LocalMoveState = { xPercent: number; yPercent: number; direction: "up" | "down" | "left" | "right"; moving: boolean; sitting: boolean; seatId: string | null };
export type CameraViewport = { scrollX: number; scrollY: number; zoom: number };
type PreviewState = { x: number; y: number; sitting: boolean; openDoors: number };
type ModernOfficeRegistry = {
  occupiedSeatIds: ReadonlySet<string>;
  onUpdate: (state: LocalMoveState) => void;
  onViewport: (viewport: CameraViewport) => void;
  active: boolean;
};

function createPreviewScene(Phaser: PhaserModule) {
  return class ModernOfficeScene extends Phaser.Scene {
    player!: PhaserNS.GameObjects.Rectangle & { body: PhaserNS.Physics.Arcade.Body };
    walls!: PhaserNS.Physics.Arcade.StaticGroup;
    wallArt!: PhaserNS.GameObjects.Graphics;
    doorArt!: PhaserNS.GameObjects.Graphics;
    keys!: Record<string, PhaserNS.Input.Keyboard.Key>;
    path: { x: number; y: number }[] = [];
    direction: LocalMoveState["direction"] = "down";
    sitting = false;
    seatId: string | null = null;
    openDoors = new Set<string>();
    lastState = "";

    preload() {
      // The supplied image is the source of truth for the visual layout. The
      // Phaser scene adds only the interactive layer over this exact texture.
      this.load.image("reference-map", "/office/modern-office-reference.jpg");
    }

    create() {
      const registry = this.registry.get("modern-preview") as ModernOfficeRegistry;
      this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
      this.add.image(WORLD_W / 2, WORLD_H / 2, "reference-map")
        .setDisplaySize(WORLD_W, WORLD_H)
        .setDepth(0);

      // Walls are present in the reference image already. Keep the graphics
      // object for door state, but do not paint a second map over the asset.
      this.wallArt = this.add.graphics().setDepth(30).setVisible(false);
      this.doorArt = this.add.graphics().setDepth(31);
      this.walls = this.physics.add.staticGroup();
      this.rebuildWalls(new Set());
      for (const rect of getFurnitureColliders()) this.addStatic(rect);

      this.player = this.add.rectangle(8 * TILE, 5 * TILE, TILE * .55, TILE * .55, 0xd8ff63).setStrokeStyle(3, 0x202018) as typeof this.player;
      this.physics.add.existing(this.player);
      this.player.body.setCollideWorldBounds(true);
      this.physics.add.collider(this.player, this.walls);
      this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as Record<string, PhaserNS.Input.Keyboard.Key>;

      this.input.on("pointerup", (pointer: PhaserNS.Input.Pointer) => {
        if (pointer.getDistance() > 6) return;
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x = point.x / TILE, y = point.y / TILE;
        const room = roomAt(x, y);
        const currentRoom = roomAt(this.player.x / TILE, this.player.y / TILE);
        this.path = room && room.id !== currentRoom?.id ? [{ ...doorApproach(room) }, { x, y }] : [{ x, y }];
        this.sitting = false;
        this.seatId = null;
        this.player.setFillStyle(0xd8ff63);
      });

      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.fitCamera();
      this.scale.on("resize", () => this.fitCamera());
      this.events.once("destroy", () => this.scale.off("resize"));
    }

    fitCamera() {
      this.cameras.main.setZoom(Math.max(.42, Math.min(3, Math.min(this.scale.width / WORLD_W, this.scale.height / WORLD_H) * .98)));
      this.cameras.main.centerOn(this.player.x, this.player.y);
      const registry = this.registry.get("modern-preview") as ModernOfficeRegistry;
      registry.onViewport({ scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY, zoom: this.cameras.main.zoom });
    }

    addStatic(rect: { x: number; y: number; w: number; h: number }) {
      const body = this.add.rectangle((rect.x + rect.w / 2) * TILE, (rect.y + rect.h / 2) * TILE, rect.w * TILE, rect.h * TILE, 0, 0);
      this.walls.add(body);
    }

    rebuildWalls(open: ReadonlySet<string>) {
      for (const child of [...this.walls.getChildren()]) child.destroy();
      for (const rect of getWalls(open)) this.addStatic(rect);
      this.wallArt.clear();
      this.doorArt.clear();
      for (const room of ROOMS) {
        const x = doorX(room) * TILE, edgeY = doorY(room) * TILE;
        const openDoor = open.has(room.id);
        const centerY = doorAtBottom(room) ? edgeY - 7 : edgeY + 7;
        this.doorArt.fillStyle(openDoor ? 0x63e8cc : 0x303642, 1).fillRoundedRect(x - 16, centerY - 6, 32, 12, 3);
        if (openDoor) this.doorArt.lineStyle(2, 0x63e8cc, .8).strokeCircle(x, edgeY, 14);
      }
    }

    update() {
      const registry = this.registry.get("modern-preview") as ModernOfficeRegistry;
      if (!registry.active) {
        this.player.body.setVelocity(0, 0);
        this.path = [];
        return;
      }
      let vx = 0, vy = 0;
      if (this.keys.W?.isDown || this.keys.UP?.isDown) vy -= 1;
      if (this.keys.S?.isDown || this.keys.DOWN?.isDown) vy += 1;
      if (this.keys.A?.isDown || this.keys.LEFT?.isDown) vx -= 1;
      if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) vx += 1;
      if (vx || vy) {
        this.path = [];
        this.sitting = false;
        this.seatId = null;
        this.direction = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      } else if (this.path.length) {
        const target = this.path[0];
        vx = target.x * TILE - this.player.x;
        vy = target.y * TILE - this.player.y;
        if (Math.hypot(vx, vy) < TILE * .28) { this.path.shift(); vx = 0; vy = 0; }
      }
      const moving = Math.hypot(vx, vy) > .001;
      if (moving) {
        const length = Math.hypot(vx, vy);
        this.player.body.setVelocity((vx / length) * TILE * 4.4, (vy / length) * TILE * 4.4);
        this.direction = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      } else this.player.body.setVelocity(0, 0);

      if (!moving && !this.path.length && !this.sitting) {
        const nearest = getAllSeats().filter((seat) => !registry.occupiedSeatIds.has(seat.id)).map((seat) => ({ seat, distance: Math.hypot(seat.x - this.player.x / TILE, seat.y - this.player.y / TILE) })).filter(({ distance }) => distance < 1.05).sort((a, b) => a.distance - b.distance)[0];
        if (nearest) {
          this.player.setPosition(nearest.seat.x * TILE, nearest.seat.y * TILE);
          this.direction = nearest.seat.direction;
          this.sitting = true;
          this.seatId = nearest.seat.id;
          this.player.setFillStyle(0xb79cff);
        }
      }

      const doors = openDoorsForPosition(this.player.x / TILE, this.player.y / TILE);
      const key = [...doors].sort().join(",");
      if (key !== [...this.openDoors].sort().join(",")) {
        this.openDoors = doors;
        this.rebuildWalls(doors);
      }
      const state = { x: this.player.x / WORLD_W * 100, y: this.player.y / WORLD_H * 100, sitting: this.sitting, openDoors: doors.size };
      const serialized = JSON.stringify(state);
      if (serialized !== this.lastState) {
        this.lastState = serialized;
        registry.onUpdate({ xPercent: state.x, yPercent: state.y, direction: this.direction, moving, sitting: this.sitting, seatId: this.seatId });
      }
      const camera = this.cameras.main;
      registry.onViewport({ scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: camera.zoom });
    }
  };
}

export function ModernOfficePreview({ occupiedSeatIds = new Set(), onUpdate, theme = "day", active = true, children }: {
  occupiedSeatIds?: ReadonlySet<string>;
  onUpdate?: (state: LocalMoveState) => void;
  theme?: "day" | "neon" | "studio";
  active?: boolean;
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>({ x: 50, y: 50, sitting: false, openDoors: 0 });
  const [viewport, setViewport] = useState<CameraViewport>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const registryRef = useRef<ModernOfficeRegistry>({ occupiedSeatIds, onUpdate: (next) => { setState({ x: next.xPercent, y: next.yPercent, sitting: next.sitting, openDoors: 0 }); onUpdate?.(next); }, onViewport: setViewport, active });
  registryRef.current.occupiedSeatIds = occupiedSeatIds;
  registryRef.current.active = active;
  registryRef.current.onUpdate = (next) => { setState({ x: next.xPercent, y: next.yPercent, sitting: next.sitting, openDoors: 0 }); onUpdate?.(next); };
  registryRef.current.onViewport = setViewport;

  useEffect(() => {
    let disposed = false;
    let gameRef: PhaserNS.Game | null = null;
    const host = hostRef.current;
    if (!host) return;
    import("phaser").then((Phaser) => {
      if (disposed) return;
      const game = new Phaser.Game({
        type: Phaser.AUTO, parent: host, width: WORLD_W, height: WORLD_H,
        backgroundColor: "#697078", scale: { mode: Phaser.Scale.RESIZE },
        physics: { default: "arcade", arcade: { debug: false } }, scene: createPreviewScene(Phaser),
      });
      gameRef = game;
      game.registry.set("modern-preview", registryRef.current);
    });
    return () => { disposed = true; gameRef?.destroy(true); gameRef = null; };
  }, []);

  return (
    <div className="modern-preview-board">
      <div ref={hostRef} className="modern-preview-canvas" />
      <div className="modern-preview-overlay">
        <div className="modern-preview-world" style={{ width: WORLD_W, height: WORLD_H, transform: `scale(${viewport.zoom}) translate(${-viewport.scrollX}px, ${-viewport.scrollY}px)` }}>{children}</div>
      </div>
      {!onUpdate && <div className="modern-preview-hud"><span>PRÉVIA ISOLADA</span><strong>{state.sitting ? "Sentado em uma cadeira" : state.openDoors ? "Porta aberta · explore a sala" : "Clique ou use WASD para explorar"}</strong></div>}
    </div>
  );
}
