import { db } from "@orbit/db";
import { Onboarding } from "@/components/onboarding";
import { NoOfficeAccess } from "@/components/no-office-access";
import { PendingInvitations } from "@/components/pending-invitations";
import { WorkspaceShell } from "@/components/workspace-shell";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/admin";
import { normalizeAvatar } from "@/lib/avatar";
import { isOfficeLayout } from "@/lib/office-layout";
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
  capacity?: number | null;
};

const DEFAULT_OFFICE_LAYOUT: Omit<OfficeRoom, "id">[] = [
  { name: "Sala de reunião geral", kind: "MEETING", x: 4, y: 5, width: 28, height: 30, capacity: 24 },
  { name: "Sala de criação", kind: "SOCIAL", x: 36, y: 5, width: 28, height: 30, capacity: 4 },
  { name: "Sala do gerente", kind: "PROXIMITY", x: 68, y: 5, width: 28, height: 30, capacity: 4 },
  { name: "Squad 1", kind: "FOCUS", x: 4, y: 44, width: 28, height: 46, capacity: 4 },
  { name: "Squad 2", kind: "FOCUS", x: 36, y: 44, width: 28, height: 46, capacity: 4 },
  { name: "Squad 3", kind: "FOCUS", x: 68, y: 44, width: 28, height: 46, capacity: 4 },
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
    return { ...layout, id: fallback?.id ?? `${spaceId}-default-room-${index + 1}`, capacity: layout.capacity };
  });
}

export default async function WorkspacePage() {
  const session = await requireSession();
  const memberships = await db.member.findMany({
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

  if (memberships.length === 0) {
    const invitations = await auth.api.listUserInvitations({
      query: { email: session.user.email },
    });
    if (invitations.length > 0) return <PendingInvitations invitations={invitations} />;
    if (isPlatformAdmin(session.user.email)) return <Onboarding />;
    return <NoOfficeAccess email={session.user.email} />;
  }

  const membership = memberships.find((candidate) => candidate.organizationId === session.session.activeOrganizationId)
    ?? memberships[0];
  const workspace = membership.organization.workspaces[0];
  const space = workspace?.spaces[0];
  if (!workspace || !space) return <Onboarding />;

  const profile = await db.user.findUnique({
    where: { id: session.user.id },
    select: { avatarColor: true, avatarConfig: true, image: true },
  });

  const officeRooms = defaultOfficeRooms(
    space.rooms.map((room) => ({ id: room.id, name: room.name, kind: room.kind, x: room.x, y: room.y, width: room.width, height: room.height, capacity: room.capacity })),
    space.id,
  );
  const officeLayout = isOfficeLayout(space.mapData) ? space.mapData : undefined;

  return (
    <WorkspaceShell
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatar: normalizeAvatar(profile?.avatarConfig, profile?.avatarColor),
        photo: profile?.image ?? null,
      }}
      organization={{ id: membership.organization.id, name: membership.organization.name, role: membership.role }}
      workspace={{ id: workspace.id, name: workspace.name }}
      space={{ id: space.id, name: space.name }}
      rooms={officeRooms}
      officeLayout={officeLayout}
    />
  );
}
