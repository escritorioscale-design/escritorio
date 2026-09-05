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
          <p>Prévia construída com os tiles reais do pacote comprado.</p>
        </div>
        <Link href="/workspace" className="modern-preview-back"><ArrowLeft /> Voltar ao escritório</Link>
      </header>
      <section className="modern-preview-content">
        <div className="modern-preview-copy">
          <div className="modern-preview-badge"><CheckCircle2 /> Componente isolado</div>
          <h2>Um escritório que funciona como espaço, não como uma imagem.</h2>
          <p>As paredes, portas, mesas e cadeiras já estão organizadas em uma grade navegável. Clique dentro de uma sala ou use WASD para testar a circulação.</p>
          <div className="modern-preview-legend"><span><i className="legend-dot dot-wood" /> Squads com 4 posições</span><span><i className="legend-dot dot-purple" /> Reunião geral</span><span><i className="legend-dot dot-gray" /> Criação e gerência</span></div>
        </div>
        <ModernOfficePreview />
      </section>
    </main>
  );
}
