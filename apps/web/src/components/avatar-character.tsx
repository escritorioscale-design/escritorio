import type { CSSProperties } from "react";
import type { AvatarAppearance } from "@/lib/avatar";

export type AvatarDirection = "up" | "down" | "left" | "right";

type Props = {
  appearance: AvatarAppearance;
  direction?: AvatarDirection;
  moving?: boolean;
  compact?: boolean;
};

type AvatarStyle = CSSProperties & {
  "--avatar-skin": string;
  "--avatar-hair": string;
  "--avatar-top": string;
  "--avatar-bottom": string;
  "--avatar-shoes": string;
};

export function AvatarCharacter({ appearance, direction = "down", moving = false, compact = false }: Props) {
  const style: AvatarStyle = {
    "--avatar-skin": appearance.skinTone,
    "--avatar-hair": appearance.hairColor,
    "--avatar-top": appearance.topColor,
    "--avatar-bottom": appearance.bottomColor,
    "--avatar-shoes": appearance.shoeColor,
  };
  const accessoryClasses = appearance.accessories.map((accessory) => `accessory-${accessory}`).join(" ");

  return (
    <div
      className={`avatar-character direction-${direction} hair-${appearance.hairStyle} top-${appearance.topStyle} bottom-${appearance.bottomStyle} ${accessoryClasses}${moving ? " is-walking" : ""}${compact ? " is-compact" : ""}`}
      style={style}
      aria-hidden="true"
    >
      <span className="avatar-ground-shadow" />
      <div className="avatar-figure">
        <div className="avatar-leg avatar-leg-left"><i /></div>
        <div className="avatar-leg avatar-leg-right"><i /></div>
        <div className="avatar-arm avatar-arm-left"><i /></div>
        <div className="avatar-arm avatar-arm-right"><i /></div>
        <div className="avatar-torso"><i /></div>
        <span className="avatar-bowtie" />
        <div className="avatar-head">
          <span className="avatar-ear" />
          <span className="avatar-earrings" />
          <span className="avatar-hair" />
          <span className="avatar-face"><i /><i /><b /></span>
          <span className="avatar-glasses"><i /><i /></span>
          <span className="avatar-headphones"><i /><i /></span>
          <span className="avatar-hat" />
        </div>
      </div>
    </div>
  );
}
