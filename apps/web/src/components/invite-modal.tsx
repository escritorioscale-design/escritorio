"use client";

import { Check, Copy, LoaderCircle, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Props = {
  organizationId: string;
  onClose: () => void;
};

export function InviteModal({ organizationId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    const result = await authClient.organization.inviteMember({
      email: String(data.get("email")),
      role: String(data.get("role")) as "admin" | "member",
      organizationId,
    });
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Não foi possível criar o convite.");
      return;
    }
    setLink(`${window.location.origin}/convite/${result.data.id}`);
  }

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="office-customizer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
        <header>
          <div><span>CONVIDAR PARA O ESCRITÓRIO</span><h2 id="invite-modal-title">Convide alguém da sua equipe</h2></div>
          <button onClick={onClose} aria-label="Fechar"><X /></button>
        </header>
        <p>A pessoa entra apenas neste escritório, com o e-mail que você indicar.</p>
        {link ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="invite-link">
              <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" onClick={copyLink}>{copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}</button>
            </div>
            <button className="auth-submit" onClick={onClose}>Concluído</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>E-mail da pessoa<input name="email" type="email" required placeholder="pessoa@empresa.com" autoFocus /></label>
            <label>Função<select name="role" defaultValue="member"><option value="member">Membro</option><option value="admin">Administrador</option></select></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="auth-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : "Gerar link de convite"}</button>
          </form>
        )}
      </section>
    </div>
  );
}
