// choiceLayout.js — cardinal-anchored choice layout, shared by every theme.
//
// Each tile sits at one of 8 compass directions from the prompt, on an orbit
// just outside the prompt's radius. Tile size is computed so the worst-fitting
// tile (typically E/W on a phone) still clears the prompt and the container.

export const CARDINAL_DIR = {
  N:  { ax:  0, ay: -1 },
  NE: { ax:  1, ay: -1 },
  E:  { ax:  1, ay:  0 },
  SE: { ax:  1, ay:  1 },
  S:  { ax:  0, ay:  1 },
  SW: { ax: -1, ay:  1 },
  W:  { ax: -1, ay:  0 },
  NW: { ax: -1, ay: -1 },
};

// Which cardinal positions to use per choice count. Picked for visual balance.
export const CARDINAL_LAYOUT = {
  2: ['W', 'E'],
  3: ['N', 'SW', 'SE'],
  4: ['NW', 'NE', 'SW', 'SE'],
  5: ['N', 'NW', 'NE', 'SW', 'SE'],
  6: ['NW', 'NE', 'W', 'E', 'SW', 'SE'],
  7: ['N', 'NE', 'E', 'SE', 'SW', 'W', 'NW'],  // skip S
};

export function cardinalPositions(count) {
  return CARDINAL_LAYOUT[count] ?? CARDINAL_LAYOUT[7];
}

/**
 * Compute one shared tile size and the centre of each tile.
 *
 * @param {Object} o
 * @param {number} o.width          — container width (px)
 * @param {number} o.height         — container height (px)
 * @param {number} o.promptRadius   — radius of the central prompt (px)
 * @param {number} o.count          — number of choices
 * @param {number} [o.margin=4]     — air between tile rim and container edge
 * @param {number} [o.gap=6]        — air between prompt rim and tile rim
 * @param {number} [o.minTile=80]
 * @param {number} [o.maxTile=220]
 * @returns {{ tileSize: number, centers: {x:number,y:number}[] }}
 */
export function layoutChoices({
  width, height, promptRadius, count,
  margin = 4, gap = 6, minTile = 80, maxTile = 220,
}) {
  const cx = width / 2;
  const cy = height / 2;
  const positions = cardinalPositions(count);

  // For a direction (ux, uy) with orbit r = promptRadius + tileR + gap:
  //   tileR * (1 + |ux|) ≤ cx - margin - (promptRadius + gap) * |ux|
  // and the same vertically. Take the tightest.
  function maxTileForDir(ax, ay) {
    const norm = Math.hypot(ax, ay) || 1;
    const absUx = Math.abs(ax / norm), absUy = Math.abs(ay / norm);
    const tileR_x = (cx - margin - (promptRadius + gap) * absUx) / (1 + absUx);
    const tileR_y = (cy - margin - (promptRadius + gap) * absUy) / (1 + absUy);
    return 2 * Math.min(tileR_x, tileR_y);
  }

  let tileSize = Infinity;
  for (const key of positions) {
    const { ax, ay } = CARDINAL_DIR[key];
    tileSize = Math.min(tileSize, maxTileForDir(ax, ay));
  }
  tileSize = Math.floor(Math.max(minTile, Math.min(maxTile, tileSize)));
  const tileR = tileSize / 2;
  const orbit = promptRadius + tileR + gap;

  const centers = positions.map((key) => {
    const dir = CARDINAL_DIR[key];
    const norm = Math.hypot(dir.ax, dir.ay) || 1;
    return { x: cx + (dir.ax / norm) * orbit, y: cy + (dir.ay / norm) * orbit };
  });
  return { tileSize, centers };
}
