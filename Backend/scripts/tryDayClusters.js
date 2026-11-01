require('dotenv').config();
const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/categories');
const { getSoloDayClusters } = require('../services/dayClusters');
const { haversineKm } = require('../utils/geo');

// Usage: node scripts/tryDayClusters.js viewpoints,nature_parks relaxed 3
async function main() {
  const interests = (process.argv[2] || 'viewpoints,nature_parks').split(',');
  const pace = process.argv[3] || 'moderate';
  const days = Number(process.argv[4]) || 2;

  const bad = interests.filter((i) => !CATEGORIES.includes(i));
  if (bad.length) throw new Error('Unknown interest(s): ' + bad.join(', '));
  if (!['relaxed', 'moderate', 'fast'].includes(pace)) throw new Error('pace must be relaxed, moderate or fast');

  await mongoose.connect(process.env.MONGO_URI);
  const r = await getSoloDayClusters({ interests, pace }, 'islamabad', days);
  console.log('interests:', interests.join(', '), '| pace:', pace, '| days:', days);
  console.log('poolSize:', r.poolSize, '| avgVisitUsed:', r.avgVisitUsed && r.avgVisitUsed.toFixed(1));

  for (const d of r.days) {
    let spread = 0;
    for (const a of d.places) {
      for (const b of d.places) {
        const [lon1, lat1] = a.poi.location.coordinates;
        const [lon2, lat2] = b.poi.location.coordinates;
        spread = Math.max(spread, haversineKm(lat1, lon1, lat2, lon2));
      }
    }
    console.log(`\nDay ${d.day}: ${d.places.length} places | visit ${d.visitMinutes} min | max spread ${spread.toFixed(1)} km`);
    d.places.forEach((p) => console.log('  -', p.poi.name, '|', p.poi.kind, '|', p.score.toFixed(3)));
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });