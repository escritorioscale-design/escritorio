"use client";

import { ArrowRight, Headphones, LoaderCircle, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AvatarCharacter } from "@/components/avatar-character";
import { signIn, signUp } from "@/lib/auth-client";
import { wokaPreset } from "@/lib/avatar";

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/workspace";
}

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const destination = safeNext(next);
  const switchHref = `${mode === "login" ? "/cadastro" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));

    const result = mode === "login"
      ? await signIn.email({ email, password })
      : await signUp.email({
          name: String(data.get("name")),
          email,
          password,
        });

    if (result.error) {
      setError(result.error.message ?? "Não foi possível continuar.");
      setLoading(false);
      return;
    }
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="auth-experience">
      <section className="auth-showcase" aria-label="Prévia do escritório virtual">
        <div className="auth-showcase-top"><Link href="/" className="wordmark light"><span>O</span> orbit</Link><small><i /> ESPAÇO ONLINE</small></div>
        <div className="auth-map-preview">
          <div className="auth-map-image" />
          {[0, 1, 2, 3].map((index) => <div className={`auth-preview-woka woka-${index + 1}`} key={index}><AvatarCharacter appearance={wokaPreset(index)} direction={index % 2 ? "left" : "down"} moving={index === 2} /><label>{["Maya", "Ravi", "Ana", "Você"][index]}</label></div>)}
          <div className="auth-map-bubble"><Headphones /><span><strong>Conversa por proximidade</strong>Praça central · 4 pessoas</span></div>
        </div>
        <div className="auth-showcase-copy"><span>SEU TIME, NO MESMO LUGAR</span><h2>Um escritório que dá vontade de entrar.</h2><p>Caminhe até as pessoas, ocupe uma mesa e transforme conversas rápidas em trabalho acontecendo.</p></div>
        <div className="auth-feature-row"><span><Users /> Presença ao vivo</span><span><Sparkles /> Personagens Woka</span><span><ShieldCheck /> Espaços privados</span></div>
      </section>

      <section className="auth-card">
        <Link href="/" className="wordmark auth-mobile-brand"><span>O</span> orbit</Link>
        <div className="auth-copy">
          <span className="eyebrow">{mode === "login" ? "BEM-VINDO DE VOLTA" : "NOVO ESCRITÓRIO"}</span>
          <h1>{mode === "login" ? "Encontre sua equipe." : "Crie o espaço da sua equipe."}</h1>
          <p>{mode === "login" ? "Entre no campus e continue de onde parou." : "Comece com mapa, salas e personagens prontos para usar."}</p>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && <label>Seu nome<input name="name" autoComplete="name" required minLength={2} placeholder="Como devemos chamar você?" /></label>}
          <label>E-mail profissional<input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com" /></label>
          <label>Senha<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={10} placeholder="Mínimo de 10 caracteres" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" /> : <>{mode === "login" ? "Entrar no escritório" : "Criar minha conta"}<ArrowRight /></>}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "login" ? "Ainda não tem uma conta?" : "Já faz parte do Orbit?"}{" "}
          <Link href={switchHref}>{mode === "login" ? "Criar conta" : "Entrar"}</Link>
        </p>
        <small className="auth-terms">Ao continuar, você concorda com os Termos e a Política de Privacidade.</small>
      </section>
    </div>
  );
}
