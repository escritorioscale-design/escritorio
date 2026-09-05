"use client";

import { MailQuestion } from "lucide-react";
import { signOut } from "@/lib/auth-client";

export function NoOfficeAccess({ email }: { email: string }) {
  return (
    <main className="onboarding-layout">
      <section className="onboarding-card">
        <div className="onboarding-icon"><MailQuestion /></div>
        <span className="eyebrow">ACESSO RESTRITO</span>
        <h1>Você ainda não tem um escritório.</h1>
        <p>
          O Orbit funciona por convite. Peça a quem administra sua equipe para te convidar
          usando o e-mail <strong>{email}</strong> — você vai receber um link para entrar
          direto no escritório certo.
        </p>
        <button className="auth-submit" style={{ marginTop: 28 }} onClick={() => signOut({ fetchOptions: { onSuccess: () => location.assign("/login") } })}>
          Sair
        </button>
      </section>
    </main>
  );
}
