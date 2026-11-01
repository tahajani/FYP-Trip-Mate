const { selectCandidates, loadRegionPois } = require('./candidates');
const { kMeans, toPoint } = require('./kmeans');

// Pure function: ranked candidates -> one entry per day.
// places = [{ poi, score }, ...] (output of selectCandidates)
function clusterIntoDays(places, days) {
  const points = places.map((p) => toPoint(p.poi));
  const clusters = kMeans(points, days);
  return clusters.map((indexes, d) => {
    const dayPlaces = indexes.map((i) => places[i]);
    return {
      day: d + 1,
      places: dayPlaces,
      visitMinutes: dayPlaces.reduce((s, p) => s + p.poi.avgVisitDuration, 0), // travel time added in Week 11
    };
  });
}

function buildSoloDayClusters(user, days, pois) {
  const cand = selectCandidates(user, days, pois);
  return {
    poolSize: cand.poolSize,
    avgVisitUsed: cand.avgVisitUsed,
    days: clusterIntoDays(cand.places, days),
  };
}

async function getSoloDayClusters(user, regionSlug, days) {
  const pois = await loadRegionPois(regionSlug);
  return buildSoloDayClusters(user, days, pois);
}

module.exports = { clusterIntoDays, buildSoloDayClusters, getSoloDayClusters };