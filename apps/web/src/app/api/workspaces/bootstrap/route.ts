import { db } from "@orbit/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

const requestSchema = z.object({
  organizationId: z.string().min(1),
  organizationName: z.string().min(2).max(80),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const membership = await db.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: parsed.data.organizationId,
        userId: session.user.id,
      },
    },
  });
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await db.workspace.findFirst({
    where: { organizationId: parsed.data.organizationId },
  });
  if (existing) return NextResponse.json({ workspaceId: existing.id });

  const workspace = await db.workspace.create({
    data: {
      organizationId: parsed.data.organizationId,
      name: `${parsed.data.organizationName} Workspace`,
      slug: "principal",
      spaces: {
        create: {
          name: "Escritório principal",
          isDefault: true,
          mapVersion: 2,
          mapData: { version: 2, theme: "orbit", width: 1600, height: 900, layout: "six-room-grid" },
          rooms: {
            create: [
              { name: "Sala de reunião geral", kind: "MEETING", x: 4, y: 5, width: 28, height: 30, capacity: 24 },
              { name: "Sala de criação", kind: "SOCIAL", x: 36, y: 5, width: 28, height: 30, capacity: 12 },
              { name: "Sala do gerente", kind: "PROXIMITY", x: 68, y: 5, width: 28, height: 30, capacity: 4, isPrivate: true },
              { name: "Squad 1", kind: "FOCUS", x: 4, y: 44, width: 28, height: 46, capacity: 4 },
              { name: "Squad 2", kind: "FOCUS", x: 36, y: 44, width: 28, height: 46, capacity: 4 },
              { name: "Squad 3", kind: "FOCUS", x: 68, y: 44, width: 28, height: 46, capacity: 4 },
            ],
          },
        },
      },
      auditLogs: {
        create: {
          actorId: session.user.id,
          action: "workspace.created",
          entityType: "workspace",
        },
      },
    },
  });

  return NextResponse.json({ workspaceId: workspace.id }, { status: 201 });
}
