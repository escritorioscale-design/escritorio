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
import { CloudflareProximityVoice } from "@/components/cloudflare-proximity-voice";
import { InviteModal } from "@/components/invite-modal";
import { OfficeBuilder, type LocalMoveState, type MoveCommand, type TableZoneView } from "@/components/office-builder";
import { OfficeEditor } from "@/components/office-editor";
import { audioRoomAt, canHear, isRoomWide, ProximityVoice, PROXIMITY_SILENT_TILES } from "@/components/proximity-voice";
import { signOut } from "@/lib/auth-client";
import { LIMEZU_LABELS, LIMEZU_SKINS } from "@/lib/limezu-sprites";
import {
  getConversationTables, isInsideTable, resolveOfficeLayout, tableForSeat, tableRect,
  TABLE_REVEAL_DISTANCE, type OfficeLayout,
} from "@/lib/office-layout";
import type { RestrictedZone } from "@/lib/office-simulation";
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
  lockId?: string | null;
};
type MediaGrant = { token: string; serverUrl: string };
type Point = { x: number; y: number };
type AccessRequest = { requesterId: string; requesterName: string; lockId: string };
type ComeRequest = { requesterId: string; requesterName: string; x: number; y: number };

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
const USE_CLOUDFLARE_MEDIA = process.env.NEXT_PUBLIC_MEDIA_PROVIDER === "cloudflare";

export function WorkspaceShell({ user, organization, workspace, space, rooms, officeLayout }: Props) {
  const [layout, setLayout] = useState<OfficeLayout>(() => resolveOfficeLayout(officeLayout));
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const canEditLayout = organization.role === "owner" || organization.role === "admin";
  const [position, setPosition] = useState({ x: 49, y: 50 });
  const [direction, setDirection] = useState<AvatarDirection>("down");
  const [moving, setMoving] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [people, setPeople] = useState<Record<string, Presence>>({});
  const [connection, setConnection] = useState<"connecting" | "online" | "offline">("connecting");
  const [media, setMedia] = useState<MediaGrant | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [ambient, setAmbient] = useState<MediaGrant | null>(null);
  const [ambientError, setAmbientError] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [lockId, setLockId] = useState<string | null>(null);
  const [accessGrants, setAccessGrants] = useState<Record<string, string>>({});
  const [requestedLocks, setRequestedLocks] = useState<Record<string, string>>({});
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [comeRequests, setComeRequests] = useState<ComeRequest[]>([]);
  const [moveCommand, setMoveCommand] = useState<MoveCommand | null>(null);
  const [personMenu, setPersonMenu] = useState<{ person: Presence; x: number; y: number } | null>(null);
  const [actionFeedback, setActionFeedback] = useState("");
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
  const lockIdRef = useRef<string | null>(null);
  const lastEmitRef = useRef(0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const occupiedSeatIds = useMemo(
    () => new Set(Object.values(people).map((person) => person.seatId).filter((id): id is string => Boolean(id))),
    [people],
  );
  const conversationTables = useMemo(() => getConversationTables(layout), [layout]);

  const showFeedback = useCallback((message: string) => {
    setActionFeedback(message);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setActionFeedback(""), 3500);
  }, []);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

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
    nextSitting = sittingRef.current, nextSeatId = seatIdRef.current, nextLockId = lockIdRef.current,
  ) => {
    const now = performance.now();
    if (!force && now - lastEmitRef.current < 75) return;
    lastEmitRef.current = now;
    socketRef.current?.emit("position:update", {
      ...next, direction: nextDirection, moving: nextMoving,
      sitting: nextSitting, seatId: nextSeatId, lockId: nextSitting ? nextLockId : null,
    });
  }, []);

  function toggleSeatLock() {
    const table = tableForSeat(layout, seatIdRef.current);
    if (!sittingRef.current || !table) return;
    const otherLock = Object.values(people).find((person) => person.sitting && person.lockId && tableForSeat(layout, person.seatId)?.id === table.id);
    if (!lockIdRef.current && otherLock) {
      showFeedback(`${otherLock.name} já trancou esta mesa.`);
      return;
    }
    const next = lockIdRef.current ? null : crypto.randomUUID();
    lockIdRef.current = next;
    setLockId(next);
    if (!next) setAccessRequests([]);
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
            moving: movingRef.current,
            sitting: sittingRef.current,
            seatId: seatIdRef.current,
            lockId: sittingRef.current ? lockIdRef.current : null,
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
        socket.on("table:access-requested", (request: AccessRequest) => {
          if (lockIdRef.current === request.lockId) setAccessRequests((current) => current.some((item) => item.requesterId === request.requesterId && item.lockId === request.lockId) ? current : [...current, request]);
        });
        socket.on("table:access-resolved", ({ ownerId, ownerName, lockId: grantedLock, approved }: { ownerId: string; ownerName: string; lockId: string; approved: boolean }) => {
          setRequestedLocks((current) => { const next = { ...current }; delete next[ownerId]; return next; });
          if (approved) {
            setAccessGrants((current) => ({ ...current, [ownerId]: grantedLock }));
            showFeedback(`${ownerName} liberou sua entrada.`);
          } else showFeedback(`${ownerName} não liberou a entrada.`);
        });
        socket.on("presence:come-requested", (request: ComeRequest) => setComeRequests((current) => current.some((item) => item.requesterId === request.requesterId) ? current : [...current, request]));
        socket.on("presence:come-resolved", ({ targetName, approved }: { targetName: string; approved: boolean }) => {
          showFeedback(approved ? `${targetName} aceitou e está a caminho.` : `${targetName} recusou o convite.`);
        });
      } catch {
        setConnection("offline");
      }
    }
    connect();
    return () => { cancelled = true; socket?.disconnect(); };
  }, [showFeedback, user.id, workspace.id]);

  useEffect(() => {
    if (USE_CLOUDFLARE_MEDIA) {
      setAmbient(null);
      setAmbientError("");
      return;
    }
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
      if (!state.sitting && lockIdRef.current) {
        lockIdRef.current = null;
        setLockId(null);
        setAccessRequests([]);
      }
    }
    seatIdRef.current = state.seatId;
    setSeatId(state.seatId);
    emitMovement(next, state.direction, state.moving, changedActivity, state.sitting, state.seatId);
  }, [emitMovement]);

  const selfSeatState = useMemo(() => ({ sitting, seatId, lockId }), [sitting, seatId, lockId]);
  const peerInfo = useMemo(
    () => Object.fromEntries(Object.values(people).map((person) => [
      person.userId,
      { x: person.x, y: person.y, sitting: person.sitting, seatId: person.seatId, lockId: person.lockId },
    ])),
    [people],
  );
  const nearby = useMemo(
    () => Object.values(people).filter((person) => canHear(layout, position, person, selfSeatState, { sitting: person.sitting, seatId: person.seatId, lockId: person.lockId })),
    [people, position, layout, selfSeatState],
  );
  // A room-wide room is one bubble, so the desk radii would be a lie there.
  const roomWideZone = useMemo(() => {
    const room = audioRoomAt(layout, position);
    return isRoomWide(room) ? room : null;
  }, [layout, position]);
  const nearbyForVideo = useMemo(
    () => [...nearby].filter((person) => Math.hypot(
      (person.x - position.x) * layout.mapCols / 100,
      (person.y - position.y) * layout.mapRows / 100,
    ) <= PROXIMITY_SILENT_TILES).sort((a, b) => Math.hypot(
      (a.x - position.x) * layout.mapCols / 100,
      (a.y - position.y) * layout.mapRows / 100,
    ) - Math.hypot(
      (b.x - position.x) * layout.mapCols / 100,
      (b.y - position.y) * layout.mapRows / 100,
    )).slice(0, 3).map((person) => ({ userId: person.userId, name: person.name, photo: person.photo })),
    [nearby, position, layout],
  );

  useEffect(() => {
    if (!nearby.length && cameraOn) setCameraOn(false);
  }, [cameraOn, nearby.length]);
  // Other people's self-locked desks are temporary solid obstacles — nobody
  // else can walk into that little bubble while it's up.
  const selfTile = useMemo(() => ({ x: position.x * layout.mapCols / 100, y: position.y * layout.mapRows / 100 }), [position, layout]);
  const tableBySeat = useMemo(() => new Map(conversationTables.flatMap((table) => table.seatIds.map((id) => [id, table] as const))), [conversationTables]);
  const selfTable = seatId ? tableBySeat.get(seatId) : undefined;
  const tableZones = useMemo<TableZoneView[]>(() => conversationTables.flatMap((table) => {
    const occupants = Object.values(people).filter((person) => person.sitting && person.seatId && table.seatIds.includes(person.seatId));
    const isOwn = Boolean(sitting && seatId && table.seatIds.includes(seatId));
    if (!occupants.length && !isOwn) return [];
    if (!isOwn && !isInsideTable(table, selfTile, TABLE_REVEAL_DISTANCE)) return [];
    const locked = Boolean((isOwn && lockId) || occupants.some((person) => person.lockId));
    const names = [...(isOwn ? ["você"] : []), ...occupants.map((person) => person.name)].join(", ");
    return [{ id: table.id, rect: tableRect(table), locked, own: isOwn, label: names }];
  }), [conversationTables, people, sitting, seatId, selfTile, lockId]);
  const lockedTableOwners = useMemo(() => {
    const seen = new Set<string>();
    return Object.values(people).flatMap((person) => {
      if (!person.sitting || !person.seatId || !person.lockId) return [];
      const table = tableBySeat.get(person.seatId);
      if (!table || seen.has(table.id)) return [];
      seen.add(table.id);
      return [{ person, table }];
    });
  }, [people, tableBySeat]);
  const lockedZones = useMemo<RestrictedZone[]>(
    () => lockedTableOwners.flatMap(({ person, table }) => accessGrants[person.userId] === person.lockId
      ? [] : [{ id: person.lockId!, rect: tableRect(table) }]),
    [lockedTableOwners, accessGrants],
  );
  const nearbyLockedTable = useMemo(() => lockedTableOwners
    .filter(({ person, table }) => accessGrants[person.userId] !== person.lockId
      && !isInsideTable(table, selfTile)
      && isInsideTable(table, selfTile, TABLE_REVEAL_DISTANCE))
    .sort((a, b) => Math.hypot(a.table.x - selfTile.x, a.table.y - selfTile.y) - Math.hypot(b.table.x - selfTile.x, b.table.y - selfTile.y))[0],
  [lockedTableOwners, accessGrants, selfTile]);
  const meetingRoom = rooms.find((room) => room.kind === "MEETING") ?? rooms[0];

  useEffect(() => {
    if (!personMenu) return;
    const close = () => setPersonMenu(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", escape); };
  }, [personMenu]);

  function requestTableAccess() {
    if (!nearbyLockedTable?.person.lockId) return;
    socketRef.current?.emit("table:access-request", { ownerId: nearbyLockedTable.person.userId, lockId: nearbyLockedTable.person.lockId });
    setRequestedLocks((current) => ({ ...current, [nearbyLockedTable.person.userId]: nearbyLockedTable.person.lockId! }));
    showFeedback(`Solicitação enviada para ${nearbyLockedTable.person.name}.`);
  }

  function resolveAccessRequest(request: AccessRequest, approved: boolean) {
    socketRef.current?.emit("table:access-response", { requesterId: request.requesterId, lockId: request.lockId, approved });
    setAccessRequests((current) => current.filter((item) => item !== request));
  }

  function askPersonToCome(person: Presence) {
    socketRef.current?.emit("presence:come-request", { targetId: person.userId });
    setPersonMenu(null);
    showFeedback(`Convite enviado para ${person.name}.`);
  }

  function resolveComeRequest(request: ComeRequest, approved: boolean) {
    socketRef.current?.emit("presence:come-response", { requesterId: request.requesterId, approved });
    if (approved) setMoveCommand({ id: `${request.requesterId}:${Date.now()}`, x: request.x, y: request.y });
    setComeRequests((current) => current.filter((item) => item !== request));
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
              tableZones={tableZones}
              moveCommand={moveCommand}
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
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setPersonMenu({ person, x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 80) });
                  }}
                >
                  <AvatarCharacter appearance={normalizeAvatar(person.avatar)} direction={person.direction} moving={person.moving} sitting={person.sitting} />
                  <label>{person.name}</label>
                </div>
              ))}
              {!sitting && roomWideZone ? (
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
              ) : !sitting ? (
                  <div
                    className="proximity-zone"
                    style={{
                      left: `${position.x}%`, top: `${position.y}%`,
                      width: `${((PROXIMITY_SILENT_TILES * 2) / layout.mapCols) * 100}%`,
                      height: `${((PROXIMITY_SILENT_TILES * 2) / layout.mapRows) * 100}%`,
                    }}
                  />
              ) : null}
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
                disabled={!nearby.length}
                aria-pressed={micOn}
                aria-label={!nearby.length ? "Aproxime-se de alguém para ativar o microfone" : micOn ? "Silenciar microfone" : "Ativar microfone"}
              >
                <Mic /> {!nearby.length ? "Voz disponível por proximidade" : micOn ? "Voz por proximidade ativa" : "Microfone mudo"}
              </button>
              <button
                type="button"
                className={`mic-toggle ${cameraOn ? "on" : "off"}`}
                onClick={() => setCameraOn((current) => !current)}
                disabled={!nearby.length}
                aria-pressed={cameraOn}
                aria-label={!nearby.length ? "Aproxime-se de alguém para ativar a câmera" : cameraOn ? "Desligar câmera" : "Ligar câmera"}
              >
                <Camera /> {!nearby.length ? "Câmera disponível por proximidade" : cameraOn ? "Câmera ligada" : "Câmera desligada"}
              </button>
              {sitting && selfTable && (
                <button
                  type="button"
                  className={`mic-toggle seat-lock-toggle ${lockId ? "on" : "off"}`}
                  onClick={toggleSeatLock}
                  aria-pressed={Boolean(lockId)}
                  aria-label={lockId ? "Destrancar minha mesa" : "Trancar minha mesa"}
                >
                  {lockId ? <Lock /> : <LockOpen />} {lockId ? "Mesa trancada" : "Trancar minha mesa"}
                </button>
              )}
              {nearbyLockedTable && (
                <button
                  type="button"
                  className="mic-toggle table-access-button"
                  onClick={requestTableAccess}
                  disabled={requestedLocks[nearbyLockedTable.person.userId] === nearbyLockedTable.person.lockId}
                >
                  <LockOpen /> {requestedLocks[nearbyLockedTable.person.userId] === nearbyLockedTable.person.lockId
                    ? "Entrada solicitada" : `Solicitar entrada · ${nearbyLockedTable.person.name}`}
                </button>
              )}
            </div>
            {USE_CLOUDFLARE_MEDIA && socketRef.current && !media && nearby.length > 0 && (
              <CloudflareProximityVoice
                socket={socketRef.current}
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
            {!USE_CLOUDFLARE_MEDIA && ambient && !media && nearby.length > 0 && (
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

      {(accessRequests.length > 0 || comeRequests.length > 0) && (
        <div className="office-request-stack" aria-live="polite">
          {accessRequests.map((request) => (
            <section className="office-request-card" key={`access:${request.requesterId}:${request.lockId}`}>
              <Lock />
              <div><strong>{request.requesterName} quer entrar</strong><span>Permitir acesso à área da sua mesa?</span></div>
              <button type="button" className="reject" onClick={() => resolveAccessRequest(request, false)}>Recusar</button>
              <button type="button" className="approve" onClick={() => resolveAccessRequest(request, true)}>Permitir</button>
            </section>
          ))}
          {comeRequests.map((request) => (
            <section className="office-request-card" key={`come:${request.requesterId}`}>
              <Users />
              <div><strong>{request.requesterName} chamou você</strong><span>Ir até essa pessoa agora?</span></div>
              <button type="button" className="reject" onClick={() => resolveComeRequest(request, false)}>Agora não</button>
              <button type="button" className="approve" onClick={() => resolveComeRequest(request, true)}>Ir até lá</button>
            </section>
          ))}
        </div>
      )}

      {personMenu && (
        <div className="person-context-menu" role="menu" style={{ left: personMenu.x, top: personMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => askPersonToCome(personMenu.person)}>
            <Users /> Pedir para {personMenu.person.name} vir até mim
          </button>
        </div>
      )}

      {actionFeedback && <div className="office-action-feedback" role="status">{actionFeedback}</div>}

      {media && <div className="call-overlay" data-lk-theme="default">
        <LiveKitRoom token={media.token} serverUrl={media.serverUrl} connect audio video={false} onDisconnected={() => setMedia(null)}>
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>}

    </main>
  );
}
