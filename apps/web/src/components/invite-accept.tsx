"use client";

import { Building2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Props = { invitationId: string; organizationName: string; inviterEmail: string };

export function InviteAccept({ invitationId, organizationName, inviterEmail }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setError("");
    setLoading(true);
    const result = await authClient.organization.acceptInvitation({ invitationId });
    if (result.error) {
      setError(result.error.message ?? "Não foi possível aceitar o convite.");
      setLoading(false);
      return;
    }
    router.push("/workspace");
    router.refresh();
  }

  return (
    <main className="onboarding-layout">
      <section className="onboarding-card">
        <div className="onboarding-icon"><Building2 /></div>
        <span className="eyebrow">VOCÊ FOI CONVIDADO</span>
        <h1>{organizationName}</h1>
        <p>{inviterEmail} te convidou para entrar neste escritório.</p>
        {error && <p className="form-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
        <button className="auth-submit" style={{ marginTop: 28 }} onClick={accept} disabled={loading}>
          {loading ? <LoaderCircle className="spin" /> : "Entrar no escritório"}
        </button>
      </section>
    </main>
  );
}
