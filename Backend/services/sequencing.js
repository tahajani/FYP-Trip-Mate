// Day sequencing on a duration matrix: exact Held-Karp (n <= 12) and Nearest Neighbor + 2-opt (n > 12).
// Open path: the route starts at `start` (or at the best start when start is null) and ends anywhere.
// Matrices may be asymmetric (one-way roads), so nothing here assumes cost[a][b] === cost[b][a].

const EXACT_LIMIT = 12; // Held-Karp is O(2^n * n^2); 2^12 states is instant, 2^20 is not

function matrixSize(cost) {
  const n = Array.isArray(cost) ? cost.length : -1;
  const ok = n >= 0 && cost.every((row) => Array.isArray(row) && row.length === n && row.every(Number.isFinite));
  if (!ok) throw new Error('cost must be an n x n matrix of finite numbers');
  return n;
}

function checkStart(start, n) {
  if (start !== null && !(Number.isInteger(start) && start >= 0 && start < n)) {
    throw new Error('start must be null or a valid index');
  }
}

function pathCost(cost, order) {
  let sum = 0;
  for (let k = 0; k < order.length - 1; k++) sum += cost[order[k]][order[k + 1]];
  return sum;
}

// Exact. dp[mask * n + last] = cheapest path that starts at a start city, visits `mask`, ends at `last`.
function heldKarpPath(cost, start = null) {
  const n = matrixSize(cost);
  checkStart(start, n);
  if (n === 0) return { order: [], cost: 0 };
  if (n === 1) return { order: [0], cost: 0 };
  if (n > EXACT_LIMIT) throw new Error(`Held-Karp supports at most ${EXACT_LIMIT} places`);

  const size = 1 << n;
  const dp = new Float64Array(size * n).fill(Infinity);
  const parent = new Int8Array(size * n).fill(-1);
  const starts = start === null ? [...Array(n).keys()] : [start];
  for (const s of starts) dp[(1 << s) * n + s] = 0;

  for (let mask = 1; mask < size; mask++) {
    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last))) continue;
      const cur = dp[mask * n + last];
      if (cur === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const value = cur + cost[last][next];
        if (value < dp[nextMask * n + next]) {
          dp[nextMask * n + next] = value;
          parent[nextMask * n + next] = last;
        }
      }
    }
  }

  const full = size - 1;
  let bestLast = -1;
  let best = Infinity;
  for (let j = 0; j < n; j++) {
    const v = dp[full * n + j];
    if (v < best) { best = v; bestLast = j; }
  }

  const order = [];
  let mask = full;
  let last = bestLast;
  while (last !== -1) {
    order.push(last);
    const prev = parent[mask * n + last];
    mask ^= 1 << last;
    last = prev;
  }
  order.reverse();
  return { order, cost: best };
}

function nearestNeighborPath(cost, start) {
  const n = cost.length;
  const visited = new Array(n).fill(false);
  const order = [start];
  visited[start] = true;
  while (order.length < n) {
    const last = order[order.length - 1];
    let best = -1;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      if (best === -1 || cost[last][j] < cost[last][best]) best = j;
    }
    visited[best] = true;
    order.push(best);
  }
  return order;
}

// Reverses a segment whenever that lowers the total cost. The full path cost is recomputed after each
// reversal because reversing changes edge directions, which matters for asymmetric matrices.
function twoOptPath(cost, order, { fixStart = true, maxPasses = 200 } = {}) {
  let best = order.slice();
  let bestCost = pathCost(cost, best);
  const from = fixStart ? 1 : 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = from; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const c = pathCost(cost, candidate);
        if (c < bestCost - 1e-9) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { order: best, cost: bestCost };
}

// Held-Karp up to exactLimit places, Nearest Neighbor + 2-opt above it.
function sequenceDay(cost, { start = null, exactLimit = EXACT_LIMIT } = {}) {
  const n = matrixSize(cost);
  checkStart(start, n);
  if (n === 0) return { order: [], cost: 0, method: 'none' };
  if (n === 1) return { order: [0], cost: 0, method: 'none' };

  if (n <= Math.min(exactLimit, EXACT_LIMIT)) {
    return { ...heldKarpPath(cost, start), method: 'held-karp' };
  }

  const starts = start === null ? [...Array(n).keys()] : [start];
  let best = null;
  for (const s of starts) {
    const r = twoOptPath(cost, nearestNeighborPath(cost, s), { fixStart: start !== null });
    if (!best || r.cost < best.cost) best = r;
  }
  return { ...best, method: 'nn-2opt' };
}

module.exports = { EXACT_LIMIT, pathCost, heldKarpPath, nearestNeighborPath, twoOptPath, sequenceDay };