"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_OFFICE_LAYOUT, TILE, doorRect, getWalls, type OfficeLayout, type Rect } from "@/lib/office-layout";
import { OfficeSimulation, type MovementState, type WorldInput } from "@/lib/office-simulation";
import { OfficeFurniture } from "@/components/office-furniture";
import "./office-scene.css";

export type LocalMoveState = MovementState;
export type OfficeTheme = "day" | "neon" | "studio";
/** Presence pill shown in the scene's own toolbar. Callers that track a
 * connection (the workspace's socket) feed it here instead of stacking a
 * second floating badge on top of the board. */
export type SceneLive = { tone?: "online" | "connecting" | "offline"; label?: string };
const KEY_MAP: Record<string, string> = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
const EMPTY_SEATS = new Set<string>();

export function OfficeBuilder({ layout = DEFAULT_OFFICE_LAYOUT, occupiedSeatIds = EMPTY_SEATS, lockedZones = [], peers = [], onUpdate, theme = "day", active = true, children, showStatus = false, live }: {
  layout?: OfficeLayout;
  occupiedSeatIds?: ReadonlySet<string>;
  lockedZones?: Rect[];
  peers?: { x: number; y: number }[];
  onUpdate: (state: LocalMoveState) => void;
  theme?: OfficeTheme;
  active?: boolean;
  children?: React.ReactNode;
  showStatus?: boolean;
  live?: SceneLive;
}) {
  const simulation = useMemo(() => new OfficeSimulation(layout), [layout]);
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const doorRefs = useRef(new Map<string, HTMLDivElement>());
  const keys = useRef(new Set<string>());
  const [fit, setFit] = useState({ width: 1000, height: 600, zoom: .4 });
  const [zoomFactor, setZoomFactor] = useState(1);
  const [follow, setFollow] = useState(false);
  const [status, setStatus] = useState(simulation.hint);
  const [openCount, setOpenCount] = useState(0);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const worldW = layout.mapCols * TILE, worldH = layout.mapRows * TILE;
  const inputRef = useRef<WorldInput>({});
  inputRef.current = { active, occupied: occupiedSeatIds, extraBlockers: lockedZones,
    peers: peers.map((p) => ({ x: p.x * layout.mapCols / 100, y: p.y * layout.mapRows / 100 })), keys: keys.current };
  const reportRef = useRef(onUpdate);
  reportRef.current = onUpdate;
  const viewRef = useRef({ fit, zoomFactor, follow });
  viewRef.current = { fit, zoomFactor, follow };
  const wallSegments = useMemo(() => getWalls(layout, new Set(layout.rooms.map((room) => room.id))), [layout]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight;
      if (width && height) setFit({ width, height, zoom: Math.min((width - 32) / worldW, (height - 100) / worldH) });
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(host);
    return () => observer.disconnect();
  }, [worldW, worldH]);

  useEffect(() => {
    keys.current.clear();
    function clearKeys() { keys.current.clear(); }
    function down(event: KeyboardEvent) {
      if (!inputRef.current.active) return;
      const element = event.target as HTMLElement;
      if (element.closest?.("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const direction = KEY_MAP[event.key.toLowerCase()];
      if (direction) { event.preventDefault(); keys.current.add(direction); }
      if (event.key.toLowerCase() === "e" && !event.repeat) { event.preventDefault(); simulation.interact(inputRef.current); }
      if (event.key === "Escape") { simulation.path = []; simulation.targetSeat = null; setTarget(null); }
    }
    function up(event: KeyboardEvent) { const direction = KEY_MAP[event.key.toLowerCase()]; if (direction) keys.current.delete(direction); }
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    window.addEventListener("blur", clearKeys); document.addEventListener("visibilitychange", clearKeys);
    return () => { clearKeys(); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clearKeys); document.removeEventListener("visibilitychange", clearKeys); };
  }, [simulation]);

  useEffect(() => {
    if (!active) keys.current.clear();
  }, [active]);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastReport = "", lastHint = "", lastDoors = -1;
    function step(now: number) {
      simulation.tick((now - last) / 1000, inputRef.current); last = now;
      const state = simulation.state(), report = JSON.stringify(state);
      if (report !== lastReport) { lastReport = report; reportRef.current(state); }
      if (simulation.hint !== lastHint) { lastHint = simulation.hint; setStatus(lastHint); }
      let opened = 0;
      for (const [id, door] of simulation.doors) {
        const element = doorRefs.current.get(id);
        if (element) {
          element.style.setProperty("--door-progress", String(door.progress));
          element.dataset.open = String(door.open);
        }
        if (door.open) opened++;
      }
      if (opened !== lastDoors) { lastDoors = opened; setOpenCount(opened); }
      const world = worldRef.current;
      if (world) {
        const view = viewRef.current, zoom = Math.max(.08, view.fit.zoom) * view.zoomFactor;
        let x = (view.fit.width - worldW * zoom) / 2, y = (view.fit.height - worldH * zoom) / 2;
        if (view.follow && view.zoomFactor > 1) {
          const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
          x = worldW * zoom > view.fit.width ? clamp(view.fit.width / 2 - simulation.position.x * TILE * zoom, view.fit.width - worldW * zoom - 16, 16) : x;
          y = worldH * zoom > view.fit.height ? clamp(view.fit.height / 2 - simulation.position.y * TILE * zoom, view.fit.height - worldH * zoom - 16, 16) : y;
        }
        world.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
        world.dataset.playerX = simulation.position.x.toFixed(3);
        world.dataset.playerY = simulation.position.y.toFixed(3);
        world.dataset.sitting = String(simulation.sitting);
        world.dataset.seatId = simulation.seatId ?? "";
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [simulation, worldW, worldH]);

  function walk(event: React.PointerEvent) {
    if (!worldRef.current || !active) return;
    const box = worldRef.current.getBoundingClientRect();
    const point = { x: (event.clientX - box.left) / box.width * layout.mapCols, y: (event.clientY - box.top) / box.height * layout.mapRows };
    simulation.walkTo(point, inputRef.current);
    setTarget(simulation.path.length ? simulation.path[simulation.path.length - 1] : null);
    containerRef.current?.focus({ preventScroll: true });
  }

  const changeZoom = (amount: number) => { setZoomFactor((z) => Math.max(1, Math.min(4, z + amount))); setFollow(true); };
  return (
    <div ref={containerRef} className={`office-game-container office-interactive scene-${theme}`} tabIndex={0} aria-label="Escritório interativo. Use WASD, setas ou clique para andar; E para sentar ou levantar.">
      <div className="office-scene-toolbar">
        <span className={`office-scene-live ${live?.tone ?? "online"}`}><i /> {live?.label ?? "Escritório"}</span>
        <div>
          <button type="button" onClick={() => changeZoom(-.5)} aria-label="Diminuir zoom">−</button>
          <button type="button" onClick={() => { setZoomFactor(1); setFollow(false); }} aria-label="Ver escritório inteiro">Visão geral</button>
          <button type="button" onClick={() => changeZoom(.5)} aria-label="Aumentar zoom">+</button>
          <button type="button" onClick={() => { setZoomFactor(2.5); setFollow(true); }} aria-label="Seguir personagem">Meu personagem</button>
        </div>
      </div>
      <div ref={worldRef} className="css-office-world office-real-world" style={{ width: worldW, height: worldH }} onPointerUp={walk}>
        {layout.rooms.map((room) => <div key={`floor-${room.id}`} className={`office-real-floor floor-${room.kind.toLowerCase()} ${room.parentId ? "is-inner" : ""}`}
          style={{ left: room.x * TILE, top: room.y * TILE, width: room.w * TILE, height: room.h * TILE }} />)}
        {layout.furniture.map((piece) => <OfficeFurniture key={piece.id} piece={piece} rows={layout.mapRows} />)}
        {wallSegments.map((rect, index) => <div key={index} className={`office-real-wall ${rect.w > rect.h ? "horizontal" : "vertical"}`}
          style={{ left: rect.x * TILE, top: rect.y * TILE, width: rect.w * TILE, height: rect.h * TILE, zIndex: Math.round(20 + rect.y / layout.mapRows * 100) }} />)}
        {layout.rooms.map((room) => {
          const rect = doorRect(room);
          return <div key={room.id} ref={(element) => { if (element) doorRefs.current.set(room.id, element); else doorRefs.current.delete(room.id); }}
            className={`office-real-door ${room.locked ? "locked" : ""}`} data-door={room.id} data-open="false" aria-label={`Porta · ${room.name}`}
            style={{ left: rect.x * TILE, top: rect.y * TILE, width: rect.w * TILE, height: rect.h * TILE, zIndex: Math.round(21 + rect.y / layout.mapRows * 100) }}>
            <span className="door-panel left" /><span className="door-panel right" /><i />
          </div>;
        })}
        {target && <div className="office-walk-target" style={{ left: target.x * TILE, top: target.y * TILE }} />}
        {lockedZones.map((zone, i) => <div key={i} className="css-office-lock-zone" style={{ left: (zone.x + zone.w / 2) * TILE, top: (zone.y + zone.h / 2) * TILE, width: zone.w * TILE, height: zone.h * TILE }} />)}
        <div className="css-office-actors">{children}</div>
      </div>
      {showStatus && <div className="office-scene-status">
        <span>{status}</span>
        <span className="office-scene-keys"><kbd>WASD</kbd><kbd>↑ ↓ ← →</kbd> ou clique para andar</span>
        <small>{openCount} {openCount === 1 ? "porta aberta" : "portas abertas"}</small>
      </div>}
      <div className="office-touch-controls" aria-label="Controles de movimento">
        {["up", "left", "down", "right"].map((direction) => <button key={direction} type="button" className={direction} aria-label={`Andar para ${({ up: "cima", left: "esquerda", down: "baixo", right: "direita" })[direction as "up"]}`}
          onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); keys.current.add(direction); }}
          onPointerUp={() => keys.current.delete(direction)} onPointerCancel={() => keys.current.delete(direction)}>{({ up: "↑", left: "←", down: "↓", right: "→" })[direction as "up"]}</button>)}
      </div>
    </div>
  );
}
