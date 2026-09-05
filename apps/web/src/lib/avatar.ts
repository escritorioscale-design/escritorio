export const AVATAR_SKIN_TONES = ["#f6d2b8", "#e7b98f", "#c8895e", "#9b5f3f", "#70422f", "#3f271f"] as const;
export const AVATAR_HAIR_COLORS = ["#211b18", "#4a3026", "#7a4b2d", "#b8773e", "#d6b06a", "#8a2934", "#d8d4ce", "#4f6fd8", "#c85fd0"] as const;
export const AVATAR_TOP_COLORS = ["#7257e8", "#397bd9", "#21a179", "#d84d68", "#e58c35", "#252529", "#f1efe9", "#d8ff63", "#8a3ffc", "#0f9aa8"] as const;
export const AVATAR_BOTTOM_COLORS = ["#253047", "#3f526f", "#6a594c", "#242426", "#805f9b", "#d8d4ca", "#7a2b30"] as const;
export const AVATAR_SHOE_COLORS = ["#f4f1e9", "#28282b", "#6e4935", "#d04a50", "#d8ff63"] as const;
export const AVATAR_HAIR_STYLES = ["short", "bob", "curls", "bun", "long", "ponytail", "mohawk", "afro", "spiky", "bald"] as const;
export const AVATAR_TOP_STYLES = ["tshirt", "hoodie", "jacket", "blazer"] as const;
export const AVATAR_BOTTOM_STYLES = ["pants", "shorts", "skirt"] as const;
export const AVATAR_ACCESSORIES = ["glasses", "headphones", "hat", "bowtie", "earrings"] as const;

export type AvatarAppearance = {
  skinTone: (typeof AVATAR_SKIN_TONES)[number];
  hairStyle: (typeof AVATAR_HAIR_STYLES)[number];
  hairColor: (typeof AVATAR_HAIR_COLORS)[number];
  topStyle: (typeof AVATAR_TOP_STYLES)[number];
  topColor: (typeof AVATAR_TOP_COLORS)[number];
  bottomStyle: (typeof AVATAR_BOTTOM_STYLES)[number];
  bottomColor: (typeof AVATAR_BOTTOM_COLORS)[number];
  shoeColor: (typeof AVATAR_SHOE_COLORS)[number];
  accessories: (typeof AVATAR_ACCESSORIES)[number][];
};

export const DEFAULT_AVATAR: AvatarAppearance = {
  skinTone: "#c8895e",
  hairStyle: "short",
  hairColor: "#211b18",
  topStyle: "tshirt",
  topColor: "#7257e8",
  bottomStyle: "pants",
  bottomColor: "#253047",
  shoeColor: "#f4f1e9",
  accessories: [],
};

function allowed<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && options.includes(value) ? value as T[number] : fallback;
}

export function normalizeAvatar(value: unknown, legacyColor?: string): AvatarAppearance {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const legacyTop = typeof legacyColor === "string" && (AVATAR_TOP_COLORS as readonly string[]).includes(legacyColor)
    ? legacyColor as AvatarAppearance["topColor"]
    : DEFAULT_AVATAR.topColor;

  const rawAccessories = Array.isArray(input.accessories)
    ? input.accessories
    : typeof input.accessory === "string" && input.accessory !== "none"
      ? [input.accessory]
      : [];
  const accessories = Array.from(new Set(
    rawAccessories.filter((item): item is AvatarAppearance["accessories"][number] =>
      typeof item === "string" && (AVATAR_ACCESSORIES as readonly string[]).includes(item)),
  ));

  return {
    skinTone: allowed(input.skinTone, AVATAR_SKIN_TONES, DEFAULT_AVATAR.skinTone),
    hairStyle: allowed(input.hairStyle, AVATAR_HAIR_STYLES, DEFAULT_AVATAR.hairStyle),
    hairColor: allowed(input.hairColor, AVATAR_HAIR_COLORS, DEFAULT_AVATAR.hairColor),
    topStyle: allowed(input.topStyle, AVATAR_TOP_STYLES, DEFAULT_AVATAR.topStyle),
    topColor: allowed(input.topColor, AVATAR_TOP_COLORS, legacyTop),
    bottomStyle: allowed(input.bottomStyle, AVATAR_BOTTOM_STYLES, DEFAULT_AVATAR.bottomStyle),
    bottomColor: allowed(input.bottomColor, AVATAR_BOTTOM_COLORS, DEFAULT_AVATAR.bottomColor),
    shoeColor: allowed(input.shoeColor, AVATAR_SHOE_COLORS, DEFAULT_AVATAR.shoeColor),
    accessories,
  };
}
