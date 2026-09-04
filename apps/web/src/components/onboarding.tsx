"use client";

import { ArrowRight, Building2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function Onboarding() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const name = String(new FormData(event.currentTarget).get("company"));
    const baseSlug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
    const organization = await authClient.organization.create({ name, slug });
    if (organization.error || !organization.data) {
      setError(organization.error?.message ?? "Não foi possível criar a organização.");
      setLoading(false);
      return;
    }
    const response = await fetch("/api/workspaces/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: organization.data.id, organizationName: name }),
    });
    if (!response.ok) {
      setError("A organização foi criada, mas o escritório não pôde ser preparado.");
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <main className="onboarding-layout">
      <section className="onboarding-card">
        <div className="onboarding-icon"><Building2 /></div>
        <span className="eyebrow">PRIMEIROS PASSOS</span>
        <h1>Como se chama sua equipe?</h1>
        <p>Isso cria uma organização isolada com membros, permissões e seu primeiro escritório.</p>
        <form onSubmit={submit}>
          <label>Nome da empresa ou equipe<input name="company" required minLength={2} maxLength={80} placeholder="Ex.: Acme Studio" autoFocus /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="auth-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <>Criar escritório <ArrowRight /></>}</button>
        </form>
      </section>
    </main>
  );
}
