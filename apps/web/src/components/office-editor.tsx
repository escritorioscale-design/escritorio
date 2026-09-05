"use client";

import { Lock, LockOpen, Plus, Redo2, Save, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  DEFAULT_OFFICE_LAYOUT, ITEM_KEYS, ROOM_KIND_LABELS,
  cloneLayout, furnitureVisual, itemLabel,
  type AvatarDirection, type LayoutFurniture, type LayoutRoom, type OfficeLayout, type RoomKind,
} from "@/lib/office-layout";

const PX = 22; // editor canvas pixels per tile — smaller than the live TILE so the whole map fits on screen
const ROOM_KINDS: RoomKind[] = ["FOCUS", "MEETING", "DIRECTOR", "CREATIVE", "AUDITORIUM", "CUSTOM"];
const FACINGS: AvatarDirection[] = ["up", "right", "down", "left"];
const FACING_ARROWS: Record<AvatarDirection, string> = { up: "↑", right: "→", down: "↓", left: "←" };

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function usePointerDrag(onMove: (dxTiles: number, dyTiles: number) => void) {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  return (event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    originRef.current = { x: event.clientX, y: event.clientY };
    const onPointerMove = (ev: PointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      const dx = ev.clientX - origin.x, dy = ev.clientY - origin.y;
      originRef.current = { x: ev.clientX, y: ev.clientY };
      onMove(dx / PX, dy / PX);
    };
    const onPointerUp = () => {
      originRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function OfficeEditor({ initialLayout, workspaceId, spaceId, onClose, onSaved }: {
  initialLayout: OfficeLayout;
  workspaceId: string;
  spaceId: string;
  onClose: () => void;
  onSaved: (layout: OfficeLayout) => void;
}) {
  const [layout, setLayout] = useState<OfficeLayout>(() => cloneLayout(initialLayout));
  const [selected, setSelected] = useState<{ kind: "room" | "furniture"; id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedRoom = selected?.kind === "room" ? layout.rooms.find((room) => room.id === selected.id) : undefined;
  const selectedFurniture = selected?.kind === "furniture" ? layout.furniture.find((piece) => piece.id === selected.id) : undefined;

  function updateRoom(id: string, patch: Partial<LayoutRoom>) {
    setLayout((current) => ({ ...current, rooms: current.rooms.map((room) => (room.id === id ? { ...room, ...patch } : room)) }));
  }
  function updateFurniture(id: string, patch: Partial<LayoutFurniture>) {
    setLayout((current) => ({ ...current, furniture: current.furniture.map((piece) => (piece.id === id ? { ...piece, ...patch } : piece)) }));
  }

  function addRoom() {
    const room: LayoutRoom = {
      id: newId("room"), kind: "CUSTOM", name: "Nova sala",
      x: clamp(Math.round(layout.mapCols / 2 - 5), 0, layout.mapCols - 10),
      y: clamp(Math.round(layout.mapRows / 2 - 4), 0, layout.mapRows - 8),
      w: 10, h: 8, doorSide: "bottom", locked: false,
    };
    setLayout((current) => ({ ...current, rooms: [...current.rooms, room] }));
    setSelected({ kind: "room", id: room.id });
  }

  function addFurniture(key: string) {
    const piece: LayoutFurniture = {
      id: newId("f"), key,
      x: Math.round(layout.mapCols / 2), y: Math.round(layout.mapRows / 2),
      scale: 1, facing: key.startsWith("chair") ? "up" : undefined,
    };
    setLayout((current) => ({ ...current, furniture: [...current.furniture, piece] }));
    setSelected({ kind: "furniture", id: piece.id });
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.kind === "room") setLayout((current) => ({ ...current, rooms: current.rooms.filter((room) => room.id !== selected.id) }));
    else setLayout((current) => ({ ...current, furniture: current.furniture.filter((piece) => piece.id !== selected.id) }));
    setSelected(null);
  }

  function resetToDefault() {
    setLayout(cloneLayout(DEFAULT_OFFICE_LAYOUT));
    setSelected(null);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workspaces/office-layout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, spaceId, layout }),
      });
      if (!response.ok) throw new Error("save-failed");
      onSaved(layout);
      onClose();
    } catch {
      setError("Não foi possível salvar o layout. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="office-editor-backdrop" role="presentation">
      <section className="office-editor" role="dialog" aria-modal="true" aria-labelledby="office-editor-title">
        <header>
          <div>
            <span>EDITOR DO ESCRITÓRIO</span>
            <h2 id="office-editor-title">Personalize seu espaço</h2>
            <p>Arraste salas e móveis, tranque portas, adicione o que quiser. Só quem é dono/admin vê este editor.</p>
          </div>
          <div className="office-editor-actions">
            <button className="office-editor-reset" onClick={resetToDefault} type="button"><Redo2 /> Restaurar padrão</button>
            <button className="office-editor-save" onClick={save} disabled={saving} type="button"><Save /> {saving ? "Salvando…" : "Salvar"}</button>
            <button className="office-editor-close" onClick={onClose} aria-label="Fechar" type="button"><X /></button>
          </div>
        </header>
        {error && <p className="office-editor-error">{error}</p>}

        <div className="office-editor-body">
          <aside className="office-editor-palette">
            <button className="office-editor-add-room" onClick={addRoom} type="button"><Plus /> Nova sala</button>
            <div className="office-editor-items">
              {ITEM_KEYS.map((key) => {
                const visual = furnitureVisual(key);
                return (
                  <button key={key} className="office-editor-item" onClick={() => addFurniture(key)} type="button">
                    <i style={{ background: visual.color, borderRadius: visual.shape === "circle" ? "50%" : 3 }} />
                    <span>{itemLabel(key)}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="office-editor-canvas-scroll">
            <div
              className="office-editor-canvas"
              style={{ width: layout.mapCols * PX, height: layout.mapRows * PX }}
              onPointerDown={() => setSelected(null)}
            >
              {layout.rooms.map((room) => (
                <RoomBox
                  key={room.id}
                  room={room}
                  selected={selected?.kind === "room" && selected.id === room.id}
                  onSelect={() => setSelected({ kind: "room", id: room.id })}
                  onMove={(dx, dy) => updateRoom(room.id, {
                    x: clamp(room.x + dx, 0, layout.mapCols - room.w),
                    y: clamp(room.y + dy, 0, layout.mapRows - room.h),
                  })}
                  onResize={(dw, dh) => updateRoom(room.id, {
                    w: clamp(room.w + dw, 4, layout.mapCols - room.x),
                    h: clamp(room.h + dh, 4, layout.mapRows - room.y),
                  })}
                />
              ))}
              {layout.furniture.map((piece) => (
                <FurnitureIcon
                  key={piece.id}
                  piece={piece}
                  selected={selected?.kind === "furniture" && selected.id === piece.id}
                  onSelect={() => setSelected({ kind: "furniture", id: piece.id })}
                  onMove={(dx, dy) => updateFurniture(piece.id, {
                    x: clamp(piece.x + dx, 0, layout.mapCols),
                    y: clamp(piece.y + dy, 0, layout.mapRows),
                  })}
                />
              ))}
            </div>
          </div>

          <aside className="office-editor-inspector">
            {selectedRoom && (
              <div className="office-editor-inspector-panel">
                <h3>Sala</h3>
                <label>Nome<input value={selectedRoom.name} onChange={(event) => updateRoom(selectedRoom.id, { name: event.target.value })} /></label>
                <label>Tipo
                  <select value={selectedRoom.kind} onChange={(event) => updateRoom(selectedRoom.id, { kind: event.target.value as RoomKind })}>
                    {ROOM_KINDS.map((kind) => <option key={kind} value={kind}>{ROOM_KIND_LABELS[kind]}</option>)}
                  </select>
                </label>
                <label>Porta fica em
                  <select value={selectedRoom.doorSide} onChange={(event) => updateRoom(selectedRoom.id, { doorSide: event.target.value as "top" | "bottom" })}>
                    <option value="top">Em cima</option>
                    <option value="bottom">Embaixo</option>
                  </select>
                </label>
                <button
                  className={`office-editor-lock-toggle ${selectedRoom.locked ? "locked" : ""}`}
                  onClick={() => updateRoom(selectedRoom.id, { locked: !selectedRoom.locked })}
                  type="button"
                >
                  {selectedRoom.locked ? <Lock /> : <LockOpen />}
                  {selectedRoom.locked ? "Porta trancada — ninguém entra" : "Porta destrancada"}
                </button>
                <button className="office-editor-delete" onClick={deleteSelected} type="button"><Trash2 /> Excluir sala</button>
              </div>
            )}
            {selectedFurniture && (
              <div className="office-editor-inspector-panel">
                <h3>{itemLabel(selectedFurniture.key)}</h3>
                <label>Tamanho
                  <input
                    type="range" min={0.5} max={2} step={0.05}
                    value={selectedFurniture.scale ?? 1}
                    onChange={(event) => updateFurniture(selectedFurniture.id, { scale: parseFloat(event.target.value) })}
                  />
                </label>
                {selectedFurniture.key.startsWith("chair") && (
                  <div className="office-editor-facing">
                    <span>Direção ao sentar</span>
                    <div>
                      {FACINGS.map((direction) => (
                        <button
                          key={direction}
                          className={selectedFurniture.facing === direction ? "selected" : ""}
                          onClick={() => updateFurniture(selectedFurniture.id, { facing: direction })}
                          type="button"
                        >{FACING_ARROWS[direction]}</button>
                      ))}
                    </div>
                  </div>
                )}
                <label className="office-editor-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedFurniture.collides !== null}
                    onChange={(event) => updateFurniture(selectedFurniture.id, { collides: event.target.checked ? undefined : null })}
                  />
                  Bloqueia passagem
                </label>
                <button className="office-editor-delete" onClick={deleteSelected} type="button"><Trash2 /> Excluir item</button>
              </div>
            )}
            {!selectedRoom && !selectedFurniture && (
              <div className="office-editor-inspector-empty">
                <p>Clique em uma sala ou item no mapa para editar.</p>
                <p>Arraste para mover. Puxe o cantinho de uma sala pra redimensionar.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function RoomBox({ room, selected, onSelect, onMove, onResize }: {
  room: LayoutRoom;
  selected: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (dw: number, dh: number) => void;
}) {
  const dragBody = usePointerDrag(onMove);
  const dragHandle = usePointerDrag(onResize);
  return (
    <div
      className={`office-editor-room ${selected ? "selected" : ""} ${room.locked ? "locked" : ""}`}
      style={{ left: room.x * PX, top: room.y * PX, width: room.w * PX, height: room.h * PX }}
      onPointerDown={(event) => { onSelect(); dragBody(event); }}
    >
      <span className="office-editor-room-name">{room.locked && <Lock />} {room.name}</span>
      <i className={`office-editor-door-marker ${room.doorSide}`} style={{ left: "50%" }} />
      <div
        className="office-editor-resize-handle"
        onPointerDown={(event) => { event.stopPropagation(); dragHandle(event); }}
      />
    </div>
  );
}

function FurnitureIcon({ piece, selected, onSelect, onMove }: {
  piece: LayoutFurniture;
  selected: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
}) {
  const drag = usePointerDrag(onMove);
  const scale = piece.scale ?? 1;
  const visual = furnitureVisual(piece.key);
  return (
    <div
      title={piece.key}
      className={`office-editor-furniture ${selected ? "selected" : ""}`}
      style={{
        left: piece.x * PX, top: piece.y * PX,
        width: visual.w * PX * scale, height: visual.h * PX * scale,
        background: visual.color,
        borderRadius: visual.shape === "circle" ? "50%" : 3,
      }}
      onPointerDown={(event) => { onSelect(); drag(event); }}
    />
  );
}
