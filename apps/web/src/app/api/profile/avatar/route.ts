import { db } from "@orbit/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  AVATAR_ACCESSORIES,
  AVATAR_BOTTOM_COLORS,
  AVATAR_HAIR_COLORS,
  AVATAR_HAIR_STYLES,
  AVATAR_SHOE_COLORS,
  AVATAR_SKIN_TONES,
  AVATAR_TOP_COLORS,
} from "@/lib/avatar";

const avatarSchema = z.object({
  skinTone: z.enum(AVATAR_SKIN_TONES),
  hairStyle: z.enum(AVATAR_HAIR_STYLES),
  hairColor: z.enum(AVATAR_HAIR_COLORS),
  topColor: z.enum(AVATAR_TOP_COLORS),
  bottomColor: z.enum(AVATAR_BOTTOM_COLORS),
  shoeColor: z.enum(AVATAR_SHOE_COLORS),
  accessory: z.enum(AVATAR_ACCESSORIES),
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
