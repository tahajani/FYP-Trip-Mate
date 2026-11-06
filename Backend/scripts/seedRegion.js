require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Region = require('../models/Region');
const Poi = require('../models/Poi');
const { classify } = require('../utils/tagRules');
const { curate } = require('../utils/curation');

// Nominatim policy: identify the app.
const USER_AGENT = 'TripMate-FYP/1.0 taha2004qwertygreen@gmail.com';
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

const REGIONS = {
  islamabad: 'Islamabad, Pakistan',
  lahore: 'Lahore, Pakistan',
  karachi: 'Karachi, Pakistan',
  multan: 'Multan, Pakistan',
};

// Usage:
//   node scripts/seedRegion.js islamabad --reset     (delete this region's POIs first, then reseed)
//   node scripts/seedRegion.js islamabad --refresh   (ignore the raw cache)
//   node scripts/seedRegion.js karachi --bbox 24.80,66.95,25.00,67.20   (S,W,N,E, overrides everything)
// Bbox priority: --bbox, then "bbox" in data/overrides/<slug>.json, then Nominatim.
const slug = process.argv[2];
const refresh = process.argv.includes('--refresh');
const reset = process.argv.includes('--reset');
const bboxArg = process.argv.find((a) => a.startsWith('--bbox'));
const bboxValue = bboxArg
  ? (bboxArg.includes('=') ? bboxArg.split('=')[1] : process.argv[process.argv.indexOf(bboxArg) + 1])
  : null;

function validateBbox({ south, west, north, east }) {
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
    throw new Error('bbox is invalid: need numbers with south < north and west < east');
  }
}

function loadOverrides(regionSlug) {
  const file = path.join(__dirname, '../data/overrides', `${regionSlug}.json`);
  if (!fs.existsSync(file)) {
    console.log('No overrides file:', file);
    return {};
  }
  let o;
  try {
    o = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Overrides file is not valid JSON: ${e.message}`);
  }
  for (const n of o.landmarkNames ?? []) {
    if (!/^[\p{L}\p{N} '\-]+$/u.test(n)) throw new Error(`landmarkNames: unsupported characters in "${n}"`);
  }
  if (o.bbox) validateBbox(o.bbox);
  return o;
}

async function getBbox(query, overrides) {
  if (bboxValue) {
    const [south, west, north, east] = bboxValue.split(',').map(Number);
    const b = { south, west, north, east };
    validateBbox(b);
    return b;
  }
  if (overrides.bbox) {
    const { south, west, north, east } = overrides.bbox;
    return { south, west, north, east };
  }
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim failed: ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error('Nominatim: region not found');
  const [south, north, west, east] = data[0].boundingbox.map(Number); // Nominatim order: S,N,W,E
  return { south, west, north, east };
}

function buildQuery({ south, west, north, east }, overrides) {
  const b = `(${south},${west},${north},${east})`;
  const names = overrides.landmarkNames ?? [];
  const landmarkLine = names.length ? `  nwr["name"~"${names.join('|')}",i]${b};\n` : '';
  return `[out:json][timeout:120];
(
  nwr["tourism"~"attraction|museum|viewpoint|zoo|theme_park|gallery"]${b};
  nwr["historic"]${b};
  nwr["amenity"="place_of_worship"]["tourism"]${b};
  nwr["leisure"~"park|garden"]${b};
  nwr["shop"~"mall|marketplace"]${b};
  nwr["amenity"="marketplace"]${b};
  nwr["natural"="beach"]${b};
  nwr["amenity"~"restaurant|cafe|food_court"]["tourism"]${b};
  nwr["amenity"~"restaurant|cafe|food_court"]["wikidata"]${b};
  nwr["natural"~"peak|wood"]["name"]${b};
  nwr["leisure"="marina"]["name"]${b};
  nwr["natural"="water"]["water"~"lake|reservoir"]["name"]${b};
  nwr["route"="hiking"]["name"]${b};
${landmarkLine});
out center tags;`;
}

async function fetchOverpass(query) {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: 'data=' + encodeURIComponent(query),
    signal: AbortSignal.timeout(150000),
  });
  if (!res.ok) throw new Error(`Overpass failed: ${res.status}`);
  return res.json();
}

async function main() {
  if (!slug || !REGIONS[slug]) {
    console.log('Usage: node scripts/seedRegion.js <islamabad|lahore|karachi|multan> [--reset] [--refresh] [--bbox S,W,N,E]');
    process.exit(1);
  }

  const overrides = loadOverrides(slug);
  await mongoose.connect(process.env.MONGO_URI);

  const bbox = await getBbox(REGIONS[slug], overrides);
  console.log('Bounding box:', bbox);

  const query = buildQuery(bbox, overrides);
  const rawDir = path.join(__dirname, '../data/raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const rawFile = path.join(rawDir, `${slug}.json`);
  const queryFile = path.join(rawDir, `${slug}.query.txt`);

  // The cache is used only when the saved query is exactly the current query.
  const cacheValid =
    !refresh &&
    fs.existsSync(rawFile) &&
    fs.existsSync(queryFile) &&
    fs.readFileSync(queryFile, 'utf8') === query;

  let raw;
  if (cacheValid) {
    console.log('Using cached raw file:', rawFile);
    raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  } else {
    console.log('Fetching from Overpass (can take a while)...');
    raw = await fetchOverpass(query);
    fs.writeFileSync(rawFile, JSON.stringify(raw));
    fs.writeFileSync(queryFile, query);
  }

  const region = await Region.findOneAndUpdate(
    { slug },
    { name: REGIONS[slug], slug, bbox },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (reset) {
    const del = await Poi.deleteMany({ regionId: region._id });
    console.log('Deleted old POIs of this region:', del.deletedCount);
  }

  const ops = [];
  const reasons = {};
  const kinds = {};
  let usable = 0;

  for (const el of raw.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const tags = el.tags || {};
    const result = curate({
      result: classify(tags, tags.name),
      tags,
      name: tags.name,
      osmType: el.type,
      osmId: el.id,
      overrides,
    });

    if (result.needsReview) {
      reasons[result.reviewReason] = (reasons[result.reviewReason] || 0) + 1;
    } else {
      usable++;
      kinds[result.kind] = (kinds[result.kind] || 0) + 1;
    }

    ops.push({
      updateOne: {
        filter: { osmType: el.type, osmId: el.id },
        update: {
          $set: {
            name: tags.name,
            location: { type: 'Point', coordinates: [lon, lat] },
            regionId: region._id,
            kind: result.kind,
            interestVector: result.vector ?? null,
            avgVisitDuration: result.avgVisitDuration,
            intensity: result.intensity,
            needsReview: result.needsReview,
            reviewReason: result.reviewReason,
            tags,
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) await Poi.bulkWrite(ops);

  const total = ops.length;
  const review = total - usable;
  await Region.updateOne(
    { _id: region._id },
    { seeded: true, seededAt: new Date(), stats: { total, usable, needsReview: review } }
  );

  console.log('\n=== Seeding report:', slug, '===');
  console.log('Total elements:', total);
  console.log('Usable:', usable);
  console.log('Excluded (needsReview):', review, reasons);
  console.log('Usable by kind:', kinds);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});