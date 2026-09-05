import { db } from "@orbit/db";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

const schema = z.object({ workspaceId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const workspace = await db.workspace.findFirst({
    where: {
      id: parsed.data.workspaceId,
      organization: { members: { some: { userId: session.user.id } } },
    },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !serverUrl) {
    return NextResponse.json({ error: "media_not_configured" }, { status: 503 });
  }

  // One shared, always-on room per workspace: everyone joins it automatically
  // and per-participant volume is mixed client-side by map distance, instead
  // of dialing into a fixed meeting room to be heard.
  const token = new AccessToken(apiKey, apiSecret, {
    identity: session.user.id,
    name: session.user.name,
    ttl: "6h",
    metadata: JSON.stringify({ workspaceId: workspace.id }),
  });
  token.addGrant({
    room: `ambient-${workspace.id}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return NextResponse.json({ token: await token.toJwt(), serverUrl });
}
