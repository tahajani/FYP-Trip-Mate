require('dotenv').config();
const mongoose = require('mongoose');
const { loadRegionPois, selectCandidates } = require('../services/candidates');

// Interests are added one by one in this order.
const ORDER = [
  'viewpoints', 'nature_parks', 'history_heritage', 'religious', 'museums_art',
  'shopping_markets', 'family_entertainment', 'outdoor_adventure', 'waterfront_beach', 'food_cafes',
];

async function main() {
  const pace = process.argv[2] || 'moderate';
  const days = Number(process.argv[3]) || 3;
  await mongoose.connect(process.env.MONGO_URI);
  const pois = await loadRegionPois('islamabad');
  console.log('POIs loaded:', pois.length, '| pace:', pace, '| days:', days);

  for (let n = 1; n <= ORDER.length; n++) {
    const r = selectCandidates({ interests: ORDER.slice(0, n), pace }, days, pois);
    const kinds = {};
    r.places.forEach((p) => { kinds[p.poi.kind] = (kinds[p.poi.kind] || 0) + 1; });
    const scores = r.places.map((p) => p.score);
    const range = scores.length
      ? `${Math.min(...scores).toFixed(3)} to ${Math.max(...scores).toFixed(3)}`
      : 'n/a';

    console.log(`\n--- ${n} interests (+${ORDER[n - 1]}) ---`);
    console.log('poolSize:', r.poolSize, '| kinds:', kinds, '| score range:', range);
    r.places.slice(0, 5).forEach((p, i) =>
      console.log(' ', i + 1, p.poi.name, '|', p.poi.kind, '|', p.score.toFixed(3))
    );
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });