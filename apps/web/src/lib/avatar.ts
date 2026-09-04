export const AVATAR_SKIN_TONES = ["#f6d2b8", "#e7b98f", "#c8895e", "#9b5f3f", "#70422f", "#3f271f"] as const;
export const AVATAR_HAIR_COLORS = ["#211b18", "#4a3026", "#7a4b2d", "#b8773e", "#d6b06a", "#8a2934", "#d8d4ce"] as const;
export const AVATAR_TOP_COLORS = ["#7257e8", "#397bd9", "#21a179", "#d84d68", "#e58c35", "#252529", "#f1efe9", "#d8ff63"] as const;
export const AVATAR_BOTTOM_COLORS = ["#253047", "#3f526f", "#6a594c", "#242426", "#805f9b", "#d8d4ca"] as const;
export const AVATAR_SHOE_COLORS = ["#f4f1e9", "#28282b", "#6e4935", "#d04a50"] as const;
export const AVATAR_HAIR_STYLES = ["short", "bob", "curls", "bun"] as const;
export const AVATAR_ACCESSORIES = ["none", "glasses", "headphones"] as const;

export type AvatarAppearance = {
  skinTone: (typeof AVATAR_SKIN_TONES)[number];
  hairStyle: (typeof AVATAR_HAIR_STYLES)[number];
  hairColor: (typeof AVATAR_HAIR_COLORS)[number];
  topColor: (typeof AVATAR_TOP_COLORS)[number];
  bottomColor: (typeof AVATAR_BOTTOM_COLORS)[number];
  shoeColor: (typeof AVATAR_SHOE_COLORS)[number];
  accessory: (typeof AVATAR_ACCESSORIES)[number];
};

export const DEFAULT_AVATAR: AvatarAppearance = {
  skinTone: "#c8895e",
  hairStyle: "short",
  hairColor: "#211b18",
  topColor: "#7257e8",
  bottomColor: "#253047",
  shoeColor: "#f4f1e9",
  accessory: "none",
};

function allowed<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && options.includes(value) ? value as T[number] : fallback;
}

export function normalizeAvatar(value: unknown, legacyColor?: string): AvatarAppearance {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const legacyTop = typeof legacyColor === "string" && (AVATAR_TOP_COLORS as readonly string[]).includes(legacyColor)
    ? legacyColor as AvatarAppearance["topColor"]
    : DEFAULT_AVATAR.topColor;

  return {
    skinTone: allowed(input.skinTone, AVATAR_SKIN_TONES, DEFAULT_AVATAR.skinTone),
    hairStyle: allowed(input.hairStyle, AVATAR_HAIR_STYLES, DEFAULT_AVATAR.hairStyle),
    hairColor: allowed(input.hairColor, AVATAR_HAIR_COLORS, DEFAULT_AVATAR.hairColor),
    topColor: allowed(input.topColor, AVATAR_TOP_COLORS, legacyTop),
    bottomColor: allowed(input.bottomColor, AVATAR_BOTTOM_COLORS, DEFAULT_AVATAR.bottomColor),
    shoeColor: allowed(input.shoeColor, AVATAR_SHOE_COLORS, DEFAULT_AVATAR.shoeColor),
    accessory: allowed(input.accessory, AVATAR_ACCESSORIES, DEFAULT_AVATAR.accessory),
  };
}
