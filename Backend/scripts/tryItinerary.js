require('dotenv').config();
const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/categories');
const { loadRegionPois } = require('../services/candidates');
const { generateSoloItinerary } = require('../services/soloItinerary');

// Usage: node scripts/tryItinerary.js viewpoints,nature_parks relaxed 2
async function main() {
  const interests = (process.argv[2] || 'viewpoints,nature_parks').split(',');
  const pace = process.argv[3] || 'moderate';
  const days = Number(process.argv[4]) || 2;
  const bad = interests.filter((i) => !CATEGORIES.includes(i));
  if (bad.length) throw new Error('Unknown interest(s): ' + bad.join(', '));

  await mongoose.connect(process.env.MONGO_URI);
  const pois = await loadRegionPois('islamabad');
  const r = await generateSoloItinerary({ user: { interests, pace }, days, pois, regionSlug: 'islamabad' });

  console.log('interests:', interests.join(', '), '| pace:', pace, '| days:', days);
  console.log('poolSize:', r.poolSize, '| avgVisitUsed:', r.avgVisitUsed && r.avgVisitUsed.toFixed(1),
    '| travel source:', r.travelTimeSource);
  for (const d of r.days) {
    console.log(`\nDay ${d.day}: visit ${d.visitMinutes} + travel ${d.travelMinutes} = ${d.visitMinutes + d.travelMinutes} / ${d.capacityMinutes} min`);
    d.places.forEach((p) =>
      console.log(`  ${p.order}. ${p.name} | ${p.kind} | +${p.travelMinutesFromPrevious} min travel | ${p.visitMinutes} min visit`));
  }
  console.log('\ndropped:', r.dropped);
  console.log('moved:', r.moved);
  console.log('warnings:', r.warnings);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });