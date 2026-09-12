import { useEffect, useMemo, useRef } from "react";
import type { AvatarAppearance } from "@/lib/avatar";
import { WOKA_BODY_PARTS, wokaAppearanceKey, wokaTextureUrl } from "@/lib/workadventure-woka";

export type AvatarDirection = "up" | "down" | "left" | "right";

type Props = {
  appearance: AvatarAppearance;
  direction?: AvatarDirection;
  moving?: boolean;
  sitting?: boolean;
  compact?: boolean;
};

const SOURCE_FRAME = 32;
const OUTPUT_FRAME = 64;
const WALK_FRAME_MS = 135;
const WALK_FRAMES = [0, 1, 2, 1];

// Native WorkAdventure Woka sheets use this four-row direction order.
const DIRECTION_ROW: Record<AvatarDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function AvatarCharacter({ appearance, direction = "down", moving = false, sitting = false, compact = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const directionRef = useRef(direction);
  const movingRef = useRef(moving);
  const sittingRef = useRef(sitting);
  directionRef.current = direction;
  movingRef.current = moving;
  sittingRef.current = sitting;

  const textureUrls = useMemo(
    () => WOKA_BODY_PARTS.map((part) => wokaTextureUrl(appearance[part])).filter((url): url is string => Boolean(url)),
    [wokaAppearanceKey(appearance)], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.imageSmoothingEnabled = false;

    let disposed = false;
    let images: HTMLImageElement[] = [];
    let animationStep = 0;
    let lastStep = 0;
    let animationFrame = 0;

    Promise.all(textureUrls.map(loadImage)).then((loaded) => {
      if (!disposed) images = loaded;
    }).catch(() => {});

    function draw(timestamp: number) {
      if (disposed) return;
      if (movingRef.current && timestamp - lastStep >= WALK_FRAME_MS) {
        animationStep = (animationStep + 1) % WALK_FRAMES.length;
        lastStep = timestamp;
      }
      if (!movingRef.current) animationStep = 0;

      context!.clearRect(0, 0, OUTPUT_FRAME, OUTPUT_FRAME);
      const row = DIRECTION_ROW[directionRef.current];
      const frame = movingRef.current ? WALK_FRAMES[animationStep] : 1;
      for (const image of images) {
        context!.drawImage(
          image,
          frame * SOURCE_FRAME,
          row * SOURCE_FRAME,
          SOURCE_FRAME,
          SOURCE_FRAME,
          0,
          0,
          OUTPUT_FRAME,
          OUTPUT_FRAME,
        );
      }
      if (sittingRef.current) context!.clearRect(0, 48, OUTPUT_FRAME, 16);
      animationFrame = requestAnimationFrame(draw);
    }

    animationFrame = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [textureUrls]);

  return (
    <div className={`avatar-character woka-character${moving ? " is-walking" : ""}${sitting ? " is-seated" : ""}${compact ? " is-compact" : ""}`} aria-hidden="true">
      <span className="avatar-ground-shadow" />
      <canvas ref={canvasRef} width={OUTPUT_FRAME} height={OUTPUT_FRAME} className="avatar-canvas" />
    </div>
  );
}
