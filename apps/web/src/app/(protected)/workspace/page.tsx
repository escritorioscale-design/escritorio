import { db } from "@orbit/db";
import { Onboarding } from "@/components/onboarding";
import { WorkspaceShell } from "@/components/workspace-shell";
import { normalizeAvatar } from "@/lib/avatar";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type OfficeRoom = {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_OFFICE_LAYOUT: Omit<OfficeRoom, "id">[] = [
  { name: "Sala de reunião geral", kind: "MEETING", x: 4, y: 5, width: 28, height: 30 },
  { name: "Sala de criação", kind: "SOCIAL", x: 36, y: 5, width: 28, height: 30 },
  { name: "Sala do gerente", kind: "PROXIMITY", x: 68, y: 5, width: 28, height: 30 },
  { name: "Squad 1", kind: "FOCUS", x: 4, y: 44, width: 28, height: 46 },
  { name: "Squad 2", kind: "FOCUS", x: 36, y: 44, width: 28, height: 46 },
  { name: "Squad 3", kind: "FOCUS", x: 68, y: 44, width: 28, height: 46 },
];

function defaultOfficeRooms(rooms: OfficeRoom[], spaceId: string) {
  const isOrganized = DEFAULT_OFFICE_LAYOUT.every((layout) => rooms.some((room) => room.name === layout.name));
  if (isOrganized) return rooms;

  const byKind = new Map<string, OfficeRoom[]>();
  for (const room of rooms) byKind.set(room.kind, [...(byKind.get(room.kind) ?? []), room]);
  const used = new Set<string>();
  return DEFAULT_OFFICE_LAYOUT.map((layout, index) => {
    const exact = rooms.find((room) => room.name === layout.name && !used.has(room.id));
    const fallback = exact ?? byKind.get(layout.kind)?.find((room) => !used.has(room.id));
    if (fallback) used.add(fallback.id);
    return { ...layout, id: fallback?.id ?? `${spaceId}-default-room-${index + 1}` };
  });
}

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

  const officeRooms = defaultOfficeRooms(
    space.rooms.map((room) => ({ id: room.id, name: room.name, kind: room.kind, x: room.x, y: room.y, width: room.width, height: room.height })),
    space.id,
  );

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
      rooms={officeRooms}
    />
  );
}
