// services/kmedoids.js
// Day clustering on ROAD travel time. Same job as kMeans (k groups = k days), but the distance between two
// places is the OSRM duration matrix instead of straight-line distance, and the centre of a day is a real
// place (the medoid), not an average point.
//
// D = n x n matrix of minutes (it may be asymmetric because of one-way roads; the average of both directions is used).
// Returns k arrays of place indexes, like kMeans does.

const sym = (D, i, j) => (D[i][j] + D[j][i]) / 2;

function assertMatrix(D) {
  if (!Array.isArray(D) || !D.every((r) => Array.isArray(r) && r.length === D.length)) {
    throw new Error('D must be an n x n matrix');
  }
  D.forEach((row) => row.forEach((v) => {
    if (!Number.isFinite(v)) throw new Error('D must contain only finite numbers');
  }));
}

function initMedoids(D, k) {
  const n = D.length;
  // first medoid: the most central place (smallest total time to all the others), ties -> lowest index
  let first = 0;
  let bestSum = Infinity;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += sym(D, i, j);
    if (s < bestSum) { bestSum = s; first = i; }
  }
  const chosen = [first];
  // then farthest-first, like the K-Means start
  while (chosen.length < k) {
    let far = -1;
    let farD = -1;
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i)) continue;
      const d = Math.min(...chosen.map((m) => sym(D, i, m)));
      if (d > farD) { farD = d; far = i; }
    }
    chosen.push(far);
  }
  return chosen;
}

function assignToMedoids(D, medoids) {
  const n = D.length;
  const assign = new Array(n).fill(-1);
  medoids.forEach((m, c) => { assign[m] = c; }); // a medoid always stays in its own cluster (no empty clusters)
  for (let i = 0; i < n; i++) {
    if (assign[i] !== -1) continue;
    let bestC = 0;
    let bestD = Infinity;
    medoids.forEach((m, c) => {
      const d = sym(D, i, m);
      if (d < bestD) { bestD = d; bestC = c; }
    });
    assign[i] = bestC;
  }
  return assign;
}

function kMedoids(D, k, maxIter = 50) {
  if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer');
  assertMatrix(D);
  const n = D.length;
  if (n === 0) return Array.from({ length: k }, () => []);
  if (k === 1) return [D.map((_, i) => i)];
  if (n <= k) return Array.from({ length: k }, (_, c) => (c < n ? [c] : [])); // fewer places than days

  let medoids = initMedoids(D, k);
  let assign = assignToMedoids(D, medoids);

  for (let iter = 0; iter < maxIter; iter++) {
    const next = medoids.map((old, c) => {
      const members = [];
      assign.forEach((a, i) => { if (a === c) members.push(i); });
      let best = old;
      let bestSum = Infinity;
      for (const i of members) {
        let s = 0;
        for (const j of members) s += sym(D, i, j);
        if (s < bestSum - 1e-9 || (Math.abs(s - bestSum) <= 1e-9 && i < best)) { bestSum = s; best = i; }
      }
      return best;
    });
    const same = next.every((m, c) => m === medoids[c]);
    medoids = next;
    assign = assignToMedoids(D, medoids);
    if (same) break;
  }

  const clusters = Array.from({ length: k }, () => []);
  assign.forEach((c, i) => clusters[c].push(i));
  return clusters;
}

module.exports = { kMedoids };
