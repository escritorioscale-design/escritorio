"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

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
    <section className="auth-card">
      <Link href="/" className="wordmark"><span>O</span> orbit</Link>
      <div className="auth-copy">
        <span className="eyebrow">ESCRITÓRIO VIRTUAL</span>
        <h1>{mode === "login" ? "Bom ter você de volta." : "Crie o espaço da sua equipe."}</h1>
        <p>{mode === "login" ? "Entre para encontrar sua equipe no escritório." : "Sua equipe, suas salas e suas conversas em um único lugar."}</p>
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
  );
}
