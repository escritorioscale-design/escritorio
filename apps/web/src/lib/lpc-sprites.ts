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

type BodyType = AvatarAppearance["bodyType"];

export const BODY_SPRITES: Record<BodyType, string> = {
  male: sprite("body-male.png"),
  female: sprite("body-female.png"),
};

export const EYES_SPRITE = sprite("eyes.png");

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

// hoodie/jacket/blazer only ship a "male" build in this asset set; reused as-is for female bodies.
export const TOP_SPRITES: Record<BodyType, Record<AvatarAppearance["topStyle"], string>> = {
  male: {
    tshirt: sprite("top-tshirt-male.png"),
    hoodie: sprite("top-hoodie.png"),
    jacket: sprite("top-jacket.png"),
    blazer: sprite("top-blazer.png"),
  },
  female: {
    tshirt: sprite("top-tshirt-female.png"),
    hoodie: sprite("top-hoodie.png"),
    jacket: sprite("top-jacket.png"),
    blazer: sprite("top-blazer.png"),
  },
};

export const BOTTOM_SPRITES: Record<BodyType, Record<AvatarAppearance["bottomStyle"], string>> = {
  male: {
    pants: sprite("bottom-pants-male.png"),
    shorts: sprite("bottom-shorts-male.png"),
    skirt: sprite("bottom-skirt-male.png"),
  },
  female: {
    pants: sprite("bottom-pants-female.png"),
    shorts: sprite("bottom-shorts-female.png"),
    skirt: sprite("bottom-skirt-female.png"),
  },
};

export const SHOES_SPRITES: Record<BodyType, string> = {
  male: sprite("bottom-shoes-male.png"),
  female: sprite("bottom-shoes-female.png"),
};

export const ACCESSORY_SPRITES: Record<AvatarAppearance["accessories"][number], string> = {
  glasses: sprite("acc-glasses.png"),
  hat: sprite("acc-hat.png"),
  bowtie: sprite("acc-bowtie.png"),
  earrings: sprite("acc-earrings.png"),
};

export type SpriteLayer = { src: string; color?: string };

export function buildLayers(appearance: AvatarAppearance): SpriteLayer[] {
  const layers: SpriteLayer[] = [
    { src: BODY_SPRITES[appearance.bodyType], color: appearance.skinTone },
    { src: EYES_SPRITE },
    { src: SHOES_SPRITES[appearance.bodyType], color: appearance.shoeColor },
    { src: BOTTOM_SPRITES[appearance.bodyType][appearance.bottomStyle], color: appearance.bottomColor },
    { src: TOP_SPRITES[appearance.bodyType][appearance.topStyle], color: appearance.topColor },
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
    appearance.bodyType,
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
