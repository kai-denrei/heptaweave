// bandLayout.js — put the choice tiles where the room is.
//
// The prompt sits in the middle of the play area; around it are four free
// bands (above, below, left, right). On a phone the bands above and below are
// deep and the side bands are slivers, so the cardinal-orbit layout (which
// sizes every tile by the worst direction) starves the tiles. This layout
// measures the bands, uses the deeper pair, splits the choices between them
// and picks, per band, the rows × cols grid that gives the largest tile. All
// tiles share the smallest of the two sizes so no choice is visually favoured.
//
// Pure: no DOM. Coordinates are container-local px, tile centres returned.

/**
 * @param {Object} o
 * @param {number} o.width         container width
 * @param {number} o.height        container height
 * @param {number} o.promptSize    side of the (square) prompt box, centred
 * @param {number} o.count         2..7
 * @param {number} [o.gap=8]       air between tiles, and tile ↔ prompt / edge
 * @param {number} [o.maxTile=220]
 * @param {number} [o.minTile=48]
 * @returns {{ tileSize:number, centers:{x:number,y:number}[], axis:'v'|'h' }}
 */
export function layoutBands({ width, height, promptSize, count, gap = 8, maxTile = 220, minTile = 48 }) {
  const cx = width / 2, cy = height / 2;
  const half = promptSize / 2;
  const vertical = height >= width; // portrait → above/below; landscape → left/right

  // Each band: { depth, length, place(k, tile, rows, cols) → centers }
  let bands;
  if (vertical) {
    const depth = Math.max(0, cy - half - gap);
    bands = [
      { depth, length: width, origin: { x: 0, y: 0 }, far: false },           // above
      { depth, length: width, origin: { x: 0, y: cy + half + gap }, far: true }, // below
    ];
  } else {
    const depth = Math.max(0, cx - half - gap);
    bands = [
      { depth, length: height, origin: { x: 0, y: 0 }, far: false },           // left
      { depth, length: height, origin: { x: cx + half + gap, y: 0 }, far: true }, // right
    ];
  }

  // Split: the far band (below / right — thumb side, reading end) takes the extra.
  const nearCount = Math.floor(count / 2);
  const farCount = count - nearCount;
  const plan = [
    { band: bands[0], k: nearCount },
    { band: bands[1], k: farCount },
  ].filter(p => p.k > 0);

  // Best grid per band: maximise tile over rows (across depth) × cols (along length).
  function bestGrid(band, k) {
    let best = { tile: 0, rows: 1, cols: k };
    for (let rows = 1; rows <= k; rows++) {
      const cols = Math.ceil(k / rows);
      const tileD = (band.depth - gap * (rows + 1)) / rows;
      const tileL = (band.length - gap * (cols + 1)) / cols;
      const tile = Math.min(tileD, tileL);
      if (tile > best.tile) best = { tile, rows, cols };
    }
    return best;
  }
  const grids = plan.map(p => ({ ...p, grid: bestGrid(p.band, p.k) }));
  let tileSize = Math.min(maxTile, ...grids.map(g => g.grid.tile));
  tileSize = Math.floor(Math.max(minTile, tileSize));

  // Place: grid centred in its band, rows along depth, cols along length.
  const centers = [];
  for (const { band, k, grid } of grids) {
    const { rows, cols } = grid;
    const gridD = rows * tileSize + (rows - 1) * gap;
    const offD = (band.depth - gridD) / 2;
    for (let i = 0; i < k; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      // Last row may be short: centre it.
      const inRow = (r === rows - 1) ? (k - r * cols) : cols;
      const rowL = inRow * tileSize + (inRow - 1) * gap;
      const rowOffL = (band.length - rowL) / 2;
      const along = rowOffL + c * (tileSize + gap) + tileSize / 2;
      const deep = offD + r * (tileSize + gap) + tileSize / 2;
      if (vertical) centers.push({ x: band.origin.x + along, y: band.origin.y + deep });
      else centers.push({ x: band.origin.x + deep, y: band.origin.y + along });
    }
  }
  return { tileSize, centers, axis: vertical ? 'v' : 'h' };
}
