// scripts/tryItinerary.js
// Generates one solo itinerary from the command line (nothing is saved) and prints it.
//
// Usage: node scripts/tryItinerary.js [interests] [pace] [days] [--start YYYY-MM-DD] [--diversify]
//                                     [--clustering road|kmeans] [--region slug]
//   node scripts/tryItinerary.js viewpoints,nature_parks relaxed 2
//   node scripts/tryItinerary.js history_heritage,religious,food_cafes moderate 3 --start 2026-12-01 --diversify
//   node scripts/tryItinerary.js museums_art,shopping_markets fast 4 --clustering kmeans
// --diversify / --clustering are passed to generateSoloItinerary as options. NOT VERIFIED: I have not seen
// services/soloItinerary.js, so if it ignores an option the output simply will not change; compare a run with and without it.
require('dotenv').config();
const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/categories');
const { loadRegionPois } = require('../services/candidates');
const { generateSoloItinerary, MAX_DAYS } = require('../services/soloItinerary');
const { isValidISODate } = require('../utils/dates');

const PACES = ['relaxed', 'moderate', 'fast'];

function parseArgs(argv) {
  const positional = [];
  const o = { region: 'islamabad', startDate: null, diversify: false, clustering: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--diversify') o.diversify = true;
    else if (a === '--start' || a === '--clustering' || a === '--region') {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (a === '--start') o.startDate = v;
      if (a === '--clustering') o.clustering = v;
      if (a === '--region') o.region = v;
    } else if (a.startsWith('--')) throw new Error(`Unknown argument: ${a}`);
    else positional.push(a);
  }
  o.interests = (positional[0] || 'viewpoints,nature_parks').split(',').map((s) => s.trim()).filter(Boolean);
  o.pace = positional[1] || 'moderate';
  o.days = positional[2] === undefined ? 2 : Number(positional[2]);

  const bad = o.interests.filter((i) => !CATEGORIES.includes(i));
  if (bad.length) throw new Error('Unknown interest(s): ' + bad.join(', '));
  if (!PACES.includes(o.pace)) throw new Error(`pace must be one of ${PACES.join(', ')}`);
  if (!Number.isInteger(o.days) || o.days < 1 || o.days > MAX_DAYS) throw new Error(`days must be an integer from 1 to ${MAX_DAYS}`);
  if (o.startDate !== null && !isValidISODate(o.startDate)) throw new Error('--start must be a valid YYYY-MM-DD date');
  if (o.clustering !== null && !['road', 'kmeans'].includes(o.clustering)) throw new Error("--clustering must be 'road' or 'kmeans'");
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const pois = await loadRegionPois(o.region);
    const options = {};
    if (o.diversify) options.diversify = true;
    if (o.clustering) options.clustering = o.clustering;

    const input = { user: { interests: o.interests, pace: o.pace }, days: o.days, pois, regionSlug: o.region };
    if (o.startDate) input.startDate = o.startDate;
    const r = await generateSoloItinerary(input, Object.keys(options).length ? { options } : undefined);

    console.log('interests:', o.interests.join(', '), '| pace:', o.pace, '| days:', o.days,
      o.startDate ? `| start: ${o.startDate}` : '', Object.keys(options).length ? `| options: ${JSON.stringify(options)}` : '');
    console.log('poolSize:', r.poolSize, '| avgVisitUsed:', r.avgVisitUsed && r.avgVisitUsed.toFixed(1));
    console.log('travel times:', r.travelTimeSource === 'osrm'
      ? 'OSRM (real road times)'
      : `${r.travelTimeSource} -> ESTIMATES from straight lines, run: node scripts/checkOsrm.js`);

    for (const d of r.days) {
      console.log(`\nDay ${d.day}${d.date ? ` (${d.date})` : ''}: visit ${d.visitMinutes} + travel ${d.travelMinutes} = ${d.visitMinutes + d.travelMinutes} / ${d.capacityMinutes} min`);
      d.places.forEach((p) => {
        const matched = p.matched ?? [];
        console.log(`  ${p.order}. ${p.name} | ${p.kind} | +${p.travelMinutesFromPrevious} min travel | ${p.visitMinutes} min visit | ` +
          (matched.length ? `matches: ${matched.join(', ')}` : 'matches: none'));
      });
    }

    console.log('\ndropped:', r.dropped);
    console.log('moved:', r.moved);
    if (r.coverage !== undefined) console.log('coverage:', JSON.stringify(r.coverage));
    console.log('warnings:', r.warnings);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { parseArgs };