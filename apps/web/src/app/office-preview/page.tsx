"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { ModernOfficePreview } from "@/components/modern-office-preview";
import "./preview.css";

export default function OfficePreviewPage() {
  return (
    <main className="modern-preview-page">
      <header className="modern-preview-header">
        <div>
          <span className="modern-preview-eyebrow">VERSÃO ALTERNATIVA · SEM CONFLITO</span>
          <h1>Modern Office</h1>
          <p>Mapa fiel à referência enviada, com interação por cima da arte original.</p>
        </div>
        <Link href="/workspace" className="modern-preview-back"><ArrowLeft /> Voltar ao escritório</Link>
      </header>
      <section className="modern-preview-content">
        <div className="modern-preview-copy">
          <div className="modern-preview-badge"><CheckCircle2 /> Componente isolado</div>
          <h2>A mesma planta da foto, agora navegável.</h2>
          <p>A arte original define o visual. O personagem usa WASD ou clique, respeita mesas e paredes, abre portas ao se aproximar e senta nas cadeiras disponíveis.</p>
          <div className="modern-preview-legend"><span><i className="legend-dot dot-wood" /> Mesas e circulação</span><span><i className="legend-dot dot-purple" /> Sala de criação</span><span><i className="legend-dot dot-gray" /> Sala do gerente</span></div>
        </div>
        <ModernOfficePreview />
      </section>
    </main>
  );
}
