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
import { InviteModal } from "@/components/invite-modal";
import { OfficeCanvas } from "@/components/office-canvas";
import { signOut } from "@/lib/auth-client";
import {
  clampPoint,
  corridorY,
  directionFromVector,
  doorApproach,
  doorX,
  getObstacles,
  getSeats,
  isInsideRoom,
  nearestOpenPosition,
  openDoorsForPosition,
  resolveMovement,
  type Obstacle,
  type Point,
  type Seat,
} from "@/lib/office-layout";
import {
  AVATAR_ACCESSORIES,
  AVATAR_BODY_TYPES,
  AVATAR_BOTTOM_COLORS,
  AVATAR_BOTTOM_STYLES,
  AVATAR_HAIR_COLORS,
  AVATAR_HAIR_STYLES,
  AVATAR_SHOE_COLORS,
  AVATAR_SKIN_TONES,
  AVATAR_TOP_COLORS,
  AVATAR_TOP_STYLES,
  normalizeAvatar,
  type AvatarAppearance,
} from "@/lib/avatar";

type RoomData = { id: string; name: string; kind: string; x: number; y: number; width: number; height: number; capacity?: number | null };
type Presence = {
  userId: string;
  name: string;
  avatar?: AvatarAppearance;
  x: number;
  y: number;
  status: string;
  direction?: AvatarDirection;
  moving?: boolean;
  sitting?: boolean;
  seatId?: string | null;
};
type MediaGrant = { token: string; serverUrl: string };

type Props = {
  user: { id: string; name: string; email: string; avatar: AvatarAppearance };
  organization: { id: string; name: string; role: string };
  workspace: { id: string; name: string };
  space: { id: string; name: string };
  rooms: RoomData[];
};

type OfficeTheme = "day" | "neon" | "studio";

const movementKeys: Record<string, Point> = {
  arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 },
};
const bodyTypeLabels: Record<AvatarAppearance["bodyType"], string> = {
  male: "Masculino", female: "Feminino",
};
const hairLabels: Record<(typeof AVATAR_HAIR_STYLES)[number], string> = {
  short: "Curto", bob: "Bob", curls: "Cachos", bun: "Preso",
  long: "Longo", ponytail: "Meio preso", mohawk: "Moicano", afro: "Black power", spiky: "Espetado", bald: "Careca",
  dreadlocks: "Dreads", cornrows: "Tranças", natural: "Natural", swoop: "Repicado", pixie: "Pixie", loose: "Solto",
};
const topStyleLabels: Record<AvatarAppearance["topStyle"], string> = {
  tshirt: "Camiseta", hoodie: "Jaqueta", jacket: "Casaco", blazer: "Colete", tank: "Regata",
};
const bottomStyleLabels: Record<AvatarAppearance["bottomStyle"], string> = {
  pants: "Calça", shorts: "Shorts", skirt: "Saia", leggings: "Legging",
};
const accessoryLabels: Record<(typeof AVATAR_ACCESSORIES)[number], string> = {
  glasses: "Óculos", sunglasses: "Óculos de sol", hat: "Boné", tophat: "Cartola", bowtie: "Gravata", necklace: "Colar", earrings: "Brincos",
};

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
  const seats = useMemo(() => getSeats(rooms), [rooms]);
  const initialPosition = useMemo(() => nearestOpenPosition({ x: 49, y: 52 }, obstacles), [obstacles]);
  const [position, setPosition] = useState(initialPosition);
  const [direction, setDirection] = useState<AvatarDirection>("down");
  const [moving, setMoving] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [people, setPeople] = useState<Record<string, Presence>>({});
  const [connection, setConnection] = useState<"connecting" | "online" | "offline">("connecting");
  const [media, setMedia] = useState<MediaGrant | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [avatar, setAvatar] = useState(user.avatar);
  const [draftAvatar, setDraftAvatar] = useState(user.avatar);
  const [editorOpen, setEditorOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [officeEditorOpen, setOfficeEditorOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [officeTheme, setOfficeTheme] = useState<OfficeTheme>("day");
  const [decorationsVisible, setDecorationsVisible] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const positionRef = useRef(initialPosition);
  const directionRef = useRef<AvatarDirection>("down");
  const movingRef = useRef(false);
  const sittingRef = useRef(false);
  const seatIdRef = useRef<string | null>(null);
  const peopleRef = useRef<Record<string, Presence>>({});
  const pressedKeysRef = useRef(new Set<string>());
  const pathRef = useRef<Point[]>([]);
  const stuckTicksRef = useRef(0);
  const lastEmitRef = useRef(0);

  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("orbit-office-preferences") ?? "null") as { theme?: OfficeTheme; decorations?: boolean } | null;
      if (saved?.theme === "day" || saved?.theme === "neon" || saved?.theme === "studio") setOfficeTheme(saved.theme);
      if (typeof saved?.decorations === "boolean") setDecorationsVisible(saved.decorations);
    } catch { /* use the default office look */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("orbit-office-preferences", JSON.stringify({ theme: officeTheme, decorations: decorationsVisible }));
  }, [officeTheme, decorationsVisible]);

  const emitMovement = useCallback((next: Point, nextDirection: AvatarDirection, nextMoving: boolean, force = false, nextSitting = sittingRef.current, nextSeatId = seatIdRef.current) => {
    const now = performance.now();
    if (!force && now - lastEmitRef.current < 75) return;
    lastEmitRef.current = now;
    socketRef.current?.emit("position:update", { ...next, direction: nextDirection, moving: nextMoving, sitting: nextSitting, seatId: nextSeatId });
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
            sitting: false,
            seatId: null,
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
    if (editorOpen || officeEditorOpen) {
      pressedKeysRef.current.clear();
      pathRef.current = [];
      return;
    }

    let frame = 0;
    let previous = performance.now();
    const setPressed = (event: KeyboardEvent, pressed: boolean) => {
      const key = event.key.toLowerCase();
      if (!movementKeys[key] || (event.target as HTMLElement).matches("input, textarea, button")) return;
      event.preventDefault();
      if (pressed) {
        if (sittingRef.current) {
          sittingRef.current = false;
          setSitting(false);
          seatIdRef.current = null;
          emitMovement(positionRef.current, directionRef.current, false, true, false, null);
        }
        pressedKeysRef.current.add(key);
        pathRef.current = [];
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

      if (!vector.x && !vector.y && pathRef.current.length) {
        const target = pathRef.current[0];
        vector = { x: target.x - positionRef.current.x, y: target.y - positionRef.current.y };
        if (Math.hypot(vector.x, vector.y) < .35) {
          pathRef.current = pathRef.current.slice(1);
          const next = pathRef.current[0];
          vector = next ? { x: next.x - positionRef.current.x, y: next.y - positionRef.current.y } : { x: 0, y: 0 };
        }
      }

      const magnitude = Math.hypot(vector.x, vector.y);
      let isMoving = false;
      if (magnitude > .001) {
        if (sittingRef.current) {
          sittingRef.current = false;
          setSitting(false);
          seatIdRef.current = null;
        }
        const speed = 15.5;
        const step = Math.min(speed * elapsed, magnitude);
        const tickObstacles = getObstacles(rooms, openDoorsForPosition(positionRef.current, rooms));
        let attempt = { x: vector.x / magnitude * step, y: vector.y / magnitude * step };
        if (pathRef.current.length && stuckTicksRef.current > 12) {
          // Straight-line steering can't get around a rectangle sitting between
          // us and the target (e.g. a desk in front of its own chair) — nudge
          // sideways, alternating sides, until we clear it and can head
          // straight at the target again.
          const perpendicular = { x: -vector.y / magnitude, y: vector.x / magnitude };
          const side = Math.floor(stuckTicksRef.current / 12) % 2 === 0 ? 1 : -1;
          attempt = { x: attempt.x + perpendicular.x * side * step, y: attempt.y + perpendicular.y * side * step };
        }
        const next = resolveMovement(positionRef.current, attempt, tickObstacles);
        const nextDirection = directionFromVector(vector.x, vector.y, directionRef.current);
        if (nextDirection !== directionRef.current) {
          directionRef.current = nextDirection;
          setDirection(nextDirection);
        }
        const distanceMoved = Math.hypot(next.x - positionRef.current.x, next.y - positionRef.current.y);
        if (distanceMoved > .001) {
          positionRef.current = next;
          setPosition(next);
          isMoving = true;
          emitMovement(next, nextDirection, true);
        }
        // A sliver of progress (sliding along a wall while a door is still
        // shut, or nudging past a corner) still counts as "stuck" for path
        // steering — only a real step resets the counter, otherwise a
        // desk-in-front-of-its-chair situation would silently reset it every
        // tick and the sidestep above would never kick in.
        if (distanceMoved > step * .2) {
          stuckTicksRef.current = 0;
        } else if (pathRef.current.length) {
          // Only give up once we've made no real progress for a while.
          stuckTicksRef.current += 1;
          if (stuckTicksRef.current > 150) {
            pathRef.current = [];
            stuckTicksRef.current = 0;
          }
        }
      }

      if (!isMoving && !pathRef.current.length && pressedKeysRef.current.size === 0 && !sittingRef.current) {
        const occupiedSeatIds = new Set(Object.values(peopleRef.current).map((person) => person.seatId).filter(Boolean));
        const nearestSeat = seats
          .filter((seat) => !occupiedSeatIds.has(seat.id))
          .map((seat) => ({ seat, distance: Math.hypot(seat.x - positionRef.current.x, seat.y - positionRef.current.y) }))
          .filter(({ distance }) => distance <= 3.2)
          .sort((a, b) => a.distance - b.distance)[0]?.seat;
        if (nearestSeat) {
          positionRef.current = { x: nearestSeat.x, y: nearestSeat.y };
          setPosition(positionRef.current);
          directionRef.current = nearestSeat.direction;
          setDirection(nearestSeat.direction);
          sittingRef.current = true;
          setSitting(true);
          seatIdRef.current = nearestSeat.id;
          emitMovement(positionRef.current, nearestSeat.direction, false, true, true, nearestSeat.id);
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
  }, [editorOpen, emitMovement, obstacles, officeEditorOpen, rooms, seats]);

  const nearby = useMemo(
    () => Object.values(people).filter((person) => Math.hypot(person.x - position.x, person.y - position.y) < 14),
    [people, position],
  );
  const meetingRoom = rooms.find((room) => room.kind === "MEETING") ?? rooms[0];

  function walkTo(x: number, y: number) {
    if (sittingRef.current) {
      sittingRef.current = false;
      setSitting(false);
      seatIdRef.current = null;
    }
    stuckTicksRef.current = 0;
    const requested = clampPoint({ x, y });
    const currentRoom = rooms.find((room) => isInsideRoom(positionRef.current, room));
    const entryRoom = rooms.find((room) => isInsideRoom(requested, room));
    const path: Point[] = [];
    // Leaving one room and/or entering another: step out through the current
    // room's own door into the shared corridor, slide along the corridor to
    // line up with the target room's door, then step in — rather than a
    // diagonal shortcut that can clip a neighboring room's wall corner.
    if (currentRoom && currentRoom.id !== entryRoom?.id) {
      const y = corridorY(rooms);
      path.push({ x: doorX(currentRoom), y });
      if (entryRoom) path.push({ x: doorX(entryRoom), y });
    }
    if (entryRoom && entryRoom.id !== currentRoom?.id) {
      path.push(doorApproach(entryRoom));
      // Focus/social rooms have their desks in two side columns with a clear
      // aisle straight down the middle. Go down that aisle to the target's
      // own row before turning to approach it, instead of cutting diagonally
      // across a desk that sits between the door and a chair behind it.
      if (entryRoom.kind === "FOCUS" || entryRoom.kind === "SOCIAL") {
        path.push({ x: doorX(entryRoom), y: requested.y });
      }
    }
    path.push(requested);
    pathRef.current = path;
  }

  const openDoorIds = useMemo(() => [...openDoorsForPosition(position, rooms)], [position, rooms]);

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
            <button className="customize office-customize" onClick={() => setOfficeEditorOpen(true)}><Settings /> Escritório</button>
            <button className="customize" onClick={openAvatarEditor}><Palette /> Personagem</button>
            {(organization.role === "owner" || organization.role === "admin") && (
              <button className="invite" onClick={() => setInviteOpen(true)}><Plus /> Convidar</button>
            )}
            <button aria-label="Sair" onClick={() => signOut({ fetchOptions: { onSuccess: () => location.assign("/login") } })}><LogOut /></button>
          </div>
        </header>

        <div className="office-content">
          <section className={`map-stage office-theme-${officeTheme}`} onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button")) return;
            const rect = event.currentTarget.getBoundingClientRect();
            walkTo(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
          }}>
            <div className="map-dots" />
            <div className="map-corridor" aria-hidden="true"><span>corredor principal · área de convivência</span></div>
            {decorationsVisible && <>
              <div className="map-decor decor-window decor-window-a" aria-hidden="true" />
              <div className="map-decor decor-window decor-window-b" aria-hidden="true" />
              <div className="map-decor decor-printer" aria-hidden="true" />
              <div className="map-decor decor-coffee" aria-hidden="true" />
            </>}
            <OfficeCanvas rooms={rooms} theme={officeTheme} openDoorIds={openDoorIds} />
            {rooms.map((room) => (
              <div
                key={`title-${room.id}`}
                className="map-room-title"
                style={{ left: `calc(${room.x}% + 12px)`, top: `calc(${room.y}% + 10px)`, pointerEvents: "none" }}
              >
                <strong>{room.name}</strong>
                <small>{room.kind === "FOCUS" || room.name.toLowerCase().includes("cria") ? "4 posições de trabalho" : room.kind === "MEETING" ? "Até 24 participantes" : "Sala reservada"}</small>
              </div>
            ))}
            {rooms.filter((room) => room.kind === "MEETING").map((room) => (
              <button key={`meeting-${room.id}`} className="map-meeting-hit" style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%` }} onClick={() => joinCall(room)} aria-label="Entrar na sala de reunião" />
            ))}

            {Object.values(people).map((person) => (
              <div
                className="map-character remote-character"
                key={person.userId}
                style={{ left: `${person.x}%`, top: `${person.y}%`, zIndex: Math.round(20 + person.y) }}
                aria-label={person.name}
              >
                <AvatarCharacter appearance={normalizeAvatar(person.avatar)} direction={person.direction} moving={person.moving} sitting={person.sitting} />
                <label>{person.name}</label>
              </div>
            ))}
            <div className="proximity-zone" style={{ left: `${position.x}%`, top: `${position.y}%` }} />
            <div
              className="map-character self-character"
              style={{ left: `${position.x}%`, top: `${position.y}%`, zIndex: Math.round(20 + position.y) }}
              aria-label="Seu personagem"
            >
              <AvatarCharacter appearance={avatar} direction={direction} moving={moving} sitting={sitting} />
              <label>Você</label>
            </div>
            <div className="movement-help"><span>WASD</span><span>↑ ↓ ← →</span><b>ou clique para andar</b></div>
            <div className={`connection-pill ${connection}`}>
              {connection === "online" ? "Tempo real conectado" : connection === "connecting" ? "Conectando…" : "Modo offline"}
            </div>
          </section>

          <aside className="people-panel">
            <div className="panel-title"><h2>Agora</h2><Volume2 /></div>
            <section className="meeting-card"><span>REUNIÃO ABERTA</span><h3>Daily de produto</h3><p>Sala geral · até 24 pessoas</p><button onClick={() => joinCall()}><Video /> Entrar na reunião</button></section>
            <section className="office-plan"><span>LAYOUT DO ESCRITÓRIO</span><strong>3 squads + criação · 4 posições cada</strong><p>Sala geral, criação e gerência ficam no corredor superior.</p></section>
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
                <fieldset className="avatar-fieldset"><legend>Corpo</legend><div className="avatar-choice-grid">{AVATAR_BODY_TYPES.map((bodyType) => <button type="button" key={bodyType} className={draftAvatar.bodyType === bodyType ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, bodyType }))}>{bodyTypeLabels[bodyType]}</button>)}</div></fieldset>
                <AvatarSwatches label="Tom de pele" values={AVATAR_SKIN_TONES} value={draftAvatar.skinTone} onChange={(skinTone) => setDraftAvatar((current) => ({ ...current, skinTone: skinTone as AvatarAppearance["skinTone"] }))} />
                <fieldset className="avatar-fieldset"><legend>Cabelo</legend><div className="avatar-choice-grid">{AVATAR_HAIR_STYLES.map((hairStyle) => <button type="button" key={hairStyle} className={draftAvatar.hairStyle === hairStyle ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, hairStyle }))}>{hairLabels[hairStyle]}</button>)}</div></fieldset>
                <AvatarSwatches label="Cor do cabelo" values={AVATAR_HAIR_COLORS} value={draftAvatar.hairColor} onChange={(hairColor) => setDraftAvatar((current) => ({ ...current, hairColor: hairColor as AvatarAppearance["hairColor"] }))} />
                <fieldset className="avatar-fieldset"><legend>Estilo da blusa</legend><div className="avatar-choice-grid">{AVATAR_TOP_STYLES.map((topStyle) => <button type="button" key={topStyle} className={draftAvatar.topStyle === topStyle ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, topStyle }))}>{topStyleLabels[topStyle]}</button>)}</div></fieldset>
                <AvatarSwatches label="Cor da blusa" values={AVATAR_TOP_COLORS} value={draftAvatar.topColor} onChange={(topColor) => setDraftAvatar((current) => ({ ...current, topColor: topColor as AvatarAppearance["topColor"] }))} />
                <fieldset className="avatar-fieldset"><legend>Estilo da calça</legend><div className="avatar-choice-grid">{AVATAR_BOTTOM_STYLES.map((bottomStyle) => <button type="button" key={bottomStyle} className={draftAvatar.bottomStyle === bottomStyle ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, bottomStyle }))}>{bottomStyleLabels[bottomStyle]}</button>)}</div></fieldset>
                <AvatarSwatches label="Cor da calça" values={AVATAR_BOTTOM_COLORS} value={draftAvatar.bottomColor} onChange={(bottomColor) => setDraftAvatar((current) => ({ ...current, bottomColor: bottomColor as AvatarAppearance["bottomColor"] }))} />
                <AvatarSwatches label="Sapatos" values={AVATAR_SHOE_COLORS} value={draftAvatar.shoeColor} onChange={(shoeColor) => setDraftAvatar((current) => ({ ...current, shoeColor: shoeColor as AvatarAppearance["shoeColor"] }))} />
                <fieldset className="avatar-fieldset"><legend>Acessórios</legend><div className="avatar-choice-grid">{AVATAR_ACCESSORIES.map((accessory) => <button type="button" key={accessory} className={draftAvatar.accessories.includes(accessory) ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, accessories: current.accessories.includes(accessory) ? current.accessories.filter((item) => item !== accessory) : [...current.accessories, accessory] }))}>{accessoryLabels[accessory]}</button>)}</div></fieldset>
              </div>
            </div>
            {avatarError && <p className="avatar-save-error">{avatarError}</p>}
            <footer><button className="avatar-cancel" onClick={() => setEditorOpen(false)}>Cancelar</button><button className="avatar-save" onClick={saveAvatar} disabled={avatarSaving}>{avatarSaving ? "Salvando…" : <><Check /> Salvar personagem</>}</button></footer>
          </section>
        </div>
      )}

      {officeEditorOpen && (
        <div className="office-customizer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOfficeEditorOpen(false); }}>
          <section className="office-customizer" role="dialog" aria-modal="true" aria-labelledby="office-customizer-title">
            <header><div><span>PERSONALIZAR ESCRITÓRIO</span><h2 id="office-customizer-title">Dê identidade ao seu espaço</h2><p>Escolha o clima visual e os detalhes do escritório. A preferência fica salva neste dispositivo.</p></div><button onClick={() => setOfficeEditorOpen(false)} aria-label="Fechar"><X /></button></header>
            <div className="office-theme-grid">
              <button className={officeTheme === "day" ? "selected" : ""} onClick={() => setOfficeTheme("day")}><i className="theme-preview theme-preview-day" /><strong>Estúdio claro</strong><small>madeira e luz natural</small></button>
              <button className={officeTheme === "neon" ? "selected" : ""} onClick={() => setOfficeTheme("neon")}><i className="theme-preview theme-preview-neon" /><strong>Neon noturno</strong><small>energia de coworking</small></button>
              <button className={officeTheme === "studio" ? "selected" : ""} onClick={() => setOfficeTheme("studio")}><i className="theme-preview theme-preview-studio" /><strong>Estúdio criativo</strong><small>cores de design</small></button>
            </div>
            <button className={`decor-toggle ${decorationsVisible ? "selected" : ""}`} onClick={() => setDecorationsVisible((visible) => !visible)}><span className="decor-toggle-icon">✦</span><span><strong>Detalhes do escritório</strong><small>Janelas, impressora e café na área comum</small></span><b>{decorationsVisible ? "Visíveis" : "Ocultos"}</b></button>
          </section>
        </div>
      )}

      {inviteOpen && <InviteModal organizationId={organization.id} onClose={() => setInviteOpen(false)} />}

      {media && <div className="call-overlay" data-lk-theme="default">
        <LiveKitRoom token={media.token} serverUrl={media.serverUrl} connect audio video={false} onDisconnected={() => setMedia(null)}>
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>}
    </main>
  );
}
