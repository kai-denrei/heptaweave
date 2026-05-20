export const PLACE_ORDER = ['thousands', 'hundreds', 'tens', 'units'];

export const PLACE_LABELS = {
  thousands: 'Thousands',
  hundreds: 'Hundreds',
  tens: 'Tens',
  units: 'Units',
};

const p = (x, y) => ({ x, y });

export const UNIT_DIGIT_PATHS = {
  0: [],
  1: [[p(1, 0), p(2, 0)]],
  2: [[p(1, 1), p(2, 1)]],
  3: [[p(1, 0), p(2, 1)]],
  4: [[p(1, 1), p(2, 0)]],
  5: [[p(1, 1), p(2, 0), p(1, 0)]],
  6: [[p(2, 0), p(2, 1)]],
  7: [[p(1, 0), p(2, 0), p(2, 1)]],
  8: [[p(1, 1), p(2, 1), p(2, 0)]],
  9: [[p(1, 1), p(2, 1), p(2, 0), p(1, 0)]],
};

export function transformPointForPlace(point, place) {
  const mirrorX = place === 'tens' || place === 'thousands';
  const mirrorY = place === 'hundreds' || place === 'thousands';

  return {
    x: mirrorX ? 2 - point.x : point.x,
    y: mirrorY ? 3 - point.y : point.y,
  };
}

export function getDigitPathsForPlace(digit, place) {
  const paths = UNIT_DIGIT_PATHS[digit] ?? UNIT_DIGIT_PATHS[0];
  return paths.map((path) => path.map((point) => transformPointForPlace(point, place)));
}
