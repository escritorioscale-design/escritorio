import { db } from "@orbit/db";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { normalizeAvatar } from "@/lib/avatar";

const schema = z.object({ workspaceId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const [workspace, profile] = await Promise.all([
    db.workspace.findFirst({
      where: {
        id: parsed.data.workspaceId,
        organization: { members: { some: { userId: session.user.id } } },
      },
      select: { id: true, organizationId: true },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { avatarConfig: true, avatarColor: true, image: true },
    }),
  ]);
  if (!workspace) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const secretValue = process.env.REALTIME_TOKEN_SECRET;
  if (!secretValue) return NextResponse.json({ error: "realtime_not_configured" }, { status: 503 });

  const token = await new SignJWT({
    workspaceId: workspace.id,
    organizationId: workspace.organizationId,
    name: session.user.name,
    avatar: normalizeAvatar(profile?.avatarConfig, profile?.avatarColor),
    photo: profile?.image ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.user.id)
    .setAudience("orbit-realtime")
    .setIssuer("orbit-web")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secretValue));

  return NextResponse.json({ token, expiresIn: 300 });
}
