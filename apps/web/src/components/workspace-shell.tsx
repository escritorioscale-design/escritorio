"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react";
import {
  Bell, Camera, CalendarDays, Check, ChevronDown, Grid2X2, Lock, LockOpen, LayoutGrid, LogOut, MessageSquare,
  Mic, Palette, Plus, Search, Settings, Users, Video, Volume2, X,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarCharacter, type AvatarDirection } from "@/components/avatar-character";
import { InviteModal } from "@/components/invite-modal";
import { OfficeBuilder, type LocalMoveState } from "@/components/office-builder";
import { OfficeEditor } from "@/components/office-editor";
import { audioRoomAt, canHear, isRoomWide, ProximityVoice, PROXIMITY_SILENT_TILES } from "@/components/proximity-voice";
import { signOut } from "@/lib/auth-client";
import { LIMEZU_LABELS, LIMEZU_SKINS } from "@/lib/limezu-sprites";
import { resolveOfficeLayout, SEAT_LOCK_RADIUS, type OfficeLayout, type Rect } from "@/lib/office-layout";
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
  photo?: string | null;
  x: number;
  y: number;
  status: string;
  direction?: AvatarDirection;
  moving?: boolean;
  sitting?: boolean;
  seatId?: string | null;
  seatLocked?: boolean;
};
type MediaGrant = { token: string; serverUrl: string };
type Point = { x: number; y: number };

type Props = {
  user: { id: string; name: string; email: string; avatar: AvatarAppearance; photo: string | null };
  organization: { id: string; name: string; role: string };
  workspace: { id: string; name: string };
  space: { id: string; name: string };
  rooms: RoomData[];
  officeLayout?: OfficeLayout;
};

type OfficeTheme = "day" | "neon" | "studio";

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

const CONNECTION_LABEL = { online: "Tempo real conectado", connecting: "Conectando…", offline: "Modo offline" } as const;

export function WorkspaceShell({ user, organization, workspace, space, rooms, officeLayout }: Props) {
  const [layout, setLayout] = useState<OfficeLayout>(() => resolveOfficeLayout(officeLayout));
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const canEditLayout = organization.role === "owner" || organization.role === "admin";
  const [position, setPosition] = useState({ x: 49, y: 50 });
  const [direction, setDirection] = useState<AvatarDirection>("down");
  const [moving, setMoving] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [people, setPeople] = useState<Record<string, Presence>>({});
  const [connection, setConnection] = useState<"connecting" | "online" | "offline">("connecting");
  const [media, setMedia] = useState<MediaGrant | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [ambient, setAmbient] = useState<MediaGrant | null>(null);
  const [ambientError, setAmbientError] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [seatLocked, setSeatLocked] = useState(false);
  const [avatar, setAvatar] = useState(user.avatar);
  const [draftAvatar, setDraftAvatar] = useState(user.avatar);
  const [photo, setPhoto] = useState(user.photo);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [officeEditorOpen, setOfficeEditorOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [officeTheme, setOfficeTheme] = useState<OfficeTheme>("day");
  const socketRef = useRef<Socket | null>(null);
  const positionRef = useRef(position);
  const directionRef = useRef<AvatarDirection>("down");
  const movingRef = useRef(false);
  const sittingRef = useRef(false);
  const seatIdRef = useRef<string | null>(null);
  const seatLockedRef = useRef(false);
  const lastEmitRef = useRef(0);

  const occupiedSeatIds = useMemo(
    () => new Set(Object.values(people).map((person) => person.seatId).filter((id): id is string => Boolean(id))),
    [people],
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("orbit-office-preferences") ?? "null") as { theme?: OfficeTheme } | null;
      if (saved?.theme === "day" || saved?.theme === "neon" || saved?.theme === "studio") setOfficeTheme(saved.theme);
    } catch { /* use the default office look */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("orbit-office-preferences", JSON.stringify({ theme: officeTheme }));
  }, [officeTheme]);

  const emitMovement = useCallback((
    next: Point, nextDirection: AvatarDirection, nextMoving: boolean, force = false,
    nextSitting = sittingRef.current, nextSeatId = seatIdRef.current, nextSeatLocked = seatLockedRef.current,
  ) => {
    const now = performance.now();
    if (!force && now - lastEmitRef.current < 75) return;
    lastEmitRef.current = now;
    socketRef.current?.emit("position:update", {
      ...next, direction: nextDirection, moving: nextMoving,
      sitting: nextSitting, seatId: nextSeatId, seatLocked: nextSitting && nextSeatLocked,
    });
  }, []);

  function toggleSeatLock() {
    const next = !seatLockedRef.current;
    seatLockedRef.current = next;
    setSeatLocked(next);
    emitMovement(positionRef.current, directionRef.current, movingRef.current, true, sittingRef.current, seatIdRef.current, next);
  }

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
    let cancelled = false;
    async function connectAmbient() {
      try {
        const response = await fetch("/api/livekit/ambient-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id }),
        });
        if (!response.ok) throw new Error("token");
        const grant = await response.json();
        if (!cancelled) setAmbient(grant);
      } catch {
        if (!cancelled) setAmbientError("Voz por proximidade indisponível no momento.");
      }
    }
    connectAmbient();
    return () => { cancelled = true; };
  }, [workspace.id]);

  const handleLocalUpdate = useCallback((state: LocalMoveState) => {
    const changedActivity = state.moving !== movingRef.current || state.sitting !== sittingRef.current || state.seatId !== seatIdRef.current;
    const next = { x: state.xPercent, y: state.yPercent };
    positionRef.current = next;
    setPosition(next);
    if (state.direction !== directionRef.current) {
      directionRef.current = state.direction;
      setDirection(state.direction);
    }
    if (state.moving !== movingRef.current) {
      movingRef.current = state.moving;
      setMoving(state.moving);
    }
    if (state.sitting !== sittingRef.current) {
      sittingRef.current = state.sitting;
      setSitting(state.sitting);
      // Standing up drops the lock — it only makes sense while at the desk.
      if (!state.sitting && seatLockedRef.current) {
        seatLockedRef.current = false;
        setSeatLocked(false);
      }
    }
    seatIdRef.current = state.seatId;
    emitMovement(next, state.direction, state.moving, changedActivity, state.sitting, state.seatId);
  }, [emitMovement]);

  const selfSeatState = useMemo(() => ({ sitting, seatLocked }), [sitting, seatLocked]);
  const peerInfo = useMemo(
    () => Object.fromEntries(Object.values(people).map((person) => [
      person.userId,
      { x: person.x, y: person.y, sitting: person.sitting, seatLocked: person.seatLocked },
    ])),
    [people],
  );
  const nearby = useMemo(
    () => Object.values(people).filter((person) => canHear(layout, position, person, selfSeatState, { sitting: person.sitting, seatLocked: person.seatLocked })),
    [people, position, layout, selfSeatState],
  );
  // A room-wide room is one bubble, so the desk radii would be a lie there.
  const roomWideZone = useMemo(() => {
    const room = audioRoomAt(layout, position);
    return isRoomWide(room) ? room : null;
  }, [layout, position]);
  const nearbyForVideo = useMemo(
    () => nearby.map((person) => ({ userId: person.userId, name: person.name, photo: person.photo })),
    [nearby],
  );
  // Other people's self-locked desks are temporary solid obstacles — nobody
  // else can walk into that little bubble while it's up.
  const lockedZones = useMemo<Rect[]>(
    () => Object.values(people).filter((person) => person.sitting && person.seatLocked).map((person) => {
      const tx = (person.x / 100) * layout.mapCols, ty = (person.y / 100) * layout.mapRows;
      return { x: tx - SEAT_LOCK_RADIUS, y: ty - SEAT_LOCK_RADIUS, w: SEAT_LOCK_RADIUS * 2, h: SEAT_LOCK_RADIUS * 2 };
    }),
    [people, layout],
  );
  const meetingRoom = rooms.find((room) => room.kind === "MEETING") ?? rooms[0];

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

  function resizeToDataUrl(file: File, size = 96): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas")); return; }
        const scale = Math.max(size / image.width, size / image.height);
        const w = image.width * scale, h = image.height * scale;
        ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
        URL.revokeObjectURL(image.src);
      };
      image.onerror = () => reject(new Error("load"));
      image.src = URL.createObjectURL(file);
    });
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    setPhotoError("");
    try {
      const dataUrl = await resizeToDataUrl(file);
      const response = await fetch("/api/profile/photo", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!response.ok) throw new Error("save");
      setPhoto(dataUrl);
      socketRef.current?.emit("photo:update", dataUrl);
    } catch {
      setPhotoError("Não foi possível salvar a foto. Tente uma imagem menor.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function removePhoto() {
    setPhotoUploading(true);
    setPhotoError("");
    try {
      await fetch("/api/profile/photo", { method: "DELETE" });
      setPhoto(null);
      socketRef.current?.emit("photo:update", null);
    } catch {
      setPhotoError("Não foi possível remover a foto.");
    } finally {
      setPhotoUploading(false);
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
            {canEditLayout && (
              <button className="customize" onClick={() => setLayoutEditorOpen(true)}><LayoutGrid /> Editar layout</button>
            )}
            <button className="customize" onClick={openAvatarEditor}><Palette /> Personagem</button>
            {(organization.role === "owner" || organization.role === "admin") && (
              <button className="invite" onClick={() => setInviteOpen(true)}><Plus /> Convidar</button>
            )}
            <button aria-label="Sair" onClick={() => signOut({ fetchOptions: { onSuccess: () => location.assign("/login") } })}><LogOut /></button>
          </div>
        </header>

        <div className="office-content">
          <section className={`map-stage office-theme-${officeTheme}`}>
            <OfficeBuilder
              layout={layout}
              peers={Object.values(people)}
              theme={officeTheme}
              occupiedSeatIds={occupiedSeatIds}
              lockedZones={lockedZones}
              onUpdate={handleLocalUpdate}
              active={!editorOpen && !officeEditorOpen && !layoutEditorOpen}
              showStatus
              live={{ tone: connection, label: CONNECTION_LABEL[connection] }}
            >
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
              {roomWideZone ? (
                <div
                  className="audio-room-zone"
                  style={{
                    left: `${(roomWideZone.x / layout.mapCols) * 100}%`,
                    top: `${(roomWideZone.y / layout.mapRows) * 100}%`,
                    width: `${(roomWideZone.w / layout.mapCols) * 100}%`,
                    height: `${(roomWideZone.h / layout.mapRows) * 100}%`,
                  }}
                  aria-label={`Toda a sala ${roomWideZone.name} ouve esta conversa`}
                />
              ) : (
                <>
                  <div
                    className={`proximity-zone ${seatLocked ? "locked" : ""}`}
                    style={{
                      left: `${position.x}%`, top: `${position.y}%`,
                      width: `${(((seatLocked ? SEAT_LOCK_RADIUS : PROXIMITY_SILENT_TILES) * 2) / layout.mapCols) * 100}%`,
                      height: `${(((seatLocked ? SEAT_LOCK_RADIUS : PROXIMITY_SILENT_TILES) * 2) / layout.mapRows) * 100}%`,
                    }}
                  />
                  {sitting && (
                    <div
                      className={`seat-block-zone ${seatLocked ? "locked" : ""}`}
                      style={{
                        left: `${position.x}%`, top: `${position.y}%`,
                        width: `${((SEAT_LOCK_RADIUS * 2) / layout.mapCols) * 100}%`,
                        height: `${((SEAT_LOCK_RADIUS * 2) / layout.mapRows) * 100}%`,
                      }}
                      aria-label={seatLocked ? "Área que você bloqueia" : "Área que você bloquearia ao trancar a mesa"}
                    />
                  )}
                </>
              )}
              <div
                className="map-character self-character"
                style={{ left: `${position.x}%`, top: `${position.y}%`, zIndex: Math.round(20 + position.y) }}
                aria-label="Seu personagem"
              >
                <AvatarCharacter appearance={avatar} direction={direction} moving={moving} sitting={sitting} />
                <label>Você</label>
              </div>
            </OfficeBuilder>
            <div className="proximity-controls">
              <button
                type="button"
                className={`mic-toggle ${micOn ? "on" : "off"}`}
                onClick={() => setMicOn((current) => !current)}
                aria-pressed={micOn}
                aria-label={micOn ? "Silenciar microfone" : "Ativar microfone"}
              >
                <Mic /> {micOn ? "Voz por proximidade ativa" : "Microfone mudo"}
              </button>
              <button
                type="button"
                className={`mic-toggle ${cameraOn ? "on" : "off"}`}
                onClick={() => setCameraOn((current) => !current)}
                aria-pressed={cameraOn}
                aria-label={cameraOn ? "Desligar câmera" : "Ligar câmera"}
              >
                <Camera /> {cameraOn ? "Câmera ligada" : "Câmera desligada"}
              </button>
              {sitting && (
                <button
                  type="button"
                  className={`mic-toggle seat-lock-toggle ${seatLocked ? "on" : "off"}`}
                  onClick={toggleSeatLock}
                  aria-pressed={seatLocked}
                  aria-label={seatLocked ? "Destrancar minha mesa" : "Trancar minha mesa"}
                >
                  {seatLocked ? <Lock /> : <LockOpen />} {seatLocked ? "Mesa trancada" : "Trancar minha mesa"}
                </button>
              )}
            </div>
            {ambient && !media && (
              <ProximityVoice
                token={ambient.token}
                serverUrl={ambient.serverUrl}
                layout={layout}
                selfPosition={position}
                selfSeat={selfSeatState}
                peers={peerInfo}
                nearby={nearbyForVideo}
                self={{ name: user.name, photo }}
                micOn={micOn}
                cameraOn={cameraOn}
                onError={setAmbientError}
              />
            )}
          </section>

          <aside className="people-panel">
            <div className="panel-title"><h2>Agora</h2><Volume2 /></div>
            <section className="meeting-card"><span>REUNIÃO ABERTA</span><h3>Daily de produto</h3><p>Auditório · até 24 pessoas</p><button onClick={() => joinCall()}><Video /> Entrar na reunião</button></section>
            <section className="office-plan"><span>LAYOUT DO ESCRITÓRIO</span><strong>{layout.rooms.length} salas · totalmente personalizável</strong><p>Sala geral, criação e gerência ficam no corredor superior; os squads embaixo.</p></section>
            {mediaError && <p className="media-error">{mediaError}</p>}
            {ambientError && <p className="media-error">{ambientError}</p>}
            <div className="people-heading"><span>PESSOAS POR PERTO</span><b>{nearby.length}</b></div>
            {nearby.length ? nearby.map((person) => (
              <button className="person-row" key={person.userId} onClick={() => joinCall()}>
                <span className="person-avatar"><AvatarCharacter appearance={normalizeAvatar(person.avatar)} compact /></span>
                <div><strong>{person.name}</strong><small>Você já pode ouvir</small></div><Mic />
              </button>
            )) : <div className="nearby-empty"><Users /><p>Aproxime-se de alguém no mapa para conversar por voz.</p></div>}
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
                <fieldset className="avatar-fieldset avatar-photo-fieldset">
                  <legend>Foto de perfil</legend>
                  <p className="avatar-photo-hint">Aparece na videochamada por proximidade quando sua câmera está desligada.</p>
                  <div className="avatar-photo-row">
                    <span className="avatar-photo-preview">
                      {photo ? <img src={photo} alt="" /> : <span className="avatar-photo-placeholder">{user.name.slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <label className="avatar-photo-upload">
                      {photoUploading ? "Enviando…" : "Escolher foto"}
                      <input
                        type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={photoUploading}
                        onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadPhoto(file); event.target.value = ""; }}
                      />
                    </label>
                    {photo && <button type="button" className="avatar-photo-remove" onClick={removePhoto} disabled={photoUploading}>Remover</button>}
                  </div>
                  {photoError && <p className="avatar-save-error">{photoError}</p>}
                </fieldset>
                <fieldset className="avatar-fieldset">
                  <legend>Visual</legend>
                  <div className="avatar-choice-grid">
                    <button type="button" className={draftAvatar.skin === "custom" ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, skin: "custom" }))}>Personalizado</button>
                    {LIMEZU_SKINS.map((skin) => (
                      <button type="button" key={skin} className={draftAvatar.skin === skin ? "selected" : ""} onClick={() => setDraftAvatar((current) => ({ ...current, skin }))}>{LIMEZU_LABELS[skin]}</button>
                    ))}
                  </div>
                </fieldset>
                {draftAvatar.skin === "custom" && <>
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
                </>}
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
            <header><div><span>PERSONALIZAR ESCRITÓRIO</span><h2 id="office-customizer-title">Dê identidade ao seu espaço</h2><p>Escolha o clima visual do escritório. A preferência fica salva neste dispositivo.</p></div><button onClick={() => setOfficeEditorOpen(false)} aria-label="Fechar"><X /></button></header>
            <div className="office-theme-grid">
              <button className={officeTheme === "day" ? "selected" : ""} onClick={() => setOfficeTheme("day")}><i className="theme-preview theme-preview-day" /><strong>Estúdio claro</strong><small>madeira e luz natural</small></button>
              <button className={officeTheme === "neon" ? "selected" : ""} onClick={() => setOfficeTheme("neon")}><i className="theme-preview theme-preview-neon" /><strong>Neon noturno</strong><small>energia de coworking</small></button>
              <button className={officeTheme === "studio" ? "selected" : ""} onClick={() => setOfficeTheme("studio")}><i className="theme-preview theme-preview-studio" /><strong>Estúdio criativo</strong><small>cores de design</small></button>
            </div>
          </section>
        </div>
      )}

      {layoutEditorOpen && canEditLayout && (
        <OfficeEditor
          initialLayout={layout}
          workspaceId={workspace.id}
          spaceId={space.id}
          onClose={() => setLayoutEditorOpen(false)}
          onSaved={setLayout}
        />
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
