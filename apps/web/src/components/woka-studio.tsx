"use client";

import { Check, Dice5, Eye, HardHat, Palette, RotateCw, Scissors, Shirt, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import { AvatarCharacter, type AvatarDirection } from "@/components/avatar-character";
import { randomWokaAppearance, type AvatarAppearance } from "@/lib/avatar";
import { WOKA_CATALOG, WOKA_PART_LABELS, wokaTextureUrl, type WokaBodyPart } from "@/lib/workadventure-woka";

type Props = {
  value: AvatarAppearance;
  userName: string;
  photo: string | null;
  photoUploading: boolean;
  photoError: string;
  saving: boolean;
  error: string;
  onChange: (appearance: AvatarAppearance) => void;
  onUploadPhoto: (file: File) => void;
  onRemovePhoto: () => void;
  onCancel: () => void;
  onSave: () => void;
};

const PARTS: Array<{ part: WokaBodyPart; Icon: typeof Palette }> = [
  { part: "body", Icon: Palette },
  { part: "eyes", Icon: Eye },
  { part: "clothes", Icon: Shirt },
  { part: "hair", Icon: Scissors },
  { part: "hat", Icon: HardHat },
  { part: "accessory", Icon: Sparkles },
];

const DIRECTIONS: AvatarDirection[] = ["down", "left", "up", "right"];

export function WokaStudio({
  value, userName, photo, photoUploading, photoError, saving, error,
  onChange, onUploadPhoto, onRemovePhoto, onCancel, onSave,
}: Props) {
  const [part, setPart] = useState<WokaBodyPart>("body");
  const [directionIndex, setDirectionIndex] = useState(0);
  const direction = DIRECTIONS[directionIndex];
  const textures = WOKA_CATALOG[part];
  const optional = part === "hat" || part === "accessory";

  function select(textureId: string) {
    onChange({ ...value, [part]: textureId });
  }

  return (
    <section className="woka-studio" role="dialog" aria-modal="true" aria-labelledby="woka-studio-title">
      <header className="woka-studio-header">
        <div>
          <span>PERSONAGEM WOKA</span>
          <h2 id="woka-studio-title">Monte seu personagem</h2>
          <p>Combine as peças do WorkAdventure e apareça assim para toda a equipe.</p>
        </div>
        <button type="button" className="woka-close" onClick={onCancel} aria-label="Fechar"><X /></button>
      </header>

      <div className="woka-studio-body">
        <aside className="woka-preview-panel">
          <div className="woka-preview-grid" />
          <span className="woka-preview-kicker">PRÉVIA AO VIVO</span>
          <div className="woka-preview-character">
            <AvatarCharacter appearance={value} direction={direction} moving />
          </div>
          <strong>{userName}</strong>
          <span className="woka-preview-status"><i /> Disponível no escritório</span>
          <div className="woka-preview-actions">
            <button type="button" onClick={() => setDirectionIndex((current) => (current + 1) % DIRECTIONS.length)}><RotateCw /> Girar</button>
            <button type="button" onClick={() => onChange(randomWokaAppearance())}><Dice5 /> Surpreenda-me</button>
          </div>
        </aside>

        <div className="woka-customizer">
          <nav className="woka-parts" aria-label="Partes do personagem">
            {PARTS.map(({ part: item, Icon }) => (
              <button key={item} type="button" className={part === item ? "active" : ""} onClick={() => setPart(item)}>
                <Icon /><span>{WOKA_PART_LABELS[item]}</span>
              </button>
            ))}
          </nav>

          <div className="woka-options-heading">
            <div><span>EDITANDO</span><strong>{WOKA_PART_LABELS[part]}</strong></div>
            <small>{textures.length + (optional ? 1 : 0)} opções</small>
          </div>

          <div className="woka-options" role="listbox" aria-label={`Opções de ${WOKA_PART_LABELS[part]}`}>
            {optional && (
              <button type="button" className={`woka-option woka-none${value[part] === "" ? " selected" : ""}`} onClick={() => select("")} aria-label={`Sem ${WOKA_PART_LABELS[part].toLowerCase()}`}>
                <X /><span>Nenhum</span>
              </button>
            )}
            {textures.map((texture, index) => (
              <button
                type="button"
                role="option"
                aria-selected={value[part] === texture.id}
                aria-label={`${WOKA_PART_LABELS[part]} ${index + 1}`}
                className={`woka-option${value[part] === texture.id ? " selected" : ""}`}
                key={texture.id}
                onClick={() => select(texture.id)}
              >
                <i style={{ backgroundImage: `url("${wokaTextureUrl(texture.id)}")` }} />
                {value[part] === texture.id && <b><Check /></b>}
              </button>
            ))}
          </div>

          <section className="woka-profile-photo">
            <div className="woka-photo-preview">
              {photo ? <img src={photo} alt="" /> : <AvatarCharacter appearance={value} compact />}
            </div>
            <div><strong>Foto nas chamadas</strong><span>Usada quando sua câmera estiver desligada.</span></div>
            <label><Upload /> {photoUploading ? "Enviando..." : "Enviar"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={photoUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadPhoto(file); event.target.value = ""; }} /></label>
            {photo && <button type="button" onClick={onRemovePhoto} disabled={photoUploading} aria-label="Remover foto"><Trash2 /></button>}
          </section>
          {photoError && <p className="woka-inline-error">{photoError}</p>}
        </div>
      </div>

      {error && <p className="woka-inline-error">{error}</p>}
      <footer className="woka-studio-footer">
        <small>Assets Woka por WorkAdventure</small>
        <div><button type="button" className="woka-cancel" onClick={onCancel}>Cancelar</button><button type="button" className="woka-save" onClick={onSave} disabled={saving}>{saving ? "Salvando..." : <><Check /> Usar este personagem</>}</button></div>
      </footer>
    </section>
  );
}
