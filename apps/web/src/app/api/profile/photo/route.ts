import { db } from "@orbit/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

// Small photos only — stored inline as a data URL on User.image (no object
// storage wired up yet) AND relayed through the realtime presence channel
// (JWT claims + a size-capped Socket.IO buffer), so this has to stay tiny —
// the client resizes to a small square thumbnail before ever uploading.
const MAX_DATA_URL_LENGTH = 30_000;

const photoSchema = z.object({
  dataUrl: z.string().min(1).max(MAX_DATA_URL_LENGTH).regex(/^data:image\/(png|jpeg|webp);base64,/),
});

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = photoSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_photo" }, { status: 400 });

  await db.user.update({ where: { id: session.user.id }, data: { image: parsed.data.dataUrl } });
  return NextResponse.json({ image: parsed.data.dataUrl });
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await db.user.update({ where: { id: session.user.id }, data: { image: null } });
  return NextResponse.json({ ok: true });
}
