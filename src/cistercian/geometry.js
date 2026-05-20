export function pathsToSegments(paths, metadata = {}) {
  const segments = [];
  for (const path of paths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      segments.push({
        from: path[index],
        to: path[index + 1],
        ...metadata,
      });
    }
  }
  return segments;
}

export function logicalToCanvas(point, width, height) {
  const tall = height / Math.max(1, width) > 1.4;
  const widthFactor = tall ? 0.28 : 0.34;
  const heightFactor = tall ? 0.20 : 0.245;
  const unit = Math.min(width * widthFactor, height * heightFactor);
  const top = height / 2 - unit * 1.5;

  return {
    x: width / 2 + (point.x - 1) * unit,
    y: top + point.y * unit,
  };
}

export function segmentLength(segment) {
  return Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
}

export function interpolatePoint(from, to, t) {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
