import type { CSSProperties } from "react";
import { defaultFootprint, furnitureCollider, itemLabel, TILE, type LayoutFurniture } from "@/lib/office-layout";
import { OFFICE_ITEM_SPRITES, OFFICE_SPRITES } from "@/lib/office-sprites";

function PixelSprite({ id, width, height }: { id: number; width: number; height: number }) {
  const [x, y, w, h] = OFFICE_SPRITES[id];
  return <span className="office-pixel-sprite" aria-hidden="true" style={{ width, height,
    backgroundImage: `url(/office/furniture/item-${id}.png)`, backgroundSize: `${32 * width / w}px ${48 * height / h}px`,
    backgroundPosition: `${-x * width / w}px ${-y * height / h}px` }} />;
}

const SIZES: Record<string, [number, number]> = {
  monitor: [1.4, 1], laptop: [1.1, .9], papers: [.65, .65], whiteboard: [3.4, 1.9],
  "whiteboard-blank": [3.4, 1.9], bookshelf: [2, 2.8], watercooler: [1.1, 2],
  "plant-tree": [1.4, 2.3], "plant-small": [.8, 1.2], "plant-pot-a": [1, 1.5],
  "plant-pot-b": [1, 1.5], sofa: [5.2, 3], cabinet: [1.6, 2.4],
  printer: [1.5, 1.6], "coffee-machine": [1.6, 1.8],
};

/** Furniture and its floor footprint share a center. Tall decor rises above
 * that point, allowing actors to pass behind it using the same depth scale. */
export function OfficeFurniture({ piece, rows, tile = TILE }: { piece: LayoutFurniture; rows: number; tile?: number }) {
  const footprint = furnitureCollider(piece);
  const base = defaultFootprint(piece.key);
  const scale = piece.scale ?? 1;
  const isDesk = piece.key.startsWith("desk"), isTable = piece.key === "table-long";
  const isChair = piece.key.startsWith("chair");
  const size = SIZES[piece.key] ?? [base?.w ?? 1, base?.h ?? 1];
  const w = isDesk || isTable ? footprint?.w ?? 3.2 * scale : (isChair ? .95 : size[0]) * scale;
  const h = isDesk || isTable ? footprint?.h ?? 1.6 * scale : (isChair ? 1.45 : size[1]) * scale;
  const onDesk = ["monitor", "laptop", "papers", "keyboard"].includes(piece.key);
  const depth = Math.round(20 + ((piece.y + (onDesk ? 1.6 : 0)) / rows) * 100);
  const style: CSSProperties = {
    left: piece.x * tile, top: piece.y * tile, width: w * tile, height: h * tile,
    zIndex: depth, transform: `translate(-50%, ${isDesk || isTable ? "-50%" : "-78%"})`,
  };
  if (isDesk || isTable) return <div aria-label={itemLabel(piece.key)} data-furniture={piece.id}
    className={`office-real-desk ${isTable ? "is-meeting-table" : "is-workstation"} ${piece.key.includes("dark") ? "is-executive" : ""}`} style={style}>
    <PixelSprite id={isTable ? 258 : piece.key.includes("dark") ? 268 : 253} width={w * tile} height={h * tile + 12} />
    {isDesk && <span className="desk-divider" />}
    {isTable && <span className="conference-speaker" />}
  </div>;
  const chairSprites = piece.key === "chair-orange" ? { up: 112, down: 107, left: 109, right: 110 } : { up: 106, down: 101, left: 103, right: 104 };
  const sprite = isChair ? chairSprites[piece.facing ?? "up"] : OFFICE_ITEM_SPRITES[piece.key];
  return <div data-furniture={piece.id} aria-label={itemLabel(piece.key)} className={`office-real-item ${isChair ? "is-chair" : ""}`} style={style}>
    {sprite ? <PixelSprite id={sprite} width={w * tile} height={h * tile} /> : <img src={`/tileset/items/${piece.key}.png`} alt={itemLabel(piece.key)} draggable={false} />}
  </div>;
}
