"use client";

import type * as PhaserNS from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  MAP_COLS, MAP_ROWS, ROOMS, TILE, doorApproach, doorAtBottom, doorX, doorY,
  getAllSeats, getFurnitureColliders, getWalls, openDoorsForPosition, roomAt, roomFurniture,
  type ModernRoom,
} from "@/lib/modern-office-map";

type PhaserModule = typeof PhaserNS;
const WORLD_W = MAP_COLS * TILE;
const WORLD_H = MAP_ROWS * TILE;
type PreviewState = { x: number; y: number; sitting: boolean; openDoors: number };

const FLOOR_BY_KIND: Record<ModernRoom["kind"], string> = {
  MEETING: "floor-mo-purple", CREATIVE: "floor-mo-wood", MANAGER: "floor-mo-gray", SQUAD: "floor-mo-wood",
};

function createPreviewScene(Phaser: PhaserModule) {
  return class ModernOfficeScene extends Phaser.Scene {
    player!: PhaserNS.GameObjects.Rectangle & { body: PhaserNS.Physics.Arcade.Body };
    walls!: PhaserNS.Physics.Arcade.StaticGroup;
    wallArt!: PhaserNS.GameObjects.Graphics;
    doorArt!: PhaserNS.GameObjects.Graphics;
    keys!: Record<string, PhaserNS.Input.Keyboard.Key>;
    path: { x: number; y: number }[] = [];
    sitting = false;
    openDoors = new Set<string>();
    lastState = "";

    preload() {
      const keys = new Set(roomFurniture(ROOMS[0]).map((piece) => piece.key));
      ROOMS.forEach((room) => roomFurniture(room).forEach((piece) => keys.add(piece.key)));
      for (const key of keys) this.load.image(key, `/tileset/items/${key}.png`);
      for (const key of ["floor-mo-wood", "floor-mo-purple", "floor-mo-gray", "floor-mo-slate"]) this.load.image(key, `/tileset/surfaces/${key}.png`);
    }

    create() {
      const registry = this.registry.get("modern-preview") as { onState: (state: PreviewState) => void };
      this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
      this.add.tileSprite(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, "floor-mo-slate").setDepth(0);
      this.add.rectangle(WORLD_W / 2, 15.2 * TILE, WORLD_W - TILE * 2, TILE * 7, 0x9da1a3, .25).setDepth(1);
      for (const room of ROOMS) {
        this.add.tileSprite((room.x + room.w / 2) * TILE, (room.y + room.h / 2) * TILE, room.w * TILE, room.h * TILE, FLOOR_BY_KIND[room.kind]).setDepth(1);
        for (const piece of roomFurniture(room)) {
          const image = this.add.image(piece.x * TILE, piece.y * TILE, piece.key).setDepth(10 + piece.y);
          if (piece.scale) image.setScale(piece.scale);
        }
      }

      this.wallArt = this.add.graphics().setDepth(30);
      this.doorArt = this.add.graphics().setDepth(31);
      this.walls = this.physics.add.staticGroup();
      this.rebuildWalls(new Set());
      for (const rect of getFurnitureColliders()) this.addStatic(rect);

      this.player = this.add.rectangle(24 * TILE, 15.5 * TILE, TILE * .55, TILE * .55, 0xd8ff63).setStrokeStyle(3, 0x202018) as typeof this.player;
      this.physics.add.existing(this.player);
      this.player.body.setCollideWorldBounds(true);
      this.physics.add.collider(this.player, this.walls);
      this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as Record<string, PhaserNS.Input.Keyboard.Key>;

      this.input.on("pointerup", (pointer: PhaserNS.Input.Pointer) => {
        if (pointer.getDistance() > 6) return;
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x = point.x / TILE, y = point.y / TILE;
        const room = roomAt(x, y);
        this.path = room ? [{ ...doorApproach(room) }, { x, y }] : [{ x, y }];
        this.sitting = false;
        this.player.setFillStyle(0xd8ff63);
      });

      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.fitCamera();
      this.scale.on("resize", () => this.fitCamera());
      this.events.once("destroy", () => this.scale.off("resize"));
    }

    fitCamera() {
      this.cameras.main.setZoom(Math.max(.42, Math.min(1, Math.min(this.scale.width / WORLD_W, this.scale.height / WORLD_H) * .98)));
      this.cameras.main.centerOn(this.player.x, this.player.y);
    }

    addStatic(rect: { x: number; y: number; w: number; h: number }) {
      const body = this.add.rectangle((rect.x + rect.w / 2) * TILE, (rect.y + rect.h / 2) * TILE, rect.w * TILE, rect.h * TILE, 0, 0);
      this.walls.add(body);
    }

    rebuildWalls(open: ReadonlySet<string>) {
      for (const child of [...this.walls.getChildren()]) child.destroy();
      for (const rect of getWalls(open)) this.addStatic(rect);
      this.wallArt.clear().fillStyle(0x4d5360, 1);
      for (const rect of getWalls(open)) this.wallArt.fillRect(rect.x * TILE, rect.y * TILE, rect.w * TILE, rect.h * TILE);
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
      const registry = this.registry.get("modern-preview") as { onState: (state: PreviewState) => void };
      let vx = 0, vy = 0;
      if (this.keys.W?.isDown || this.keys.UP?.isDown) vy -= 1;
      if (this.keys.S?.isDown || this.keys.DOWN?.isDown) vy += 1;
      if (this.keys.A?.isDown || this.keys.LEFT?.isDown) vx -= 1;
      if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) vx += 1;
      if (vx || vy) {
        this.path = [];
        this.sitting = false;
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
      } else this.player.body.setVelocity(0, 0);

      if (!moving && !this.path.length && !this.sitting) {
        const nearest = getAllSeats().map((seat) => ({ seat, distance: Math.hypot(seat.x - this.player.x / TILE, seat.y - this.player.y / TILE) })).filter(({ distance }) => distance < 1.05).sort((a, b) => a.distance - b.distance)[0];
        if (nearest) {
          this.player.setPosition(nearest.seat.x * TILE, nearest.seat.y * TILE);
          this.sitting = true;
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
      if (serialized !== this.lastState) { this.lastState = serialized; registry.onState(state); }
    }
  };
}

export function ModernOfficePreview() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>({ x: 50, y: 50, sitting: false, openDoors: 0 });
  const registryRef = useRef({ onState: setState });
  registryRef.current.onState = setState;

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
      <div className="modern-preview-hud"><span>PRÉVIA ISOLADA</span><strong>{state.sitting ? "Sentado em uma cadeira" : state.openDoors ? "Porta aberta · explore a sala" : "Clique ou use WASD para explorar"}</strong></div>
    </div>
  );
}
