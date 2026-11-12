// scripts/compareRouting.js
// Does planning on OSRM road times give better day routes than planning on Haversine (straight-line) estimates?
// For every day (k-medoids cluster on the OSRM matrix) it compares, all measured on the OSRM matrix:
//   - OSRM exact (Held-Karp, n <= 12)        free start, open path
//   - OSRM NN + 2-opt (heuristic)            free start, tries every start place
//   - order planned on HAVERSINE (exact and NN + 2-opt), then evaluated on the OSRM matrix
// regret % = (OSRM minutes of the Haversine-planned order - OSRM minutes of the reference order) / reference * 100
// The reference is the OSRM exact optimum when n <= 12, otherwise the OSRM NN + 2-opt result (a heuristic, so a small
// negative regret is possible there).
//
// If OSRM does not answer (matrix source != 'osrm') the script stops with exit code 2: comparing Haversine with
// Haversine would be meaningless.
//
// DB mode (needs MONGO_URI in .env, the region must be seeded):
//   node scripts/compareRouting.js --interests viewpoints,nature_parks --pace relaxed --days 2
//   node scripts/compareRouting.js --interests history_heritage,religious,food_cafes --pace moderate --days 3 --diversify
//   node scripts/compareRouting.js --interests museums_art,shopping_markets --pace fast --days 4 --region islamabad
// Synthetic mode (no database, random POIs around Islamabad/Rawalpindi, seeded so a run can be repeated):
//   node scripts/compareRouting.js --random 60 --seed 7 --interests viewpoints,food_cafes --pace moderate --days 3
//   node scripts/compareRouting.js --random 20 --direct --days 1 --seed 3     (ONE day with 20 stops -> NN + 2-opt branch)
//   node scripts/compareRouting.js --random 24 --direct --days 2 --seed 5     (--direct = no selection, all random points are used)
// Keep --direct at about 30 points or fewer: NN + 2-opt tries every start place and gets slow above that.
const { CATEGORIES } = require('../config/categories');
const { selectCandidates, loadRegionPois } = require('../services/candidates');
const { getDurationMatrix, haversineMatrix } = require('../services/osrm');
const { kMedoids } = require('../services/kmedoids');
const { pathCost, heldKarpPath, nearestNeighborPath, twoOptPath, EXACT_LIMIT } = require('../services/sequencing');

const PACES = ['relaxed', 'moderate', 'fast'];
const BOX = { latMin: 33.55, latMax: 33.8, lonMin: 72.95, lonMax: 73.2 }; // around Islamabad / Rawalpindi

class OsrmUnavailableError extends Error {
  constructor(warnings) {
    super('OSRM was not used for the travel-time matrix');
    this.name = 'OsrmUnavailableError';
    this.warnings = warnings || [];
  }
}

// ---------- arguments ----------
function parseArgs(argv) {
  const o = { region: 'islamabad', interests: ['viewpoints', 'nature_parks'], pace: 'moderate', days: null, random: null, seed: 1, direct: false, diversify: false, noDedupe: false };
  const takesValue = new Set(['--region', '--interests', '--pace', '--days', '--random', '--seed']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--direct') o.direct = true;
    else if (a === '--diversify') o.diversify = true;
    else if (a === '--no-dedupe') o.noDedupe = true;
    else if (takesValue.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (a === '--region') o.region = v;
      if (a === '--interests') o.interests = v.split(',').map((s) => s.trim()).filter(Boolean);
      if (a === '--pace') o.pace = v;
      if (a === '--days') o.days = Number(v);
      if (a === '--random') o.random = Number(v);
      if (a === '--seed') o.seed = Number(v);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  const bad = o.interests.filter((c) => !CATEGORIES.includes(c));
  if (bad.length) throw new Error(`Unknown interest(s): ${bad.join(', ')}`);
  if (!PACES.includes(o.pace)) throw new Error(`pace must be one of ${PACES.join(', ')}`);
  if (o.random !== null && !(Number.isInteger(o.random) && o.random >= 2)) throw new Error('--random must be an integer >= 2');
  if (o.direct && o.random === null) throw new Error('--direct needs --random N');
  if (!Number.isInteger(o.seed)) throw new Error('--seed must be an integer');
  if (o.days === null) o.days = o.direct ? 1 : 2;
  if (!Number.isInteger(o.days) || o.days < 1 || o.days > 14) throw new Error('--days must be an integer from 1 to 14');
  return o;
}

// ---------- synthetic data ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shaped like a seeded Poi document (location.coordinates is [lon, lat]).
function randomPois(n, seed) {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const vec = new Array(CATEGORIES.length).fill(0);
    const picks = 1 + Math.floor(rnd() * 2); // 1 or 2 categories
    for (let k = 0; k < picks; k++) vec[Math.floor(rnd() * CATEGORIES.length)] = Math.round((0.5 + rnd() * 0.5) * 100) / 100;
    return {
      osmId: i + 1,
      name: `Random POI ${i + 1}`,
      kind: 'attraction',
      needsReview: false,
      interestVector: vec,
      intensity: Math.round((0.2 + rnd() * 0.7) * 100) / 100,
      avgVisitDuration: 30 + Math.floor(rnd() * 91),
      location: {
        type: 'Point',
        coordinates: [BOX.lonMin + rnd() * (BOX.lonMax - BOX.lonMin), BOX.latMin + rnd() * (BOX.latMax - BOX.latMin)],
      },
    };
  });
}

// ---------- the comparison itself ----------
function nn2optFree(cost) {
  const n = cost.length;
  let best = null;
  for (let s = 0; s < n; s++) {
    const r = twoOptPath(cost, nearestNeighborPath(cost, s), { fixStart: false });
    if (!best || r.cost < best.cost) best = r;
  }
  return best;
}

const pct = (value, ref) => (ref > 0 ? ((value - ref) / ref) * 100 : 0);

// Do = OSRM minutes matrix, Dh = Haversine minutes matrix (same point set), idx = place indexes of one day.
function compareDay(Do, Dh, idx) {
  const n = idx.length;
  if (n < 2) return { n, skipped: true };
  const sub = (D) => idx.map((i) => idx.map((j) => D[i][j]));
  const so = sub(Do);
  const sh = sub(Dh);
  const exact = n <= EXACT_LIMIT;

  const osrmExact = exact ? heldKarpPath(so, null) : null;
  const osrmHeur = nn2optFree(so);
  const reference = osrmExact || osrmHeur;

  // an order planned on the Haversine matrix, then measured on the OSRM matrix
  const planned = (result) => {
    const onOsrm = pathCost(so, result.order);
    return { order: result.order, havMin: result.cost, osrmMin: onOsrm, regretPct: pct(onOsrm, reference.cost) };
  };
  const havExact = exact ? planned(heldKarpPath(sh, null)) : null;
  const havHeur = planned(nn2optFree(sh));
  if (osrmExact) {
    // against a true optimum a negative regret can only be rounding
    if (havExact.regretPct < 0) havExact.regretPct = 0;
    if (havHeur.regretPct < 0) havHeur.regretPct = 0;
  }
  const planOrder = (havExact || havHeur).order;

  return {
    n,
    idx,
    referenceMethod: osrmExact ? 'held-karp' : 'nn-2opt',
    osrmExact: osrmExact && { order: osrmExact.order, osrmMin: osrmExact.cost },
    osrmHeur: { order: osrmHeur.order, osrmMin: osrmHeur.cost, gapPct: osrmExact ? pct(osrmHeur.cost, osrmExact.cost) : null },
    referenceMin: reference.cost,
    referenceOrder: reference.order,
    havExact,
    havHeur,
    plannedRegretPct: (havExact || havHeur).regretPct, // "the Haversine plan" = exact when possible, else heuristic
    sameOrderAsReference: planOrder.every((v, i) => v === reference.order[i]),
  };
}

function summarize(days) {
  const used = days.filter((d) => !d.skipped);
  if (used.length === 0) return { days: 0, meanRegretPct: 0, maxRegretPct: 0, daysWithDifferentOrder: 0 };
  const regrets = used.map((d) => d.plannedRegretPct);
  return {
    days: used.length,
    meanRegretPct: regrets.reduce((a, b) => a + b, 0) / regrets.length,
    maxRegretPct: Math.max(...regrets),
    daysWithDifferentOrder: used.filter((d) => !d.sameOrderAsReference).length,
  };
}

async function run(opts, deps = {}) {
  const getMatrix = deps.getMatrix || getDurationMatrix;
  const pois = opts.random ? randomPois(opts.random, opts.seed) : await (deps.loadPois || loadRegionPois)(opts.region);

  let places;
  let selection = null;
  if (opts.direct) {
    places = pois;
  } else {
    selection = selectCandidates({ interests: opts.interests, pace: opts.pace }, opts.days, pois, {
      dedupe: !opts.noDedupe,
      diversify: opts.diversify,
    });
    places = selection.places.map((r) => r.poi);
  }
  if (places.length < 2) throw new Error(`Only ${places.length} place(s) selected, nothing to compare`);

  const points = places.map((p) => ({ lat: p.location.coordinates[1], lon: p.location.coordinates[0] }));
  const osrm = await getMatrix(points, deps.osrmOptions);
  if (osrm.source !== 'osrm') throw new OsrmUnavailableError(osrm.warnings);
  const hav = haversineMatrix(points);

  const clusters = kMedoids(osrm.durationsMin, opts.days);
  const days = clusters.map((idx) => compareDay(osrm.durationsMin, hav.durationsMin, idx));
  return { opts, places, selection, days, summary: summarize(days) };
}

// ---------- printing ----------
const f1 = (x) => x.toFixed(1);
const sign = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`;
const names = (places, idx, order) => order.map((k) => places[idx[k]].name).join('  ->  ');

function printReport(rep, log = console.log) {
  const { opts, places, selection, days, summary } = rep;
  log(
    opts.direct
      ? `mode: direct (${places.length} random points, no selection) | days: ${opts.days} | seed: ${opts.seed}`
      : `interests: ${opts.interests.join(', ')} | pace: ${opts.pace} | days: ${opts.days} | diversify: ${opts.diversify}` +
          ` | pool: ${selection.poolSize} | ${opts.random ? `random pool ${opts.random}, seed ${opts.seed}` : `region ${opts.region}`}`
  );
  days.forEach((d, i) => {
    log(`\nDay ${i + 1}: ${d.n} place(s)`);
    if (d.skipped) return log('  (fewer than 2 places, nothing to order)');
    log(`  reference = OSRM ${d.referenceMethod}: ${f1(d.referenceMin)} min`);
    log(`    ${names(places, d.idx, d.referenceOrder)}`);
    if (d.osrmExact) log(`  OSRM NN+2opt vs exact       : ${f1(d.osrmHeur.osrmMin)} min (${sign(d.osrmHeur.gapPct)})`);
    else log(`  OSRM NN+2opt (n > ${EXACT_LIMIT}, no exact result to compare with): ${f1(d.osrmHeur.osrmMin)} min`);
    if (d.havExact) log(`  Haversine plan, exact       : looks like ${f1(d.havExact.havMin)} min, really ${f1(d.havExact.osrmMin)} min on roads -> regret ${sign(d.havExact.regretPct)}`);
    log(`  Haversine plan, NN+2opt     : looks like ${f1(d.havHeur.havMin)} min, really ${f1(d.havHeur.osrmMin)} min on roads -> regret ${sign(d.havHeur.regretPct)}`);
    if (!d.sameOrderAsReference) log(`    Haversine order: ${names(places, d.idx, (d.havExact || d.havHeur).order)}`);
    else log('    (Haversine planning picked the same order)');
  });
  log(
    `\nSUMMARY: ${summary.days} day(s) | mean regret ${sign(summary.meanRegretPct)} | max regret ${sign(summary.maxRegretPct)}` +
      ` | different order on ${summary.daysWithDifferentOrder} day(s)`
  );
  if (days.some((d) => !d.skipped && d.referenceMethod === 'nn-2opt')) {
    log('NOTE: for days with more than 12 places the reference is a heuristic, so a small negative regret is possible.');
  }
}

function printOsrmFailure(err, log = console.error) {
  log('\n################################################################');
  log('#  OSRM WAS NOT USED - THIS COMPARISON WOULD BE MEANINGLESS    #');
  log('################################################################');
  (err.warnings || []).forEach((w) => log('  ' + w));
  log('\nRun `node scripts/checkOsrm.js` to see why OSRM is not reachable, fix that, then run this script again.');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let mongoose = null;
  if (!opts.random) {
    require('dotenv').config();
    mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI);
  }
  try {
    printReport(await run(opts));
  } finally {
    if (mongoose) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    if (e instanceof OsrmUnavailableError) {
      printOsrmFailure(e);
      process.exit(2);
    }
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, mulberry32, randomPois, nn2optFree, compareDay, summarize, run, printReport, OsrmUnavailableError };