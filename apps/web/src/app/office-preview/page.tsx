"use client";

import Link from "next/link";
import { ArrowLeft, Armchair, DoorOpen, MousePointer2 } from "lucide-react";
import { ModernOfficePreview } from "@/components/modern-office-preview";
import "./preview.css";

export default function OfficePreviewPage() {
  return (
    <main className="modern-preview-page">
      <header className="modern-preview-header">
        <div>
          <span className="modern-preview-eyebrow">SEU NOVO ESCRITÓRIO</span>
          <h1>Conheça o Scale Campus.</h1>
          <p>Trabalho, foco e encontros espontâneos no mesmo mapa.</p>
        </div>
        <Link href="/workspace" className="modern-preview-back"><ArrowLeft /> Voltar ao escritório</Link>
      </header>
      <section className="modern-preview-content">
        <div className="modern-preview-copy">
          <div className="modern-preview-badge"><DoorOpen /> Explore o escritório</div>
          <h2>Um campus pronto para a equipe.</h2>
          <p>Quatro squads com salas internas, diretoria, café, biblioteca, auditório e uma praça central para encontros espontâneos.</p>
          <div className="modern-preview-stats"><span><strong>4</strong> áreas de squad</span><span><strong>5</strong> zonas inteligentes</span><span><strong>45</strong> assentos</span></div>
          <p>O jardim e a biblioteca protegem o foco; a praça, o café e a recepção criam conversas compartilhadas.</p>
          <div className="modern-preview-legend"><span><MousePointer2 /> Clique para andar; + para aproximar</span><span><Armchair /> Clique na cadeira para sentar</span><span><DoorOpen /> Portas abrem na aproximação</span><span><b>E</b> Sentar ou levantar</span></div>
        </div>
        <ModernOfficePreview />
      </section>
    </main>
  );
}
