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
          <h1>Um lugar para trabalhar junto.</h1>
          <p>Quatro equipes. Reuniões por perto. Espaço para o time inteiro.</p>
        </div>
        <Link href="/workspace" className="modern-preview-back"><ArrowLeft /> Voltar ao escritório</Link>
      </header>
      <section className="modern-preview-content">
        <div className="modern-preview-copy">
          <div className="modern-preview-badge"><DoorOpen /> Explore o escritório</div>
          <h2>Cada equipe com seu espaço.</h2>
          <p>Quatro salas com quatro mesas e quatro cadeiras cada. Dentro de cada sala, uma reunião reservada para quatro pessoas.</p>
          <div className="modern-preview-stats"><span><strong>16</strong> postos de trabalho</span><span><strong>4</strong> reuniões internas</span><span><strong>12</strong> lugares na reunião geral</span></div>
          <p>A gerência e a reunião geral ficam à direita. O corredor central conecta todas as equipes.</p>
          <div className="modern-preview-legend"><span><MousePointer2 /> Clique para andar; + para aproximar</span><span><Armchair /> Clique na cadeira para sentar</span><span><DoorOpen /> Portas abrem na aproximação</span><span><b>E</b> Sentar ou levantar</span></div>
        </div>
        <ModernOfficePreview />
      </section>
    </main>
  );
}
