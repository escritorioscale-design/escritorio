import { isWokaTexture, WOKA_BODY_PARTS, WOKA_CATALOG, type WokaBodyPart } from "@/lib/workadventure-woka";

export type AvatarAppearance = {
  format: "woka-v1";
  body: string;
  eyes: string;
  clothes: string;
  hair: string;
  hat: string;
  accessory: string;
};

export const DEFAULT_AVATAR: AvatarAppearance = {
  format: "woka-v1",
  body: "body8",
  eyes: "eyes3",
  clothes: "clothes24",
  hair: "hair18",
  hat: "",
  accessory: "",
};

const PRESETS: AvatarAppearance[] = [
  DEFAULT_AVATAR,
  { format: "woka-v1", body: "body3", eyes: "eyes8", clothes: "clothes12", hair: "hair7", hat: "hat11", accessory: "" },
  { format: "woka-v1", body: "body15", eyes: "eyes2", clothes: "clothes38", hair: "hair28", hat: "", accessory: "accessory9" },
  { format: "woka-v1", body: "body21", eyes: "eyes14", clothes: "clothes55", hair: "hair43", hat: "hat4", accessory: "" },
  { format: "woka-v1", body: "body29", eyes: "eyes20", clothes: "clothes67", hair: "hair62", hat: "", accessory: "accessory17" },
];

function fallbackFor(part: WokaBodyPart): string {
  return DEFAULT_AVATAR[part];
}

function stableIndex(value: unknown, size: number): number {
  const source = JSON.stringify(value) || "orbit";
  let hash = 2166136261;
  for (const character of source) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % size;
}

/**
 * Accepts the native Woka payload and transparently migrates older Orbit
 * avatars to a deterministic Woka preset. The profile column is JSON, so no
 * database migration is required.
 */
export function normalizeAvatar(value: unknown, legacyColor?: string): AvatarAppearance {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const looksLikeWoka = input.format === "woka-v1" || WOKA_BODY_PARTS.some((part) => typeof input[part] === "string");

  if (looksLikeWoka) {
    return {
      format: "woka-v1",
      body: isWokaTexture("body", input.body) ? input.body : fallbackFor("body"),
      eyes: isWokaTexture("eyes", input.eyes) ? input.eyes : fallbackFor("eyes"),
      clothes: isWokaTexture("clothes", input.clothes) ? input.clothes : fallbackFor("clothes"),
      hair: isWokaTexture("hair", input.hair) ? input.hair : fallbackFor("hair"),
      hat: isWokaTexture("hat", input.hat, true) ? input.hat : "",
      accessory: isWokaTexture("accessory", input.accessory, true) ? input.accessory : "",
    };
  }

  return { ...PRESETS[stableIndex([value, legacyColor], PRESETS.length)] };
}

export function wokaPreset(index: number): AvatarAppearance {
  return { ...PRESETS[((index % PRESETS.length) + PRESETS.length) % PRESETS.length] };
}

export function randomWokaAppearance(): AvatarAppearance {
  const choose = (part: WokaBodyPart) => {
    const textures = WOKA_CATALOG[part];
    return textures[Math.floor(Math.random() * textures.length)]?.id ?? fallbackFor(part);
  };
  return {
    format: "woka-v1",
    body: choose("body"),
    eyes: choose("eyes"),
    clothes: choose("clothes"),
    hair: choose("hair"),
    hat: Math.random() > .45 ? choose("hat") : "",
    accessory: Math.random() > .7 ? choose("accessory") : "",
  };
}
