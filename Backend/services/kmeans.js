const { haversineKm } = require('../utils/geo');

const dist = (p, c) => haversineKm(p.lat, p.lon, c.lat, c.lon);

// WARNING: Mongo stores [lon, lat]; this converts a POI document to {lat, lon}.
const toPoint = (poi) => ({ lat: poi.location.coordinates[1], lon: poi.location.coordinates[0] });

function initCentroids(points, k) {
  const n = points.length;
  const mean = {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lon: points.reduce((s, p) => s + p.lon, 0) / n,
  };
  let first = 0;
  let best = Infinity;
  points.forEach((p, i) => {
    const d = dist(p, mean);
    if (d < best) { best = d; first = i; }
  });
  const chosen = [first];
  while (chosen.length < k) {
    let far = -1;
    let farD = -1;
    points.forEach((p, i) => {
      if (chosen.includes(i)) return;
      const d = Math.min(...chosen.map((c) => dist(p, points[c])));
      if (d > farD) { farD = d; far = i; }
    });
    chosen.push(far);
  }
  return chosen.map((i) => ({ lat: points[i].lat, lon: points[i].lon }));
}

// points: [{lat, lon}], k = days. Returns k arrays of point indices (one per day).
function kMeans(points, k, maxIter = 100) {
  if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer');
  const n = points.length;
  if (n === 0) return Array.from({ length: k }, () => []);
  if (k === 1) return [points.map((_, i) => i)];
  if (n <= k) return Array.from({ length: k }, (_, c) => (c < n ? [c] : [])); // fewer places than days

  let centroids = initCentroids(points, k);
  const assign = new Array(n).fill(-1);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist(points[i], centroids[c]);
        if (d < bestD) { bestD = d; bestC = c; }
      }
      if (assign[i] !== bestC) { assign[i] = bestC; changed = true; }
    }

    // Empty cluster: take the point farthest from its centroid out of a cluster that has 2+ points
    for (let c = 0; c < k; c++) {
      if (assign.includes(c)) continue;
      let far = -1;
      let farD = -1;
      for (let i = 0; i < n; i++) {
        if (assign.filter((a) => a === assign[i]).length <= 1) continue;
        const d = dist(points[i], centroids[assign[i]]);
        if (d > farD) { farD = d; far = i; }
      }
      assign[far] = c;
      changed = true;
    }

    centroids = centroids.map((_, c) => {
      const m = points.filter((_, i) => assign[i] === c);
      return {
        lat: m.reduce((s, p) => s + p.lat, 0) / m.length,
        lon: m.reduce((s, p) => s + p.lon, 0) / m.length,
      };
    });

    if (!changed) break;
  }

  const clusters = Array.from({ length: k }, () => []);
  assign.forEach((c, i) => clusters[c].push(i));
  return clusters;
}

module.exports = { kMeans, toPoint };