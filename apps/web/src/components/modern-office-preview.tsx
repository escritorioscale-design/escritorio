"use client";

import { useState } from "react";
import { OfficeBuilder, type LocalMoveState } from "@/components/office-builder";
import { AvatarCharacter } from "@/components/avatar-character";
import { DEFAULT_AVATAR } from "@/lib/avatar";
export type { LocalMoveState } from "@/components/office-builder";

/** The preview runs the very same editable office and simulation as /workspace. */
export function ModernOfficePreview() {
  const [player, setPlayer] = useState<LocalMoveState>({ xPercent: 50, yPercent: 50, direction: "down", moving: false, sitting: false, seatId: null });
  return <div className="modern-preview-board">
    <OfficeBuilder onUpdate={setPlayer} showStatus>
      <div className="map-character self-character" aria-label="Seu personagem"
        style={{ left: `${player.xPercent}%`, top: `${player.yPercent}%`, zIndex: Math.round(20 + player.yPercent) }}>
        <AvatarCharacter appearance={{ ...DEFAULT_AVATAR, skin: "adam" }} direction={player.direction} moving={player.moving} sitting={player.sitting} />
        <label>Você</label>
      </div>
    </OfficeBuilder>
  </div>;
}
