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
          mapData: { version: 1, theme: "orbit", width: 1600, height: 900 },
          rooms: {
            create: [
              { name: "Lounge", kind: "SOCIAL", x: 4, y: 6, width: 39, height: 38, capacity: 12 },
              { name: "Zona de foco", kind: "FOCUS", x: 4, y: 53, width: 39, height: 41, capacity: 8 },
              { name: "Sala Aurora", kind: "MEETING", x: 55, y: 6, width: 41, height: 45, capacity: 16 },
              { name: "Jardim", kind: "PROXIMITY", x: 55, y: 59, width: 41, height: 35, capacity: 10 },
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
