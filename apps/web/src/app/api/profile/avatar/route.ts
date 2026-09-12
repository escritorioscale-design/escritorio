import { db } from "@orbit/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isWokaTexture } from "@/lib/workadventure-woka";

const avatarSchema = z.object({
  format: z.literal("woka-v1"),
  body: z.string().refine((value) => isWokaTexture("body", value)),
  eyes: z.string().refine((value) => isWokaTexture("eyes", value)),
  clothes: z.string().refine((value) => isWokaTexture("clothes", value)),
  hair: z.string().refine((value) => isWokaTexture("hair", value)),
  hat: z.string().refine((value) => isWokaTexture("hat", value, true)),
  accessory: z.string().refine((value) => isWokaTexture("accessory", value, true)),
}).strict();

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = avatarSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_avatar" }, { status: 400 });

  await db.user.update({
    where: { id: session.user.id },
    data: { avatarConfig: parsed.data },
  });

  return NextResponse.json({ avatar: parsed.data });
}
