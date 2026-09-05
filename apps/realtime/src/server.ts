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
type Presence = { userId: string; name: string; avatar?: Avatar; x: number; y: number; status: string; direction: Direction; moving: boolean; sitting: boolean; seatId: string | null; updatedAt: number };
const directionInput = z.enum(["up", "down", "left", "right"]);

const presenceInput = z.object({
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  status: z.enum(["available", "focus", "away", "busy"]).default("available"),
  direction: directionInput.default("down"),
  moving: z.boolean().default(false),
  sitting: z.boolean().default(false),
  seatId: z.string().nullable().default(null),
});
const positionInput = presenceInput.pick({ x: true, y: true, direction: true, moving: true, sitting: true, seatId: true });

let redis: RedisClientType | null = null;
const localPresence = new Map<string, Map<string, Presence>>();

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
  await socket.join(channel);
  socket.emit("presence:snapshot", await getPresence(workspaceId));

  socket.on("presence:join", async (payload) => {
    const parsed = presenceInput.safeParse(payload);
    if (!parsed.success) return;
    const avatar = avatarInput.safeParse(claims.avatar);
    current = { userId, name: claims.name, avatar: avatar.success ? avatar.data : undefined, ...parsed.data, updatedAt: Date.now() };
    await savePresence(workspaceId, current);
    socket.to(channel).emit("presence:upsert", current);
  });

  socket.on("position:update", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = positionInput.safeParse(payload);
    if (!parsed.success) return;
    current = { ...current, ...parsed.data, updatedAt: Date.now() };
    await savePresence(workspaceId, current);
    socket.to(channel).volatile.emit("presence:upsert", current);
  });

  socket.on("avatar:update", async (payload) => {
    if (!current || !withinRateLimit(socket)) return;
    const parsed = avatarInput.safeParse(payload);
    if (!parsed.success) return;
    current = { ...current, avatar: parsed.data, updatedAt: Date.now() };
    await savePresence(workspaceId, current);
    socket.to(channel).emit("presence:upsert", current);
  });

  const heartbeat = setInterval(async () => {
    if (!current) return;
    current.updatedAt = Date.now();
    await savePresence(workspaceId, current);
  }, 20_000);

  socket.on("disconnect", async () => {
    clearInterval(heartbeat);
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
