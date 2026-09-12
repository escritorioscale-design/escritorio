import sourceCatalog from "@/data/workadventure-woka.json";

export const WOKA_BODY_PARTS = ["body", "eyes", "clothes", "hair", "hat", "accessory"] as const;
export type WokaBodyPart = (typeof WOKA_BODY_PARTS)[number];

export type WokaTexture = {
  id: string;
  name: string;
  url: string;
  position: number;
};

type WokaCatalog = Record<WokaBodyPart, { collections: Array<{ textures: WokaTexture[] }> }>;

const catalog = sourceCatalog as WokaCatalog;

export const WOKA_PART_LABELS: Record<WokaBodyPart, string> = {
  body: "Corpo",
  eyes: "Olhos",
  clothes: "Roupa",
  hair: "Cabelo",
  hat: "Chapéu",
  accessory: "Acessório",
};

export const WOKA_CATALOG = Object.fromEntries(
  WOKA_BODY_PARTS.map((part) => [part, catalog[part].collections.flatMap((collection) => collection.textures)]),
) as Record<WokaBodyPart, WokaTexture[]>;

const texturesById = new Map(
  WOKA_BODY_PARTS.flatMap((part) => WOKA_CATALOG[part].map((texture) => [texture.id, texture] as const)),
);

export function wokaTextureUrl(textureId: string): string | null {
  const texture = texturesById.get(textureId);
  return texture ? `/workadventure/${texture.url.replace(/^resources\//, "")}` : null;
}

export function isWokaTexture(part: WokaBodyPart, textureId: unknown, optional = false): textureId is string {
  if (optional && textureId === "") return true;
  return typeof textureId === "string" && WOKA_CATALOG[part].some((texture) => texture.id === textureId);
}

export function wokaAppearanceKey(appearance: Record<WokaBodyPart, string>): string {
  return WOKA_BODY_PARTS.map((part) => appearance[part]).join(":");
}
