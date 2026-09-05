import type { AvatarAppearance } from "@/lib/avatar";
import type { AvatarDirection } from "@/components/avatar-character";

export const FRAME_SIZE = 64;
export const SHEET_COLUMNS = 9;
export const WALK_FRAME_MS = 90;

export const DIRECTION_ROW: Record<AvatarDirection, number> = {
  up: 0,
  left: 1,
  down: 2,
  right: 3,
};

const sprite = (path: string) => `/sprites/lpc/${path}`;

export const BODY_SPRITE = sprite("body.png");

export const HAIR_SPRITES: Record<AvatarAppearance["hairStyle"], string | null> = {
  short: sprite("hair-short.png"),
  bob: sprite("hair-bob.png"),
  curls: sprite("hair-curls.png"),
  bun: sprite("hair-bun.png"),
  long: sprite("hair-long.png"),
  ponytail: sprite("hair-ponytail.png"),
  mohawk: sprite("hair-mohawk.png"),
  afro: sprite("hair-afro.png"),
  spiky: sprite("hair-spiky.png"),
  bald: null,
};

export const TOP_SPRITES: Record<AvatarAppearance["topStyle"], string> = {
  tshirt: sprite("top-tshirt.png"),
  hoodie: sprite("top-hoodie.png"),
  jacket: sprite("top-jacket.png"),
  blazer: sprite("top-blazer.png"),
};

export const BOTTOM_SPRITES: Record<AvatarAppearance["bottomStyle"], string> = {
  pants: sprite("bottom-pants.png"),
  shorts: sprite("bottom-shorts.png"),
  skirt: sprite("bottom-skirt.png"),
};

export const SHOES_SPRITE = sprite("bottom-shoes.png");

export const ACCESSORY_SPRITES: Record<AvatarAppearance["accessories"][number], string> = {
  glasses: sprite("acc-glasses.png"),
  hat: sprite("acc-hat.png"),
  bowtie: sprite("acc-bowtie.png"),
  earrings: sprite("acc-earrings.png"),
};

export type SpriteLayer = { src: string; color?: string };

export function buildLayers(appearance: AvatarAppearance): SpriteLayer[] {
  const layers: SpriteLayer[] = [
    { src: BODY_SPRITE, color: appearance.skinTone },
    { src: SHOES_SPRITE, color: appearance.shoeColor },
    { src: BOTTOM_SPRITES[appearance.bottomStyle], color: appearance.bottomColor },
    { src: TOP_SPRITES[appearance.topStyle], color: appearance.topColor },
  ];
  const hairSrc = HAIR_SPRITES[appearance.hairStyle];
  if (hairSrc) layers.push({ src: hairSrc, color: appearance.hairColor });
  for (const accessory of appearance.accessories) {
    layers.push({ src: ACCESSORY_SPRITES[accessory] });
  }
  return layers;
}

export function layerKey(appearance: AvatarAppearance): string {
  return [
    appearance.skinTone,
    appearance.shoeColor,
    appearance.hairStyle,
    appearance.hairColor,
    appearance.topStyle,
    appearance.topColor,
    appearance.bottomStyle,
    appearance.bottomColor,
    appearance.accessories.slice().sort().join(","),
  ].join("|");
}
