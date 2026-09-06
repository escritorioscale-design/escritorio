/** Original, unmodified singles from the licensed Modern Office package.
 * Transparent padding is clipped at render time, never mistaken for a footprint. */
export const OFFICE_SPRITES: Record<number, readonly [number, number, number, number]> = {
  101: [0, 23, 16, 23], 103: [2, 21, 12, 23], 104: [2, 21, 12, 23], 106: [0, 25, 16, 21],
  107: [0, 23, 16, 23], 109: [2, 21, 12, 23], 110: [2, 21, 12, 23], 112: [0, 25, 16, 21],
  98: [0, 10, 16, 28], 99: [0, 20, 16, 18], 100: [2, 12, 12, 26],
  130: [0, 34, 16, 14], 153: [4, 36, 12, 12], 170: [1, 23, 30, 23], 171: [1, 23, 30, 23],
  173: [1, 8, 14, 30], 174: [8, 16, 18, 23], 200: [1, 20, 31, 24],
  253: [0, 16, 32, 19], 258: [0, 16, 32, 19], 268: [0, 16, 32, 19], 92: [0, 32, 16, 16],
};
export const OFFICE_ITEM_SPRITES: Record<string, number> = {
  monitor: 130, papers: 153, whiteboard: 171, "whiteboard-blank": 170,
  watercooler: 173, cabinet: 174, "plant-tree": 98, "plant-small": 99,
  "plant-pot-a": 100, "plant-pot-b": 99, sofa: 200,
};
