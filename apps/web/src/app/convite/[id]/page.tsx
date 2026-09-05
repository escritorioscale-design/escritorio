import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteAccept } from "@/components/invite-accept";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Convite" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(`/login?next=${encodeURIComponent(`/convite/${id}`)}`);

  try {
    const invitation = await auth.api.getInvitation({ query: { id }, headers: requestHeaders });
    return (
      <InviteAccept
        invitationId={invitation.id}
        organizationName={invitation.organizationName}
        inviterEmail={invitation.inviterEmail}
      />
    );
  } catch (error) {
    const isWrongRecipient = error instanceof Error && "status" in error && error.status === "FORBIDDEN";
    return (
      <main className="onboarding-layout">
        <section className="onboarding-card">
          <span className="eyebrow">CONVITE</span>
          <h1>Não foi possível abrir este convite.</h1>
          <p>
            {isWrongRecipient
              ? `Este convite foi enviado para outro e-mail. Você está conectado como ${session.user.email}.`
              : "Este convite não existe mais, já foi aceito ou expirou."}
          </p>
          <Link className="auth-submit" style={{ marginTop: 28, textDecoration: "none" }} href="/workspace">
            Ir para o Orbit
          </Link>
        </section>
      </main>
    );
  }
}
