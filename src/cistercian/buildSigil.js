import { getDigitPathsForPlace, PLACE_ORDER } from './digitMap.js';
import { pathsToSegments } from './geometry.js';

export function splitDigits(number) {
  return {
    thousands: Math.floor(number / 1000) % 10,
    hundreds: Math.floor(number / 100) % 10,
    tens: Math.floor(number / 10) % 10,
    units: number % 10,
  };
}

export function buildCistercian(number) {
  const digits = splitDigits(number);
  const segments = [
    {
      from: { x: 1, y: 0 },
      to: { x: 1, y: 3 },
      place: 'stave',
      digit: null,
    },
  ];

  for (const place of PLACE_ORDER) {
    const digit = digits[place];
    const paths = getDigitPathsForPlace(digit, place);
    segments.push(...pathsToSegments(paths, { place, digit }));
  }

  return {
    number,
    digits,
    segments,
  };
}
