const {
  EXACT_LIMIT, pathCost, heldKarpPath, nearestNeighborPath, twoOptPath, sequenceDay,
} = require('../services/sequencing');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Integer costs, asymmetric on purpose (like one-way roads).
const randomMatrix = (n, rnd) =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : 1 + Math.floor(rnd() * 50))));
const lineMatrix = (n) =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Math.abs(i - j)));

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}
function bruteForce(cost, start = null) {
  const n = cost.length;
  const all = [...Array(n).keys()];
  let best = Infinity;
  if (start === null) {
    for (const p of permutations(all)) best = Math.min(best, pathCost(cost, p));
  } else {
    for (const p of permutations(all.filter((i) => i !== start))) best = Math.min(best, pathCost(cost, [start, ...p]));
  }
  return best;
}
const isPermutation = (order, n) =>
  order.length === n && new Set(order).size === n && order.every((i) => i >= 0 && i < n);

test('Held-Karp equals brute force with a fixed start (random asymmetric matrices)', () => {
  for (let n = 2; n <= 7; n++) {
    for (let seed = 1; seed <= 3; seed++) {
      const cost = randomMatrix(n, mulberry32(seed * 100 + n));
      const start = seed % n;
      const hk = heldKarpPath(cost, start);
      expect(hk.cost).toBe(bruteForce(cost, start));
      expect(hk.order[0]).toBe(start);
      expect(isPermutation(hk.order, n)).toBe(true);
      expect(pathCost(cost, hk.order)).toBe(hk.cost);
    }
  }
});

test('Held-Karp equals brute force with a free start', () => {
  for (let n = 2; n <= 7; n++) {
    for (let seed = 1; seed <= 3; seed++) {
      const cost = randomMatrix(n, mulberry32(seed * 1000 + n));
      const hk = heldKarpPath(cost, null);
      expect(hk.cost).toBe(bruteForce(cost, null));
      expect(isPermutation(hk.order, n)).toBe(true);
      expect(pathCost(cost, hk.order)).toBe(hk.cost);
    }
  }
});

test('asymmetric costs are respected', () => {
  const cost = [[0, 1], [100, 0]];
  expect(heldKarpPath(cost, null)).toEqual({ order: [0, 1], cost: 1 });
  expect(heldKarpPath(cost, 1)).toEqual({ order: [1, 0], cost: 100 });
});

test('a free start can beat a fixed middle start (line of 7 points)', () => {
  const cost = lineMatrix(7);
  expect(heldKarpPath(cost, 3).cost).toBe(9);
  expect(heldKarpPath(cost, null).cost).toBe(6);
});

test('empty, single place and invalid input', () => {
  expect(heldKarpPath([])).toEqual({ order: [], cost: 0 });
  expect(heldKarpPath([[0]])).toEqual({ order: [0], cost: 0 });
  expect(() => heldKarpPath([[0, 1]])).toThrow();
  expect(() => heldKarpPath([[0, NaN], [1, 0]])).toThrow();
  expect(() => heldKarpPath(lineMatrix(3), 5)).toThrow();
  expect(() => heldKarpPath(lineMatrix(EXACT_LIMIT + 1))).toThrow(/at most 12/);
});

test('nearest neighbor visits every place once, beginning at start', () => {
  const cost = randomMatrix(10, mulberry32(7));
  const order = nearestNeighborPath(cost, 4);
  expect(order[0]).toBe(4);
  expect(isPermutation(order, 10)).toBe(true);
});

test('2-opt never makes the route worse and keeps the start', () => {
  const cost = randomMatrix(14, mulberry32(11));
  const nn = nearestNeighborPath(cost, 2);
  const two = twoOptPath(cost, nn, { fixStart: true });
  expect(two.cost).toBeLessThanOrEqual(pathCost(cost, nn));
  expect(two.order[0]).toBe(2);
  expect(isPermutation(two.order, 14)).toBe(true);
  expect(two.cost).toBe(pathCost(cost, two.order));
});

test('2-opt untangles a bad route on a line', () => {
  const cost = lineMatrix(5);
  const bad = [0, 3, 2, 1, 4];
  expect(pathCost(cost, bad)).toBe(8);
  expect(twoOptPath(cost, bad, { fixStart: true }).cost).toBe(4);
});

test('sequenceDay uses Held-Karp up to 12 places and NN + 2-opt above', () => {
  const small = sequenceDay(randomMatrix(12, mulberry32(5)));
  expect(small.method).toBe('held-karp');
  expect(isPermutation(small.order, 12)).toBe(true);

  const big = sequenceDay(randomMatrix(13, mulberry32(5)));
  expect(big.method).toBe('nn-2opt');
  expect(isPermutation(big.order, 13)).toBe(true);
  expect(big.cost).toBe(pathCost(randomMatrix(13, mulberry32(5)), big.order));
});

test('sequenceDay above 12 places respects a fixed start', () => {
  const cost = randomMatrix(14, mulberry32(21));
  const r = sequenceDay(cost, { start: 5 });
  expect(r.method).toBe('nn-2opt');
  expect(r.order[0]).toBe(5);
  expect(r.cost).toBe(pathCost(cost, r.order));
});

test('forcing the heuristic is never better than the exact answer', () => {
  const cost = randomMatrix(6, mulberry32(9));
  const exact = sequenceDay(cost, { start: 0 });
  const heur = sequenceDay(cost, { start: 0, exactLimit: 3 });
  expect(exact.method).toBe('held-karp');
  expect(heur.method).toBe('nn-2opt');
  expect(heur.cost).toBeGreaterThanOrEqual(exact.cost);
});