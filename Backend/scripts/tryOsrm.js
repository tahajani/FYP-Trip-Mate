require('dotenv').config();
const mongoose = require('mongoose');
const { getCandidates } = require('../services/candidates');
const { toPoint } = require('../services/kmeans');
const { getDurationMatrix, haversineMatrix } = require('../services/osrm');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const r = await getCandidates({ interests: ['viewpoints', 'nature_parks'], pace: 'relaxed' }, 'islamabad', 1);
  const places = r.places.slice(0, 4);
  const points = places.map((p) => toPoint(p.poi));

  const osrm = await getDurationMatrix(points);
  const est = haversineMatrix(points);
  console.log('source:', osrm.source, '| warnings:', osrm.warnings);

  for (let i = 0; i < places.length; i++) {
    for (let j = 0; j < places.length; j++) {
      if (i === j) continue;
      console.log(
        `${places[i].poi.name} -> ${places[j].poi.name}: ` +
        `OSRM ${osrm.durationsMin[i][j].toFixed(1)} min / ${osrm.distancesKm[i][j].toFixed(1)} km | ` +
        `estimate ${est.durationsMin[i][j].toFixed(1)} min / ${est.distancesKm[i][j].toFixed(1)} km`
      );
    }
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });