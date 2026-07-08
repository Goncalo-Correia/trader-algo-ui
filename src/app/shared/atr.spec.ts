import { computeAtrValues } from './atr';

describe('computeAtrValues', () => {
  it('returns an empty array when there are fewer than period + 1 bars', () => {
    const bars = [
      { high: 10, low: 8, close: 9 },
      { high: 11, low: 9, close: 10 },
    ];
    expect(computeAtrValues(bars, 2)).toEqual([]);
  });

  it('seeds with the simple average of the first `period` true ranges, then applies Wilder smoothing', () => {
    // TR is computed against the previous close:
    //   bar1 TR = max(2, |11-9|, |9-9|)   = 2
    //   bar2 TR = max(2, |12-10|, |10-10|) = 2
    //   bar3 TR = max(2, |9-11|, |7-11|)   = 4
    const bars = [
      { high: 10, low: 8, close: 9 },
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
      { high: 9, low: 7, close: 8 },
    ];

    const result = computeAtrValues(bars, 2);

    // seed at index 2 = (2 + 2) / 2 = 2; then index 3 = (2 * 1 + 4) / 2 = 3.
    expect(result).toEqual([
      { index: 2, value: 2 },
      { index: 3, value: 3 },
    ]);
  });

  it('aligns the first point to bar index `period`', () => {
    const bars = Array.from({ length: 20 }, (_, i) => ({ high: i + 2, low: i, close: i + 1 }));
    const result = computeAtrValues(bars, 14);
    expect(result[0].index).toBe(14);
    expect(result.length).toBe(bars.length - 14);
  });
});
