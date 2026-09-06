import "dotenv/config";
import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { jwtVerify, type JWTPayload } from "jose";
import { createClient, type RedisClientType } from "redis";
import { Server, type Socket } from "socket.io";
import { z } from "zod";

const port = Number(process.env.PORT ?? 3101);
const secret = process.env.REALTIME_TOKEN_SECRET;
if (!secret) throw new Error("REALTIME_TOKEN_SECRET is required");

const origin = process.env.WEB_ORIGIN?.split(",").map((value) => value.trim()) ?? ["http://localhost:3100"];
const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "orbit-realtime" }));
    return;
  }
  response.writeHead(404).end();
});

const io = new Server(httpServer, {
  cors: { origin, credentials: true },
  transports: ["websocket"],
  pingInterval: 20_000,
  pingTimeout: 10_000,
  maxHttpBufferSize: 64 * 1024,
});

type Claims = JWTPayload & {
  workspaceId: string;
  organizationId: string;
  name: string;
  avatar?: unknown;
  photo?: string | null;
};
type OrbitSocket = Socket & { data: { claims: Claims; events: number[] } };
type Direction = "up" | "down" | "left" | "right";

const avatarInput = z.object({
  skinTone: z.enum(["#f6d2b8", "#e7b98f", "#c8895e", "#9b5f3f", "#70422f", "#3f271f"]),
  hairStyle: z.enum(["short", "bob", "curls", "bun"]),
  hairColor: z.enum(["#211b18", "#4a3026", "#7a4b2d", "#b8773e", "#d6b06a", "#8a2934", "#d8d4ce"]),
  topColor: z.enum(["#7257e8", "#397bd9", "#21a179", "#d84d68", "#e58c35", "#252529", "#f1efe9", "#d8ff63"]),
  bottomColor: z.enum(["#253047", "#3f526f", "#6a594c", "#242426", "#805f9b", "#d8d4ca"]),
  shoeColor: z.enum(["#f4f1e9", "#28282b", "#6e4935", "#d04a50"]),
  accessory: z.enum(["none", "glasses", "headphones"]),
}).strict();
type Avatar = z.infer<typeof avatarInput>;
type Presence = { userId: string; name: string; avatar?: Avatar; photo?: string | null; x: number; y: number; status: string; direction: Direction; moving: boolean; sitting: boolean; seatId: string | null; lockId: string | null; updatedAt: number };
type MediaTrackKind = "audio" | "video";
type MediaPublication = {
  userId: string;
  name: string;
  sessionId: string;
  tracks: { trackName: string; kind: MediaTrackKind }[];
};
const directionInput = z.enum(["up", "down", "left", "right"]);
const photoInput = z.string().max(30_000).regex(/^data:image\/(png|jpeg|webp);base64,/).nullable();

const presenceInput = z.object({
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  status: z.enum(["available", "focus", "away", "busy"]).default("available"),
  direction: directionInput.default("down"),
  moving: z.boolean().default(false),
  sitting: z.boolean().default(false),
  seatId: z.string().nullable().default(null),
  lockId: z.string().min(1).max(80).nullable().default(null),
});
const positionInput = presenceInput.pick({ x: true, y: true, direction: true, moving: true, sitting: true, seatId: true, lockId: true });
const userActionInput = z.object({ targetId: z.string().min(1).max(100) });
const accessRequestInput = z.object({ ownerId: z.string().min(1).max(100), lockId: z.string().min(1).max(80) });
const accessResponseInput = z.object({ requesterId: z.string().min(1).max(100), lockId: z.string().min(1).max(80), approved: z.boolean() });
const comeResponseInput = z.object({ requesterId: z.string().min(1).max(100), approved: z.boolean() });
const mediaDescriptionInput = z.object({
  type: z.enum(["offer", "answer"]),
  sdp: z.string().min(1).max(1_000_000),
});
const mediaPublishInput = z.object({
  sessionDescription: mediaDescriptionInput,
  tracks: z.array(z.object({
    mid: z.string().max(32).nullable(),
    trackName: z.string().min(1).max(160),
    kind: z.enum(["audio", "video"]),
  })).min(1).max(2),
});
const mediaPullInput = z.object({
  sessionId: z.string().min(1).max(160),
  audioUserIds: z.array(z.string().min(1).max(100)).max(24),
  videoUserIds: z.array(z.string().min(1).max(100)).max(3),
});
const mediaRenegotiateInput = z.object({
  sessionId: z.string().min(1).max(160),
  sessionDescription: mediaDescriptionInput,
});

let redis: RedisClientType | null = null;
const localPresence = new Map<string, Map<string, Presence>>();
const mediaPublications = new Map<string, Map<string, MediaPublication>>();
const mediaSessions = new Map<string, { publisher?: string; subscribers: Set<string> }>();

function cloudflareMediaConfigured() {
  return process.env.MEDIA_PROVIDER === "cloudflare"
    && Boolean(process.env.CLOUDFLARE_REALTIME_APP_ID)
    && Boolean(process.env.CLOUDFLARE_REALTIME_APP_SECRET);
}

async function cloudflareRequest(path: string, method: "POST" | "PUT", body?: unknown) {
  const appId = process.env.CLOUDFLARE_REALTIME_APP_ID;
  const appSecret = process.env.CLOUDFLARE_REALTIME_APP_SECRET;
  if (!cloudflareMediaConfigured() || !appId || !appSecret) throw new Error("cloudflare_media_not_configured");
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${appId}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${appSecret}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.errorCode) {
    console.error("[cloudflare-realtime] request failed", response.status, result.errorCode ?? "unknown");
    throw new Error("cloudflare_media_request_failed");
  }
  return result;
}

function mediaCatalog(workspaceId: string) {
  return [...(mediaPublications.get(workspaceId)?.values() ?? [])];
}

function broadcastMediaCatalog(workspaceId: string) {
  io.to(workspaceChannel(workspaceId)).emit("media:catalog", mediaCatalog(workspaceId));
}

function clearMediaPublication(workspaceId: string, userId: string, sessionId?: string) {
  const publications = mediaPublications.get(workspaceId);
  const current = publications?.get(userId);
  if (!current || (sessionId && current.sessionId !== sessionId)) return;
  publications?.delete(userId);
  if (!publications?.size) mediaPublications.delete(workspaceId);
  broadcastMediaCatalog(workspaceId);
}

async function configureRedis() {
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV === "production") throw new Error("REDIS_URL is required in production");
    console.warn("[realtime] Redis disabled; using single-node presence store");
    return;
  }
  const publisher = createClient({ url: process.env.REDIS_URL });
  const subscriber = publisher.duplicate();
  publisher.on("error", (error) => console.error("[redis]", error));
  subscriber.on("error", (error) => console.error("[redis:subscriber]", error));
  await Promise.all([publisher.connect(), subscriber.connect()]);
  io.adapter(createAdapter(publisher, subscriber));
  redis = publisher;
}

function workspaceChannel(workspaceId: string) { return `workspace:${workspaceId}`; }
function userChannel(workspaceId: string, userId: string) { return `workspace:${workspaceId}:user:${userId}`; }
function presenceKey(workspaceId: string) { return `orbit:presence:${workspaceId}`; }
function seenKey(workspaceId: string) { return `orbit:presence-seen:${workspaceId}`; }

async function savePresence(workspaceId: string, presence: Presence) {
  if (redis) {
    await redis.multi()
      .hSet(presenceKey(workspaceId), presence.userId, JSON.stringify(presence))
      .zAdd(seenKey(workspaceId), { score: presence.updatedAt, value: presence.userId })
      .expire(presenceKey(workspaceId), 86_400)
      .expire(seenKey(workspaceId), 86_400)
      .exec();
    return;
  }
  const state = localPresence.get(workspaceId) ?? new Map<string, Presence>();
  state.set(presence.userId, presence);
  localPresence.set(workspaceId, state);
}

async function removePresence(workspaceId: string, userId: string) {
  if (redis) {
    await redis.multi().hDel(presenceKey(workspaceId), userId).zRem(seenKey(workspaceId), userId).exec();
    return;
  }
  localPresence.get(workspaceId)?.delete(userId);
}

async function getPresence(workspaceId: string): Promise<Presence[]> {
  if (!redis) return [...(localPresence.get(workspaceId)?.values() ?? [])];
  const staleBefore = Date.now() - 45_000;
  const stale = await redis.zRangeByScore(seenKey(workspaceId), 0, staleBefore);
  if (stale.length) await redis.multi().hDel(presenceKey(workspaceId), stale).zRem(seenKey(workspaceId), stale).exec();
  const values = await redis.hVals(presenceKey(workspaceId));
  return values.flatMap((value) => {
    try { return [JSON.parse(value) as Presence]; } catch { return []; }
  });
}

function withinRateLimit(socket: OrbitSocket) {
  const now = Date.now();
  socket.data.events = socket.data.events.filter((timestamp: number) => now - timestamp < 1000);
  if (socket.data.events.length >= 24) return false;
  socket.data.events.push(now);
  return true;
}

io.use(async (rawSocket, next) => {
  const socket = rawSocket as OrbitSocket;
  try {
    const token = z.string().min(1).parse(socket.handshake.auth.token);
    const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
      audience: "orbit-realtime",
      issuer: "orbit-web",
      algorithms: ["HS256"],
    });
    const claims = verified.payload as Claims;
    if (!claims.sub || !claims.workspaceId || !claims.organizationId || !claims.name) throw new Error("invalid claims");
    socket.data.claims = claims;
    socket.data.events = [];
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", async (rawSocket) => {
  const socket = rawSocket as OrbitSocket;
  const claims = socket.data.claims;
  const workspaceId = claims.workspaceId;
  const userId = claims.sub!;
  const channel = workspaceChannel(workspaceId);
  let current: Presence | null = null;
  mediaSessions.set(socket.id, { subscribers: new Set() });
  await socket.join([channel, userChannel(workspaceId, userId)]);
  socket.emit("presence:snapshot", await getPresence(workspaceId));
  socket.emit("media:catalog", mediaCatalog(workspaceId));

  socket.on("presence:join", async (payload) => {
    const parsed = presenceInput.safeParse(payload);
    if (!parsed.success) return;
    const avatar = avatarInput.safeParse(claims.avatar);
    const photo = photoInput.safeParse(claims.photo ?? null);
    current = {
      userId, name: claims.name,
      avatar: avatar.success ? avatar.data : undefined,
      photo: photo.success ? photo.data : null,
      ...parsed.data, lockId: parsed.data.sitting ? parsed.data.lockId : null, updatedAt: Date.now(),
    };
    await savePresence(workspaceId, current);
    socket.to(channel).emit("presence:upsert", current);
  });

  socket.on("position:update", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = positionInput.safeParse(payload);
    if (!parsed.success) return;
    const reliable = current.sitting !== parsed.data.sitting || current.seatId !== parsed.data.seatId || current.lockId !== parsed.data.lockId;
    current = { ...current, ...parsed.data, lockId: parsed.data.sitting ? parsed.data.lockId : null, updatedAt: Date.now() };
    await savePresence(workspaceId, current);
    if (reliable) socket.to(channel).emit("presence:upsert", current);
    else socket.to(channel).volatile.emit("presence:upsert", current);
  });

  socket.on("avatar:update", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = avatarInput.safeParse(payload);
    if (!parsed.success) return;
    current = { ...current, avatar: parsed.data, updatedAt: Date.now() };
    await savePresence(workspaceId, current);
    socket.to(channel).emit("presence:upsert", current);
  });

  socket.on("photo:update", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = photoInput.safeParse(payload);
    if (!parsed.success) return;
    current = { ...current, photo: parsed.data, updatedAt: Date.now() };
    await savePresence(workspaceId, current);
    socket.to(channel).emit("presence:upsert", current);
  });

  socket.on("table:access-request", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = accessRequestInput.safeParse(payload);
    if (!parsed.success || parsed.data.ownerId === userId) return;
    const owner = (await getPresence(workspaceId)).find((person) => person.userId === parsed.data.ownerId);
    if (!owner?.sitting || owner.lockId !== parsed.data.lockId) return;
    io.to(userChannel(workspaceId, owner.userId)).emit("table:access-requested", {
      requesterId: userId,
      requesterName: current.name,
      lockId: owner.lockId,
    });
  });

  socket.on("table:access-response", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = accessResponseInput.safeParse(payload);
    if (!parsed.success || !current.sitting || current.lockId !== parsed.data.lockId) return;
    const requester = (await getPresence(workspaceId)).find((person) => person.userId === parsed.data.requesterId);
    if (!requester) return;
    io.to(userChannel(workspaceId, requester.userId)).emit("table:access-resolved", {
      ownerId: userId,
      ownerName: current.name,
      lockId: current.lockId,
      approved: parsed.data.approved,
    });
  });

  socket.on("presence:come-request", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = userActionInput.safeParse(payload);
    if (!parsed.success || parsed.data.targetId === userId) return;
    const target = (await getPresence(workspaceId)).find((person) => person.userId === parsed.data.targetId);
    if (!target) return;
    io.to(userChannel(workspaceId, target.userId)).emit("presence:come-requested", {
      requesterId: userId,
      requesterName: current.name,
      x: current.x,
      y: current.y,
    });
  });

  socket.on("presence:come-response", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = comeResponseInput.safeParse(payload);
    if (!parsed.success) return;
    const requester = (await getPresence(workspaceId)).find((person) => person.userId === parsed.data.requesterId);
    if (!requester) return;
    io.to(userChannel(workspaceId, requester.userId)).emit("presence:come-resolved", {
      targetId: userId,
      targetName: current.name,
      approved: parsed.data.approved,
    });
  });

  socket.on("media:catalog:get", () => {
    socket.emit("media:catalog", mediaCatalog(workspaceId));
  });

  socket.on("media:publisher:create", async (acknowledge) => {
    if (!withinRateLimit(socket) || typeof acknowledge !== "function") return;
    try {
      const result = await cloudflareRequest("/sessions/new", "POST");
      const sessionId = z.string().min(1).parse(result.sessionId);
      const state = mediaSessions.get(socket.id);
      if (!state) throw new Error("media_session_missing");
      if (state.publisher) clearMediaPublication(workspaceId, userId, state.publisher);
      state.publisher = sessionId;
      acknowledge({ ok: true, sessionId });
    } catch {
      acknowledge({ ok: false, error: "media_unavailable" });
    }
  });

  socket.on("media:publisher:publish", async (payload, acknowledge) => {
    if (!withinRateLimit(socket) || typeof acknowledge !== "function") return;
    const parsed = mediaPublishInput.safeParse(payload);
    const publisherSession = mediaSessions.get(socket.id)?.publisher;
    if (!parsed.success || !publisherSession) {
      acknowledge({ ok: false, error: "invalid_request" });
      return;
    }
    try {
      const result = await cloudflareRequest(`/sessions/${publisherSession}/tracks/new`, "POST", {
        sessionDescription: parsed.data.sessionDescription,
        tracks: parsed.data.tracks.map(({ mid, trackName }) => ({ location: "local", mid, trackName })),
      });
      const publications = mediaPublications.get(workspaceId) ?? new Map<string, MediaPublication>();
      publications.set(userId, {
        userId,
        name: claims.name,
        sessionId: publisherSession,
        tracks: parsed.data.tracks.map(({ trackName, kind }) => ({ trackName, kind })),
      });
      mediaPublications.set(workspaceId, publications);
      broadcastMediaCatalog(workspaceId);
      acknowledge({ ok: true, result });
    } catch {
      acknowledge({ ok: false, error: "media_unavailable" });
    }
  });

  socket.on("media:publisher:clear", () => {
    const state = mediaSessions.get(socket.id);
    if (!state?.publisher) return;
    clearMediaPublication(workspaceId, userId, state.publisher);
    state.publisher = undefined;
  });

  socket.on("media:subscriber:create", async (acknowledge) => {
    if (!withinRateLimit(socket) || typeof acknowledge !== "function") return;
    try {
      const result = await cloudflareRequest("/sessions/new", "POST");
      const sessionId = z.string().min(1).parse(result.sessionId);
      const state = mediaSessions.get(socket.id);
      if (!state) throw new Error("media_session_missing");
      state.subscribers.add(sessionId);
      acknowledge({ ok: true, sessionId });
    } catch {
      acknowledge({ ok: false, error: "media_unavailable" });
    }
  });

  socket.on("media:subscriber:pull", async (payload, acknowledge) => {
    if (!withinRateLimit(socket) || typeof acknowledge !== "function") return;
    const parsed = mediaPullInput.safeParse(payload);
    const state = mediaSessions.get(socket.id);
    if (!parsed.success || !state?.subscribers.has(parsed.data.sessionId)) {
      acknowledge({ ok: false, error: "invalid_request" });
      return;
    }
    const audioUsers = new Set(parsed.data.audioUserIds);
    const videoUsers = new Set(parsed.data.videoUserIds);
    const requestedTracks = mediaCatalog(workspaceId).flatMap((publication) => publication.userId === userId
      ? []
      : publication.tracks.flatMap((track) => {
          const allowed = track.kind === "audio" ? audioUsers.has(publication.userId) : videoUsers.has(publication.userId);
          return allowed ? [{
            location: "remote" as const,
            sessionId: publication.sessionId,
            trackName: track.trackName,
            userId: publication.userId,
            name: publication.name,
            kind: track.kind,
          }] : [];
        }));
    if (!requestedTracks.length) {
      acknowledge({ ok: true, empty: true, bindings: [] });
      return;
    }
    try {
      const result = await cloudflareRequest(`/sessions/${parsed.data.sessionId}/tracks/new`, "POST", {
        tracks: requestedTracks.map(({ location, sessionId, trackName }) => ({ location, sessionId, trackName })),
      });
      const responseTracks = Array.isArray(result.tracks) ? result.tracks as Record<string, unknown>[] : [];
      const bindings = requestedTracks.map((track, index) => ({
        userId: track.userId,
        name: track.name,
        kind: track.kind,
        mid: typeof responseTracks[index]?.mid === "string" ? responseTracks[index].mid : null,
      }));
      acknowledge({
        ok: true,
        result: {
          sessionDescription: result.sessionDescription,
          requiresImmediateRenegotiation: result.requiresImmediateRenegotiation,
        },
        bindings,
      });
    } catch {
      acknowledge({ ok: false, error: "media_unavailable" });
    }
  });

  socket.on("media:subscriber:renegotiate", async (payload, acknowledge) => {
    if (!withinRateLimit(socket) || typeof acknowledge !== "function") return;
    const parsed = mediaRenegotiateInput.safeParse(payload);
    if (!parsed.success || !mediaSessions.get(socket.id)?.subscribers.has(parsed.data.sessionId)) {
      acknowledge({ ok: false, error: "invalid_request" });
      return;
    }
    try {
      await cloudflareRequest(`/sessions/${parsed.data.sessionId}/renegotiate`, "PUT", {
        sessionDescription: parsed.data.sessionDescription,
      });
      acknowledge({ ok: true });
    } catch {
      acknowledge({ ok: false, error: "media_unavailable" });
    }
  });

  const heartbeat = setInterval(async () => {
    if (!current) return;
    current.updatedAt = Date.now();
    await savePresence(workspaceId, current);
  }, 20_000);

  socket.on("disconnect", async () => {
    clearInterval(heartbeat);
    const mediaState = mediaSessions.get(socket.id);
    if (mediaState?.publisher) clearMediaPublication(workspaceId, userId, mediaState.publisher);
    mediaSessions.delete(socket.id);
    await removePresence(workspaceId, userId);
    socket.to(channel).emit("presence:left", { userId });
  });
});

await configureRedis();
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`[realtime] listening on :${port}`);
});

async function shutdown() {
  io.disconnectSockets(true);
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await redis?.quit();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
