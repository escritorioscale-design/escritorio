"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react";
import {
  Bell, CalendarDays, Check, ChevronDown, Grid2X2, LogOut, MessageSquare,
  Mic, Palette, Plus, Search, Settings, Users, Video, Volume2, X,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarCharacter, type AvatarDirection } from "@/components/avatar-character";
import { signOut } from "@/lib/auth-client";
import {
  AVATAR_ACCESSORIES,
  AVATAR_BOTTOM_COLORS,
  AVATAR_HAIR_COLORS,
  AVATAR_HAIR_STYLES,
  AVATAR_SHOE_COLORS,
  AVATAR_SKIN_TONES,
  AVATAR_TOP_COLORS,
  normalizeAvatar,
  type AvatarAppearance,
} from "@/lib/avatar";

type RoomData = { id: string; name: string; kind: string; x: number; y: number; width: number; height: number };
type Presence = {
  userId: string;
  name: string;
  avatar?: AvatarAppearance;
  x: number;
  y: number;
  status: string;
  direction?: AvatarDirection;
  moving?: boolean;
};
type MediaGrant = { token: string; serverUrl: string };
type Point = { x: number; y: number };
type Obstacle = Point & { width: number; height: number };

type Props = {
  user: { id: string; name: string; email: string; avatar: AvatarAppearance };
  organization: { id: string; name: string; role: string };
  workspace: { id: string; name: string };
  space: { id: string; name: string };
  rooms: RoomData[];
};

const palette: Record<string, string> = {
  SOCIAL: "#f4e0c9", FOCUS: "#dfe7df", MEETING: "#ddd8f2", PROXIMITY: "#dceacb",
};
const movementKeys: Record<string, Point> = {
  arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 },
};
const hairLabels: Record<AvatarAppearance["hairStyle"], string> = {
  short: "Curto", bob: "Bob", curls: "Cachos", bun: "Coque",
};
const accessoryLabels: Record<AvatarAppearance["accessory"], string> = {
  none: "Nenhum", glasses: "Óculos", headphones: "Headset",
};

function getObstacles(rooms: RoomData[]): Obstacle[] {
  return rooms.flatMap((room) => {
    if (room.kind === "MEETING") {
      return [{ x: room.x + room.width * .18, y: room.y + room.height * .27, width: room.width * .64, height: room.height * .43 }];
    }
    if (room.kind === "PROXIMITY") {
      return [{ x: room.x + room.width * .12, y: room.y + room.height * .29, width: room.width * .62, height: room.height * .52 }];
    }
    if (room.kind === "SOCIAL") {
      return [
        { x: room.x + room.width * .2, y: room.y + room.height * .36, width: room.width * .38, height: room.height * .15 },
        { x: room.x + room.width * .48, y: room.y + room.height * .62, width: room.width * .39, height: room.height * .15 },
        { x: room.x + room.width * .72, y: room.y + room.height * .29, width: room.width * .14, height: room.height * .18 },
      ];
    }
    if (room.kind === "FOCUS") {
      return Array.from({ length: 6 }, (_, index) => ({
        x: room.x + room.width * (.09 + (index % 3) * .29),
        y: room.y + room.height * (.31 + Math.floor(index / 3) * .38),
        width: room.width * .2,
        height: room.height * .16,
      }));
    }
    return [];
  });
}

function inside(point: Point, obstacle: Obstacle, padding = 1.25) {
  return point.x > obstacle.x - padding && point.x < obstacle.x + obstacle.width + padding
    && point.y > obstacle.y - padding && point.y < obstacle.y + obstacle.height + padding;
}

function clampPoint(point: Point): Point {
  return { x: Math.max(2, Math.min(98, point.x)), y: Math.max(5, Math.min(96, point.y)) };
}

function openPosition(point: Point, obstacles: Obstacle[]) {
  return !obstacles.some((obstacle) => inside(point, obstacle));
}

function nearestOpenPosition(point: Point, obstacles: Obstacle[]): Point {
  const clamped = clampPoint(point);
  if (openPosition(clamped, obstacles)) return clamped;
  for (let radius = 1; radius <= 12; radius += 1) {
    for (let angle = 0; angle < 360; angle += 22.5) {
      const radians = angle * Math.PI / 180;
      const candidate = clampPoint({ x: clamped.x + Math.cos(radians) * radius, y: clamped.y + Math.sin(radians) * radius });
      if (openPosition(candidate, obstacles)) return candidate;
    }
  }
  return clamped;
}

function resolveMovement(current: Point, delta: Point, obstacles: Obstacle[]): Point {
  const direct = clampPoint({ x: current.x + delta.x, y: current.y + delta.y });
  if (openPosition(direct, obstacles)) return direct;
  const horizontal = clampPoint({ x: current.x + delta.x, y: current.y });
  if (openPosition(horizontal, obstacles)) return horizontal;
  const vertical = clampPoint({ x: current.x, y: current.y + delta.y });
  return openPosition(vertical, obstacles) ? vertical : current;
}

function directionFromVector(x: number, y: number, fallback: AvatarDirection): AvatarDirection {
  if (Math.abs(x) < .001 && Math.abs(y) < .001) return fallback;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
  return y > 0 ? "down" : "up";
}

function AvatarSwatches({ values, value, onChange, label }: {
  values: readonly string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <fieldset className="avatar-fieldset">
      <legend>{label}</legend>
      <div className="avatar-swatches">
        {values.map((color) => (
          <button
            type="button"
            key={color}
            className={value === color ? "selected" : ""}
            style={{ background: color }}
            onClick={() => onChange(color)}
            aria-label={`${label}: ${color}`}
          >{value === color && <Check />}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function WorkspaceShell({ user, organization, workspace, space, rooms }: Props) {
  const obstacles = useMemo(() => getObstacles(rooms), [rooms]);
  const initialPosition = useMemo(() => nearestOpenPosition({ x: 49, y: 52 }, obstacles), [obstacles]);
  const [position, setPosition] = useState(initialPosition);
  const [direction, setDirection] = useState<AvatarDirection>("down");
  const [moving, setMoving] = useState(false);
  const [people, setPeople] = useState<Record<string, Presence>>({});
  const [connection, setConnection] = useState<"connecting" | "online" | "offline">("connecting");
  const [media, setMedia] = useState<MediaGrant | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [avatar, setAvatar] = useState(user.avatar);
  const [draftAvatar, setDraftAvatar] = useState(user.avatar);
  const [editorOpen, setEditorOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const positionRef = useRef(initialPosition);
  const directionRef = useRef<AvatarDirection>("down");
  const movingRef = useRef(false);
  const pressedKeysRef = useRef(new Set<string>());
  const targetRef = useRef<Point | null>(null);
  const lastEmitRef = useRef(0);

  const emitMovement = useCallback((next: Point, nextDirection: AvatarDirection, nextMoving: boolean, force = false) => {
    const now = performance.now();
    if (!force && now - lastEmitRef.current < 75) return;
    lastEmitRef.current = now;
    socketRef.current?.emit("position:update", { ...next, direction: nextDirection, moving: nextMoving });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;
    async function connect() {
      try {
        const response = await fetch("/api/realtime/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id }),
        });
        if (!response.ok) throw new Error("token");
        const { token } = await response.json();
        if (cancelled) return;
        socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3101", {
          auth: { token }, transports: ["websocket"], reconnectionDelayMax: 5000,
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          setConnection("online");
          socket?.emit("presence:join", {
            ...positionRef.current,
            status: "available",
            direction: directionRef.current,
            moving: false,
          });
        });
        socket.on("disconnect", () => setConnection("offline"));
        socket.on("presence:snapshot", (snapshot: Presence[]) => {
          setPeople(Object.fromEntries(snapshot.filter((person) => person.userId !== user.id).map((person) => [person.userId, person])));
        });
        socket.on("presence:upsert", (presence: Presence) => {
          if (presence.userId !== user.id) setPeople((current) => ({ ...current, [presence.userId]: presence }));
        });
        socket.on("presence:left", ({ userId }: { userId: string }) => {
          setPeople((current) => { const next = { ...current }; delete next[userId]; return next; });
        });
      } catch {
        setConnection("offline");
      }
    }
    connect();
    return () => { cancelled = true; socket?.disconnect(); };
  }, [user.id, workspace.id]);

  useEffect(() => {
    if (editorOpen) {
      pressedKeysRef.current.clear();
      targetRef.current = null;
      return;
    }

    let frame = 0;
    let previous = performance.now();
    const setPressed = (event: KeyboardEvent, pressed: boolean) => {
      const key = event.key.toLowerCase();
      if (!movementKeys[key] || (event.target as HTMLElement).matches("input, textarea, button")) return;
      event.preventDefault();
      if (pressed) {
        pressedKeysRef.current.add(key);
        targetRef.current = null;
      } else {
        pressedKeysRef.current.delete(key);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => setPressed(event, true);
    const onKeyUp = (event: KeyboardEvent) => setPressed(event, false);
    const onBlur = () => pressedKeysRef.current.clear();

    function tick(now: number) {
      const elapsed = Math.min((now - previous) / 1000, .04);
      previous = now;
      let vector = { x: 0, y: 0 };
      for (const key of pressedKeysRef.current) {
        const delta = movementKeys[key];
        if (delta) vector = { x: vector.x + delta.x, y: vector.y + delta.y };
      }

      const target = targetRef.current;
      if (!vector.x && !vector.y && target) {
        vector = { x: target.x - positionRef.current.x, y: target.y - positionRef.current.y };
        if (Math.hypot(vector.x, vector.y) < .35) {
          targetRef.current = null;
          vector = { x: 0, y: 0 };
        }
      }

      const magnitude = Math.hypot(vector.x, vector.y);
      let isMoving = false;
      if (magnitude > .001) {
        const speed = 15.5;
        const step = Math.min(speed * elapsed, magnitude);
        const next = resolveMovement(positionRef.current, {
          x: vector.x / magnitude * step,
          y: vector.y / magnitude * step,
        }, obstacles);
        const nextDirection = directionFromVector(vector.x, vector.y, directionRef.current);
        if (nextDirection !== directionRef.current) {
          directionRef.current = nextDirection;
          setDirection(nextDirection);
        }
        if (next.x !== positionRef.current.x || next.y !== positionRef.current.y) {
          positionRef.current = next;
          setPosition(next);
          isMoving = true;
          emitMovement(next, nextDirection, true);
        } else if (targetRef.current) {
          targetRef.current = null;
        }
      }

      if (isMoving !== movingRef.current) {
        movingRef.current = isMoving;
        setMoving(isMoving);
        emitMovement(positionRef.current, directionRef.current, isMoving, true);
      }
      frame = requestAnimationFrame(tick);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [editorOpen, emitMovement, obstacles]);

  const nearby = useMemo(
    () => Object.values(people).filter((person) => Math.hypot(person.x - position.x, person.y - position.y) < 14),
    [people, position],
  );
  const meetingRoom = rooms.find((room) => room.kind === "MEETING") ?? rooms[0];

  function walkTo(x: number, y: number) {
    targetRef.current = nearestOpenPosition({ x, y }, obstacles);
  }

  function openAvatarEditor() {
    setDraftAvatar(avatar);
    setAvatarError("");
    setEditorOpen(true);
  }

  async function saveAvatar() {
    setAvatarSaving(true);
    setAvatarError("");
    try {
      const response = await fetch("/api/profile/avatar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftAvatar),
      });
      if (!response.ok) throw new Error("save");
      const payload = await response.json();
      const saved = normalizeAvatar(payload.avatar);
      setAvatar(saved);
      socketRef.current?.emit("avatar:update", saved);
      setEditorOpen(false);
    } catch {
      setAvatarError("Não foi possível salvar seu personagem. Tente novamente.");
    } finally {
      setAvatarSaving(false);
    }
  }

  async function joinCall(room = meetingRoom) {
    if (!room) return;
    setMediaError("");
    const response = await fetch("/api/livekit/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, roomId: room.id }),
    });
    if (!response.ok) {
      setMediaError("A infraestrutura de mídia ainda não está disponível.");
      return;
    }
    setMedia(await response.json());
  }

  return (
    <main className="office-shell">
      <aside className="nav-rail">
        <div className="logo">O</div>
        <nav>
          <button className="active" aria-label="Escritório"><Grid2X2 /></button>
          <button aria-label="Mensagens"><MessageSquare /><b>3</b></button>
          <button aria-label="Agenda"><CalendarDays /></button>
          <button aria-label="Pessoas"><Users /></button>
        </nav>
        <div className="nav-bottom">
          <button aria-label="Configurações"><Settings /></button>
          <button className="rail-avatar" aria-label="Editar personagem" onClick={openAvatarEditor}>
            <AvatarCharacter appearance={avatar} compact />
          </button>
        </div>
      </aside>

      <section className="office-main">
        <header className="office-header">
          <div className="workspace-heading">
            <i className={connection} />
            <div><span>{organization.name} · {organization.role}</span><strong>{space.name}</strong></div>
            <ChevronDown />
          </div>
          <div className="office-actions">
            <button aria-label="Buscar"><Search /></button>
            <button aria-label="Notificações"><Bell /></button>
            <div className="online-count"><span>{Object.keys(people).length + 1}</span> online</div>
            <button className="customize" onClick={openAvatarEditor}><Palette /> Personagem</button>
            <button className="invite"><Plus /> Convidar</button>
            <button aria-label="Sair" onClick={() => signOut({ fetchOptions: { onSuccess: () => location.assign("/login") } })}><LogOut /></button>
          </div>
        </header>

        <div className="office-content">
          <section className="map-stage" onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button")) return;
            const rect = event.currentTarget.getBoundingClientRect();
            walkTo(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
          }}>
            <div className="map-dots" />
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`map-room room-${room.kind.toLowerCase()}`}
                style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%`, background: palette[room.kind] }}
              >
                <span className="map-room-title">{room.name}</span>
                {room.kind === "SOCIAL" && <div className="room-art social-art"><i /><i /><i /></div>}
                {room.kind === "FOCUS" && <div className="room-art desk-art">{[1, 2, 3, 4, 5, 6].map((number) => <i key={number} />)}</div>}
                {room.kind === "MEETING" && <button className="room-art meeting-art" onClick={(event) => { event.stopPropagation(); joinCall(room); }}><span /><em><Video /> Entrar</em></button>}
                {room.kind === "PROXIMITY" && <div className="room-art garden-art"><i>✦</i><i>✿</i><i>✦</i></div>}
              </div>
            ))}

            {Object.values(people).map((person) => (
              <div
                className="map-character remote-character"
                key={person.userId}
                style={{ left: `${person.x}%`, top: `${person.y}%`, zIndex: Math.round(20 + person.y) }}
                aria-label={person.name}
              >
                <AvatarCharacter appearance={normalizeAvatar(person.avatar)} direction={person.direction} moving={person.moving} />
                <label>{person.name}</label>
              </div>
            ))}
            <div className="proximity-zone" style={{ left: `${position.x}%`, top: `${position.y}%` }} />
            <div
              className="map-character self-character"
              style={{ left: `${position.x}%`, top: `${position.y}%`, zIndex: Math.round(20 + position.y) }}
              aria-label="Seu personagem"
            >
              <AvatarCharacter appearance={avatar} direction={direction} moving={moving} />
              <label>Você</label>
            </div>
            <div className="movement-help"><span>WASD</span><span>↑ ↓ ← →</span><b>ou clique para andar</b></div>
            <div className={`connection-pill ${connection}`}>
              {connection === "online" ? "Tempo real conectado" : connection === "connecting" ? "Conectando…" : "Modo offline"}
            </div>
          </section>

          <aside className="people-panel">
            <div className="panel-title"><h2>Agora</h2><Volume2 /></div>
            <section className="meeting-card"><span>REUNIÃO ABERTA</span><h3>Daily de produto</h3><p>Sala Aurora · até 16 pessoas</p><button onClick={() => joinCall()}><Video /> Entrar na reunião</button></section>
            {mediaError && <p className="media-error">{mediaError}</p>}
            <div className="people-heading"><span>PESSOAS POR PERTO</span><b>{nearby.length}</b></div>
            {nearby.length ? nearby.map((person) => (
              <button className="person-row" key={person.userId} onClick={() => joinCall()}>
                <span className="person-avatar"><AvatarCharacter appearance={normalizeAvatar(person.avatar)} compact /></span>
                <div><strong>{person.name}</strong><small>Próximo de você</small></div><Mic />
              </button>
            )) : <div className="nearby-empty"><Users /><p>Aproxime-se de alguém no mapa para iniciar uma conversa.</p></div>}
            <div className="people-heading"><span>NO ESCRITÓRIO</span><b>{Object.keys(people).length + 1}</b></div>
            <div className="person-row me-row">
              <span className="person-avatar"><AvatarCharacter appearance={avatar} compact /></span>
              <div><strong>{user.name}</strong><small>Você · {connection}</small></div>
            </div>
            {Object.values(people).slice(0, 8).map((person) => (
              <div className="person-row" key={person.userId}>
                <span className="person-avatar"><AvatarCharacter appearance={normalizeAvatar(person.avatar)} compact /></span>
                <div><strong>{person.name}</strong><small>{person.status}</small></div>
              </div>
            ))}
          </aside>
        </div>
      </section>

      {editorOpen && (
        <div className="avatar-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}>
          <section className="avatar-editor" role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title">
            <header><div><span>SEU PERSONAGEM</span><h2 id="avatar-editor-title">Crie seu visual</h2><p>As mudanças aparecem para todo mundo no escritório.</p></div><button onClick={() => setEditorOpen(false)} aria-label="Fechar"><X /></button></header>
            <div className="avatar-editor-content">
              <div className="avatar-preview-stage">
                <div className="avatar-preview-glow" />
                <AvatarCharacter appearance={draftAvatar} direction="down" moving />
                <strong>{user.name}</strong><span>Prévia em tempo real</span>
              </div>
              <div className="avatar-controls">
                <AvatarSwatches label="Tom de pele" values={AVATAR_SKIN_TONES} value={draftAvatar.skinTone} onChange={(skinTone) => setDraftAvatar((current) => ({ ...current, skinTone: skinTone as AvatarAppearance["skinTone"] }))} />
                <fieldset className="avatar-fieldset"><legend>Cabelo</legend><div className="avatar-choice-grid">{AVATAR_HAIR_STYLES.map((hairStyle) => <button type="button" key={hairStyle} className={draftAvatar.hairStyle === hairStyle ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, hairStyle }))}>{hairLabels[hairStyle]}</button>)}</div></fieldset>
                <AvatarSwatches label="Cor do cabelo" values={AVATAR_HAIR_COLORS} value={draftAvatar.hairColor} onChange={(hairColor) => setDraftAvatar((current) => ({ ...current, hairColor: hairColor as AvatarAppearance["hairColor"] }))} />
                <AvatarSwatches label="Camiseta" values={AVATAR_TOP_COLORS} value={draftAvatar.topColor} onChange={(topColor) => setDraftAvatar((current) => ({ ...current, topColor: topColor as AvatarAppearance["topColor"] }))} />
                <AvatarSwatches label="Calça" values={AVATAR_BOTTOM_COLORS} value={draftAvatar.bottomColor} onChange={(bottomColor) => setDraftAvatar((current) => ({ ...current, bottomColor: bottomColor as AvatarAppearance["bottomColor"] }))} />
                <AvatarSwatches label="Sapatos" values={AVATAR_SHOE_COLORS} value={draftAvatar.shoeColor} onChange={(shoeColor) => setDraftAvatar((current) => ({ ...current, shoeColor: shoeColor as AvatarAppearance["shoeColor"] }))} />
                <fieldset className="avatar-fieldset"><legend>Acessório</legend><div className="avatar-choice-grid">{AVATAR_ACCESSORIES.map((accessory) => <button type="button" key={accessory} className={draftAvatar.accessory === accessory ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, accessory }))}>{accessoryLabels[accessory]}</button>)}</div></fieldset>
              </div>
            </div>
            {avatarError && <p className="avatar-save-error">{avatarError}</p>}
            <footer><button className="avatar-cancel" onClick={() => setEditorOpen(false)}>Cancelar</button><button className="avatar-save" onClick={saveAvatar} disabled={avatarSaving}>{avatarSaving ? "Salvando…" : <><Check /> Salvar personagem</>}</button></footer>
          </section>
        </div>
      )}

      {media && <div className="call-overlay" data-lk-theme="default">
        <LiveKitRoom token={media.token} serverUrl={media.serverUrl} connect audio video={false} onDisconnected={() => setMedia(null)}>
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>}
    </main>
  );
}
