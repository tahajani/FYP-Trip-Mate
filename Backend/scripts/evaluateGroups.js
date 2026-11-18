// Group selection evaluation (Chapter "Evaluation"): our consensus + round-robin vs two baselines, on synthetic groups.
//   node scripts/evaluateGroups.js lahore               (real POIs of a seeded region, needs MONGO_URI)
//   node scripts/evaluateGroups.js --random 120         (random POIs, no database)
//   options: --reps 20 (groups per type and size)  --days 3  --seed 7
// Synthetic groups only: this measures the selection logic, it does NOT measure real user satisfaction.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { CATEGORIES } = require('../config/categories');
const { isUsable, dedupePois } = require('../services/candidates');
const { PACES, selectGroupCandidates, memberScoreMatrix, CONSENSUS_MIN } = require('../services/groupScoring');
const { mulberry32, randomPois } = require('./compareRouting');

const ARCHETYPES = {
  history: ['history_heritage', 'religious', 'museums_art'],
  foodie: ['food_cafes', 'shopping_markets'],
  nature: ['nature_parks', 'viewpoints', 'outdoor_adventure'],
  family: ['family_entertainment', 'nature_parks', 'food_cafes'],
  waterfront: ['waterfront_beach', 'viewpoints', 'food_cafes'],
  shopper: ['shopping_markets', 'food_cafes', 'family_entertainment'],
};
const NAMES = Object.keys(ARCHETYPES);
const SIZES = [2, 3, 4, 5, 6];
const TYPES = ['aligned', 'mixed', 'conflicting'];
const METHODS = ['ours', 'meanTop', 'random'];

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

function makeGroup(type, size, rnd) {
  const start = Math.floor(rnd() * NAMES.length);
  return Array.from({ length: size }, (_, i) => {
    // aligned: one archetype for everybody; mixed: two archetypes alternate; conflicting: every member a different one
    const arch = NAMES[(start + (type === 'aligned' ? 0 : type === 'mixed' ? i % 2 : i)) % NAMES.length];
    const base = [...ARCHETYPES[arch]].sort(() => rnd() - 0.5).slice(0, 2 + Math.floor(rnd() * 2));
    if (rnd() < 0.3) base.push(pick(rnd, CATEGORIES)); // a little noise
    return { id: `m${i}`, name: `${arch}-${i}`, interests: [...new Set(base)], pace: pick(rnd, PACES) };
  });
}

function shuffled(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// metrics of a chosen set of POI indexes, from the members' own scores
function metrics(scores, chosen) {
  const perMember = scores.map((row) => mean(chosen.map((p) => row[p])));
  const consensus = chosen.filter((p) => Math.min(...scores.map((row) => row[p])) >= CONSENSUS_MIN).length;
  return { avg: mean(perMember), worst: Math.min(...perMember), spread: Math.max(...perMember) - Math.min(...perMember), consensusShare: consensus / chosen.length };
}

function evaluate(pois, { reps, days, seed }) {
  const usable = dedupePois(pois.filter(isUsable)); // the same pool selectGroupCandidates builds
  const rnd = mulberry32(seed);
  const rows = [];
  let skipped = 0;
  for (const type of TYPES) {
    for (const size of SIZES) {
      for (let r = 0; r < reps; r++) {
        const members = makeGroup(type, size, rnd);
        let sel;
        try { sel = selectGroupCandidates(members, days, pois); } catch { skipped++; continue; }
        const N = sel.places.length;
        if (N < 2) { skipped++; continue; }
        const scores = memberScoreMatrix(members, usable);
        const ours = sel.places.map((x) => usable.indexOf(x.poi));
        const meanTop = usable.map((_, p) => p).sort((a, b) => mean(scores.map((s) => s[b])) - mean(scores.map((s) => s[a])) || a - b).slice(0, N);
        const random = shuffled(usable.map((_, p) => p), rnd).slice(0, N);
        for (const [method, chosen] of Object.entries({ ours, meanTop, random })) rows.push({ type, size, rep: r, method, N, ...metrics(scores, chosen) });
      }
    }
  }
  return { rows, skipped };
}

function report(rows) {
  const f = (x) => x.toFixed(3);
  console.log('\ntype        size  method    avg    worst  spread  consensus');
  for (const type of TYPES) for (const size of SIZES) for (const method of METHODS) {
    const sub = rows.filter((r) => r.type === type && r.size === size && r.method === method);
    if (!sub.length) continue;
    const m = (k) => f(mean(sub.map((r) => r[k])));
    console.log(`${type.padEnd(11)} ${String(size).padEnd(5)} ${method.padEnd(8)} ${m('avg')}  ${m('worst')}  ${m('spread')}   ${m('consensusShare')}`);
  }
  console.log('\nOverall (all groups):');
  for (const method of METHODS) {
    const sub = rows.filter((r) => r.method === method);
    const m = (k) => f(mean(sub.map((r) => r[k])));
    console.log(`  ${method.padEnd(8)} avg ${m('avg')}  worst-member ${m('worst')}  spread ${m('spread')}  consensus ${m('consensusShare')}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : def; };
  const reps = opt('--reps', 20);
  const days = opt('--days', 3);
  const seed = opt('--seed', 7);
  const randomN = opt('--random', 0);
  const region = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  let pois;
  let label;
  if (randomN) {
    pois = randomPois(randomN, seed).map((p) => ({ ...p, _id: `id${p.osmId}` }));
    label = `random-${randomN}`;
  } else {
    if (!region) throw new Error('Usage: node scripts/evaluateGroups.js <region> | --random <n>  [--reps 20] [--days 3] [--seed 7]');
    const mongoose = require('mongoose');
    const { loadRegionPois } = require('../services/candidates');
    await mongoose.connect(process.env.MONGO_URI);
    pois = await loadRegionPois(region);
    await mongoose.disconnect();
    label = region;
  }
  console.log(`POIs: ${pois.length}   groups per type and size: ${reps}   days: ${days}   seed: ${seed}`);
  const { rows, skipped } = evaluate(pois, { reps, days, seed });
  if (skipped) console.log(`(${skipped} groups skipped: fewer than 2 places could be selected)`);
  report(rows);
  const dir = path.join(__dirname, '../data/eval');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `group-selection-${label}.csv`);
  const cols = ['type', 'size', 'rep', 'method', 'N', 'avg', 'worst', 'spread', 'consensusShare'];
  fs.writeFileSync(file, [cols.join(','), ...rows.map((r) => cols.map((c) => r[c]).join(','))].join('\n'));
  console.log(`\nCSV saved: ${file}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });