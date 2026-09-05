"use client";

import { Building2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient, signOut } from "@/lib/auth-client";

type Invitation = {
  id: string;
  organizationName: string;
  role: string;
  expiresAt: string | Date;
};

const roleLabels: Record<string, string> = { owner: "Dono", admin: "Administrador", member: "Membro" };

export function PendingInvitations({ invitations }: { invitations: Invitation[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function accept(invitationId: string) {
    setError("");
    setPendingId(invitationId);
    const result = await authClient.organization.acceptInvitation({ invitationId });
    if (result.error) {
      setError(result.error.message ?? "Não foi possível aceitar o convite.");
      setPendingId(null);
      return;
    }
    router.refresh();
  }

  return (
    <main className="onboarding-layout">
      <section className="onboarding-card">
        <div className="onboarding-icon"><Building2 /></div>
        <span className="eyebrow">VOCÊ FOI CONVIDADO</span>
        <h1>{invitations.length > 1 ? "Escolha um escritório para entrar." : "Você tem um convite esperando."}</h1>
        <p>Aceite para entrar no escritório da equipe.</p>
        <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
          {invitations.map((invitation) => (
            <div key={invitation.id} className="invite-row">
              <div>
                <strong>{invitation.organizationName}</strong>
                <small>{roleLabels[invitation.role] ?? invitation.role}</small>
              </div>
              <button className="auth-submit" disabled={pendingId !== null} onClick={() => accept(invitation.id)}>
                {pendingId === invitation.id ? <LoaderCircle className="spin" /> : "Aceitar"}
              </button>
            </div>
          ))}
        </div>
        {error && <p className="form-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
        <button
          className="auth-switch"
          style={{ background: "none", border: 0, cursor: "pointer", marginTop: 18 }}
          onClick={() => signOut({ fetchOptions: { onSuccess: () => location.assign("/login") } })}
        >
          Sair
        </button>
      </section>
    </main>
  );
}
