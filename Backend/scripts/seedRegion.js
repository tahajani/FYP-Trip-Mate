require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Region = require('../models/Region');
const Poi = require('../models/Poi');
const { classify } = require('../utils/tagRules');

// Nominatim policy: app ko identify karo. Apni asli email yahan likho.
const USER_AGENT = 'TripMate-FYP/1.0 taha2004qwertygreen@gmail.com';
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

const REGIONS = {
  islamabad: 'Islamabad, Pakistan',
  lahore: 'Lahore, Pakistan',
  karachi: 'Karachi, Pakistan',
  multan: 'Multan, Pakistan',
};

// Usage:
//   node scripts/seedRegion.js islamabad
//   node scripts/seedRegion.js karachi --bbox 24.80,66.95,25.00,67.20   (S,W,N,E, chhota box)
//   node scripts/seedRegion.js lahore --refresh                          (raw cache ignore)
const slug = process.argv[2];
const refresh = process.argv.includes('--refresh');
const bboxArg = process.argv.find((a) => a.startsWith('--bbox'));
const bboxValue = bboxArg ? (bboxArg.includes('=') ? bboxArg.split('=')[1] : process.argv[process.argv.indexOf(bboxArg) + 1]) : null;

async function getBbox(query) {
  if (bboxValue) {
    const [south, west, north, east] = bboxValue.split(',').map(Number);
    return { south, west, north, east };
  }
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim failed: ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error('Nominatim: region nahi mila');
  const [south, north, west, east] = data[0].boundingbox.map(Number); // Nominatim order: S,N,W,E
  return { south, west, north, east };
}

function buildQuery({ south, west, north, east }) {
  const b = `(${south},${west},${north},${east})`;
  // Plan ki query + kuch lines meri taraf se (market, beach) taake un categories ke places bhi aa saken.
  return `[out:json][timeout:90];
(
  nwr["tourism"~"attraction|museum|viewpoint|zoo|theme_park|gallery"]${b};
  nwr["historic"]${b};
  nwr["amenity"="place_of_worship"]["tourism"]${b};
  nwr["leisure"~"park|garden"]${b};
  nwr["shop"~"mall|marketplace"]${b};
  nwr["amenity"="marketplace"]${b};
  nwr["natural"="beach"]${b};
  nwr["name"~"Faisal Mosque|Lok Virsa|Saidpur|Shakarparian",i]${b};
);
out center tags;`;
}

async function fetchOverpass(query) {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: 'data=' + encodeURIComponent(query),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Overpass failed: ${res.status}`);
  return res.json();
}

async function main() {
  if (!slug || !REGIONS[slug]) {
    console.log('Usage: node scripts/seedRegion.js <islamabad|lahore|karachi|multan> [--refresh] [--bbox S,W,N,E]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const bbox = await getBbox(REGIONS[slug]);
  console.log('Bounding box:', bbox);

  // Raw result disk par save, dobara run par cache use hota hai
  const rawDir = path.join(__dirname, '../data/raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const rawFile = path.join(rawDir, `${slug}.json`);

  let raw;
  if (!refresh && fs.existsSync(rawFile)) {
    console.log('Cached raw file use ho rahi hai:', rawFile);
    raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  } else {
    console.log('Overpass se fetch ho raha hai (thora time lag sakta hai)...');
    raw = await fetchOverpass(buildQuery(bbox));
    fs.writeFileSync(rawFile, JSON.stringify(raw));
  }

  const region = await Region.findOneAndUpdate(
    { slug },
    { name: REGIONS[slug], slug, bbox },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const ops = [];
  const reasons = {};
  const kinds = {};
  let usable = 0;

  for (const el of raw.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const tags = el.tags || {};
    const result = classify(tags, tags.name);

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