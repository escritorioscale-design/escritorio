import { db } from "@orbit/db";
import { Onboarding } from "@/components/onboarding";
import { WorkspaceShell } from "@/components/workspace-shell";
import { normalizeAvatar } from "@/lib/avatar";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const session = await requireSession();
  const membership = await db.member.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      organization: {
        include: {
          workspaces: {
            orderBy: { createdAt: "asc" },
            take: 1,
            include: {
              spaces: {
                where: { isDefault: true },
                take: 1,
                include: { rooms: { orderBy: { name: "asc" } } },
              },
            },
          },
        },
      },
    },
  });

  if (!membership) return <Onboarding />;
  const workspace = membership.organization.workspaces[0];
  const space = workspace?.spaces[0];
  if (!workspace || !space) return <Onboarding />;

  const profile = await db.user.findUnique({
    where: { id: session.user.id },
    select: { avatarColor: true, avatarConfig: true },
  });

  return (
    <WorkspaceShell
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatar: normalizeAvatar(profile?.avatarConfig, profile?.avatarColor),
      }}
      organization={{ id: membership.organization.id, name: membership.organization.name, role: membership.role }}
      workspace={{ id: workspace.id, name: workspace.name }}
      space={{ id: space.id, name: space.name }}
      rooms={space.rooms.map((room) => ({ id: room.id, name: room.name, kind: room.kind, x: room.x, y: room.y, width: room.width, height: room.height }))}
    />
  );
}
