import { useEffect, useMemo, useRef } from "react";
import type { AvatarAppearance } from "@/lib/avatar";
import { buildLayers, DIRECTION_ROW, FRAME_SIZE, layerKey, WALK_FRAME_MS } from "@/lib/lpc-sprites";
import { getLayerImage } from "@/lib/sprite-recolor";

export type AvatarDirection = "up" | "down" | "left" | "right";

type Props = {
  appearance: AvatarAppearance;
  direction?: AvatarDirection;
  moving?: boolean;
  compact?: boolean;
};

export function AvatarCharacter({ appearance, direction = "down", moving = false, compact = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const directionRef = useRef(direction);
  const movingRef = useRef(moving);
  directionRef.current = direction;
  movingRef.current = moving;

  const layers = useMemo(() => buildLayers(appearance), [layerKey(appearance)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let cancelled = false;
    let images: CanvasImageSource[] = [];
    let frame = 0;
    let lastStep = 0;
    let rafId = 0;

    Promise.all(layers.map((layer) => getLayerImage(layer.src, layer.color)))
      .then((loaded) => {
        if (!cancelled) images = loaded;
      })
      .catch(() => {});

    function draw(timestamp: number) {
      if (cancelled) return;
      if (images.length) {
        const row = DIRECTION_ROW[directionRef.current];
        if (movingRef.current) {
          if (timestamp - lastStep > WALK_FRAME_MS) {
            frame = (frame % 8) + 1;
            lastStep = timestamp;
          }
        } else {
          frame = 0;
        }
        ctx!.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
        for (const image of images) {
          ctx!.drawImage(image, frame * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
        }
      }
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [layers]);

  return (
    <div
      className={`avatar-character${moving ? " is-walking" : ""}${compact ? " is-compact" : ""}`}
      aria-hidden="true"
    >
      <span className="avatar-ground-shadow" />
      <canvas ref={canvasRef} width={FRAME_SIZE} height={FRAME_SIZE} className="avatar-canvas" />
    </div>
  );
}
