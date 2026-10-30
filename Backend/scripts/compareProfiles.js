require('dotenv').config();
const mongoose = require('mongoose');
const { loadRegionPois, selectCandidates } = require('../services/candidates');

const PROFILES = [
  { label: 'A: viewpoints+nature, relaxed', user: { interests: ['viewpoints', 'nature_parks'], pace: 'relaxed' } },
  { label: 'B: viewpoints+nature, fast', user: { interests: ['viewpoints', 'nature_parks'], pace: 'fast' } },
  { label: 'C: history+religious, moderate', user: { interests: ['history_heritage', 'religious'], pace: 'moderate' } },
  { label: 'D: food_cafes only, moderate', user: { interests: ['food_cafes'], pace: 'moderate' } },
  { label: 'E: outdoor+nature+viewpoints, relaxed', user: { interests: ['outdoor_adventure', 'nature_parks', 'viewpoints'], pace: 'relaxed' } },
  { label: 'F: outdoor+nature+viewpoints, fast', user: { interests: ['outdoor_adventure', 'nature_parks', 'viewpoints'], pace: 'fast' } },
];

async function main() {
  const days = Number(process.argv[2]) || 2;
  await mongoose.connect(process.env.MONGO_URI);
  const pois = await loadRegionPois('islamabad');
  console.log('POIs loaded:', pois.length, '| days:', days);

  for (const { label, user } of PROFILES) {
    const r = selectCandidates(user, days, pois);
    const kinds = {};
    r.places.forEach((p) => { kinds[p.poi.kind] = (kinds[p.poi.kind] || 0) + 1; });
    console.log(`\n=== ${label} ===`);
    console.log('poolSize:', r.poolSize, '| avgVisitUsed:', r.avgVisitUsed && r.avgVisitUsed.toFixed(1), '| kinds in pool:', kinds);
    r.places.slice(0, 8).forEach((p, i) =>
      console.log(i + 1, p.poi.name, '|', p.poi.kind, '|', p.score.toFixed(3))
    );
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });