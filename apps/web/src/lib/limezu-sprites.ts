import type { AvatarDirection } from "@/components/avatar-character";

export const LIMEZU_SKINS = ["adam", "alex", "amelia", "bob"] as const;
export type LimeZuSkin = (typeof LIMEZU_SKINS)[number];

export const LIMEZU_LABELS: Record<LimeZuSkin, string> = {
  adam: "Adam", alex: "Alex", amelia: "Amelia", bob: "Bob",
};

export const LIMEZU_FRAME_W = 16;
export const LIMEZU_FRAME_H = 32;
export const LIMEZU_RUN_FRAMES = 6;
export const LIMEZU_WALK_FRAME_MS = 110;

// idle.png and run.png lay out their columns as 4 direction blocks in this
// order (6 frames each for run, 1 frame each for idle) — verified by
// inspecting the LimeZu "Modern Interiors" character sheets pixel by pixel.
export const LIMEZU_DIRECTION_COL: Record<AvatarDirection, number> = {
  right: 0, up: 1, left: 2, down: 3,
};

const sprite = (skin: LimeZuSkin, file: string) => `/sprites/limezu/${skin}/${file}`;

export type LimeZuSheets = { idle: string; run: string; sitDown: string; sitLeft: string; sitRight: string };

export const LIMEZU_SHEETS: Record<LimeZuSkin, LimeZuSheets> = Object.fromEntries(
  LIMEZU_SKINS.map((skin) => [skin, {
    idle: sprite(skin, "idle.png"),
    run: sprite(skin, "run.png"),
    sitDown: sprite(skin, "sit-down.png"),
    sitLeft: sprite(skin, "sit-left.png"),
    sitRight: sprite(skin, "sit-right.png"),
  }]),
) as Record<LimeZuSkin, LimeZuSheets>;
