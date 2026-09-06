import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { AvatarAppearance } from "@/lib/avatar";
import { buildLayers, DIRECTION_ROW, FRAME_SIZE, layerKey, WALK_FRAME_MS } from "@/lib/lpc-sprites";
import {
  LIMEZU_DIRECTION_COL, LIMEZU_FRAME_H, LIMEZU_FRAME_W, LIMEZU_RUN_FRAMES, LIMEZU_SHEETS, LIMEZU_WALK_FRAME_MS,
  type LimeZuSkin,
} from "@/lib/limezu-sprites";
import { getLayerImage } from "@/lib/sprite-recolor";

export type AvatarDirection = "up" | "down" | "left" | "right";

type Props = {
  appearance: AvatarAppearance;
  direction?: AvatarDirection;
  moving?: boolean;
  sitting?: boolean;
  compact?: boolean;
};

export function AvatarCharacter({ appearance, direction = "down", moving = false, sitting = false, compact = false }: Props) {
  if (appearance.skin !== "custom") {
    return <LimeZuCharacter skin={appearance.skin} direction={direction} moving={moving} sitting={sitting} compact={compact} />;
  }
  return <CustomCharacter appearance={appearance} direction={direction} moving={moving} sitting={sitting} compact={compact} />;
}

function AvatarFrame({ moving, sitting, compact, canvasRef }: {
  moving: boolean; sitting: boolean; compact: boolean; canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <div
      className={`avatar-character${moving ? " is-walking" : ""}${sitting ? " is-seated" : ""}${compact ? " is-compact" : ""}`}
      aria-hidden="true"
    >
      <span className="avatar-ground-shadow" />
      <canvas ref={canvasRef} width={FRAME_SIZE} height={FRAME_SIZE} className="avatar-canvas" />
    </div>
  );
}

function CustomCharacter({ appearance, direction, moving, sitting, compact }: Required<Omit<Props, "appearance">> & { appearance: AvatarAppearance }) {
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

  return <AvatarFrame moving={moving} sitting={sitting} compact={compact} canvasRef={canvasRef} />;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement, sx: number, sw: number, sh: number) {
  const scale = FRAME_SIZE / sh;
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(img, sx, 0, sw, sh, (FRAME_SIZE - dw) / 2, FRAME_SIZE - dh, dw, dh);
}

function LimeZuCharacter({ skin, direction, moving, sitting, compact }: {
  skin: LimeZuSkin; direction: AvatarDirection; moving: boolean; sitting: boolean; compact: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const directionRef = useRef(direction);
  const movingRef = useRef(moving);
  const sittingRef = useRef(sitting);
  directionRef.current = direction;
  movingRef.current = moving;
  sittingRef.current = sitting;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let cancelled = false;
    const sheets = LIMEZU_SHEETS[skin];
    let idle: HTMLImageElement | undefined;
    let run: HTMLImageElement | undefined;
    let sitDown: HTMLImageElement | undefined;
    let sitLeft: HTMLImageElement | undefined;
    let sitRight: HTMLImageElement | undefined;
    let frame = 0;
    let lastStep = 0;
    let rafId = 0;

    Promise.all([loadImage(sheets.idle), loadImage(sheets.run), loadImage(sheets.sitDown), loadImage(sheets.sitLeft), loadImage(sheets.sitRight)])
      .then(([idleImg, runImg, sitDownImg, sitLeftImg, sitRightImg]) => {
        if (cancelled) return;
        idle = idleImg; run = runImg; sitDown = sitDownImg; sitLeft = sitLeftImg; sitRight = sitRightImg;
      })
      .catch(() => {});

    function draw(timestamp: number) {
      if (cancelled) return;
      if (run && idle && sitDown && sitLeft && sitRight) {
        ctx!.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
        const dir = directionRef.current;
        if (sittingRef.current) {
          if (dir === "up") {
            // The back-facing torso aligns with the cushion; the chair hides
            // the legs. A front-facing sit would turn the user away from work.
            drawSprite(ctx!, idle, LIMEZU_DIRECTION_COL.up * LIMEZU_FRAME_W, LIMEZU_FRAME_W, LIMEZU_FRAME_H);
            ctx!.clearRect(0, 46, FRAME_SIZE, FRAME_SIZE - 46);
          } else {
            const sitImg = dir === "left" ? sitLeft : dir === "right" ? sitRight : sitDown;
            drawSprite(ctx!, sitImg, 0, sitImg.naturalWidth, sitImg.naturalHeight);
          }
        } else if (movingRef.current) {
          if (timestamp - lastStep > LIMEZU_WALK_FRAME_MS) {
            frame = (frame + 1) % LIMEZU_RUN_FRAMES;
            lastStep = timestamp;
          }
          const col = LIMEZU_DIRECTION_COL[dir] * LIMEZU_RUN_FRAMES + frame;
          drawSprite(ctx!, run, col * LIMEZU_FRAME_W, LIMEZU_FRAME_W, LIMEZU_FRAME_H);
        } else {
          frame = 0;
          drawSprite(ctx!, idle, LIMEZU_DIRECTION_COL[dir] * LIMEZU_FRAME_W, LIMEZU_FRAME_W, LIMEZU_FRAME_H);
        }
      }
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [skin]);

  return <AvatarFrame moving={moving} sitting={sitting} compact={compact} canvasRef={canvasRef} />;
}
