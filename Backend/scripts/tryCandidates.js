require('dotenv').config();
const mongoose = require('mongoose');
const { getCandidates } = require('../services/candidates');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const user = { interests: ['viewpoints', 'nature_parks'], pace: 'relaxed' };
  const r = await getCandidates(user, 'islamabad', 2);
  console.log('poolSize:', r.poolSize, '| avgVisitUsed:', r.avgVisitUsed);
  r.places.forEach((p, i) =>
    console.log(i + 1, p.poi.name, '|', p.poi.kind, '|', p.score.toFixed(3), '|', p.poi.avgVisitDuration + ' min')
  );
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });