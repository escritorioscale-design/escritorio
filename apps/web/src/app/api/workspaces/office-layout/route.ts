import { db } from "@orbit/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

const rectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

const roomSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().optional(),
  kind: z.enum(["MEETING", "DIRECTOR", "FOCUS", "CREATIVE", "AUDITORIUM", "CUSTOM"]),
  name: z.string().min(1).max(60),
  x: z.number(), y: z.number(), w: z.number().min(4), h: z.number().min(4),
  doorSide: z.enum(["top", "bottom"]),
  locked: z.boolean(),
});

const furnitureSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1).max(60),
  x: z.number(), y: z.number(),
  scale: z.number().min(0.2).max(4).optional(),
  facing: z.enum(["up", "down", "left", "right"]).optional(),
  collides: rectSchema.nullable().optional(),
});

const httpUrlSchema = z.string().url().max(2048).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "Only http(s) links are allowed");

const zoneEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SILENT") }),
  z.object({ type: z.literal("CONVERSATION") }),
  z.object({
    type: z.literal("OPEN_LINK"),
    url: httpUrlSchema,
    label: z.string().min(1).max(48).optional(),
  }),
]);

const interactionZoneSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(60),
  x: z.number(), y: z.number(),
  w: z.number().min(1), h: z.number().min(1),
  effects: z.array(zoneEffectSchema).min(1).max(3),
});

const layoutSchema = z.object({
  version: z.number(),
  mapCols: z.number().min(10).max(200),
  mapRows: z.number().min(10).max(200),
  rooms: z.array(roomSchema).max(60),
  furniture: z.array(furnitureSchema).max(600),
  zones: z.array(interactionZoneSchema).max(100).default([]),
});

const requestSchema = z.object({
  workspaceId: z.string().min(1),
  spaceId: z.string().min(1),
  layout: layoutSchema,
});

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { workspaceId, spaceId, layout } = parsed.data;

  const space = await db.space.findUnique({ where: { id: spaceId }, include: { workspace: true } });
  if (!space || space.workspaceId !== workspaceId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const membership = await db.member.findUnique({
    where: { organizationId_userId: { organizationId: space.workspace.organizationId, userId: session.user.id } },
  });
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db.space.update({ where: { id: spaceId }, data: { mapData: layout as object, mapVersion: layout.version } });
  return NextResponse.json({ ok: true });
}
