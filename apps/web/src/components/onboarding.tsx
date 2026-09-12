"use client";

import { ArrowRight, Building2, LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AvatarCharacter } from "@/components/avatar-character";
import { authClient } from "@/lib/auth-client";
import { wokaPreset } from "@/lib/avatar";

export function Onboarding() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatarIndex, setAvatarIndex] = useState(0);

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
    await fetch("/api/profile/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(wokaPreset(avatarIndex)),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <main className="onboarding-layout">
      <section className="onboarding-card onboarding-workspace-card">
        <div className="onboarding-form-side">
          <div className="onboarding-icon"><Building2 /></div>
          <span className="eyebrow">PRIMEIROS PASSOS</span>
          <h1>Prepare sua chegada ao campus.</h1>
          <p>Dê um nome à equipe e escolha seu primeiro Woka. O escritório completo será criado automaticamente.</p>
          <form onSubmit={submit}>
            <label>Nome da empresa ou equipe<input name="company" required minLength={2} maxLength={80} placeholder="Ex.: Acme Studio" autoFocus /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="auth-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <>Criar escritório <ArrowRight /></>}</button>
          </form>
        </div>
        <aside className="onboarding-woka-side">
          <span><Sparkles /> SEU PRIMEIRO PERSONAGEM</span>
          <div className="onboarding-woka-preview"><AvatarCharacter appearance={wokaPreset(avatarIndex)} direction="down" moving /></div>
          <strong>Escolha um ponto de partida</strong>
          <p>Você poderá combinar todas as peças depois.</p>
          <div className="onboarding-avatar-picks">
            {[0, 1, 2, 3, 4].map((index) => <button type="button" key={index} className={avatarIndex === index ? "selected" : ""} onClick={() => setAvatarIndex(index)} aria-label={`Personagem ${index + 1}`}><AvatarCharacter appearance={wokaPreset(index)} compact /></button>)}
          </div>
        </aside>
      </section>
    </main>
  );
}
