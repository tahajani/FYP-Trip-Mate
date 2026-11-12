// scripts/checkOsrm.js
// Checks, from the same Node runtime your backend uses, whether OSRM is reachable and answers correctly.
//   node scripts/checkOsrm.js
//   node scripts/checkOsrm.js --url http://localhost:5001      (self-hosted OSRM)
// Exit code 0 = both the Table API (travel times) and the Route API (road line) came from OSRM, 1 = fallback was used.
const { getDurationMatrix } = require('../services/osrm');
const { getDayRoute } = require('../services/osrmRoute');

const argUrl = (() => {
  const i = process.argv.indexOf('--url');
  return i > -1 ? process.argv[i + 1] : undefined;
})();
const baseUrl = argUrl || process.env.OSRM_URL || 'https://router.project-osrm.org';

// Faisal Mosque -> Lok Virsa -> Daman-e-Koh (approximate coordinates, only used as a probe)
const POINTS = [
  { lat: 33.7295, lon: 73.0372 },
  { lat: 33.6938, lon: 73.0652 },
  { lat: 33.7435, lon: 73.0587 },
];

(async () => {
  console.log(`Node ${process.version} | OSRM base URL: ${baseUrl}`);
  let ok = true;

  const t1 = Date.now();
  const table = await getDurationMatrix(POINTS, { baseUrl });
  console.log(`\n[Table API]  source=${table.source}  (${Date.now() - t1} ms)`);
  if (table.source === 'osrm') {
    console.log('  0 -> 1:', table.distancesKm[0][1].toFixed(2), 'km,', table.durationsMin[0][1].toFixed(1), 'min');
    console.log('  1 -> 2:', table.distancesKm[1][2].toFixed(2), 'km,', table.durationsMin[1][2].toFixed(1), 'min');
  } else {
    ok = false;
    table.warnings.forEach((w) => console.log('  WARNING:', w));
  }

  const t2 = Date.now();
  const route = await getDayRoute(POINTS, { baseUrl, useCache: false });
  console.log(`\n[Route API]  source=${route.source}  (${Date.now() - t2} ms)`);
  console.log('  line points :', route.coordinates.length, route.source === 'osrm' ? '(road geometry)' : '(only the stops)');
  route.legs.forEach((l, i) => console.log(`  leg ${i + 1}       : ${l.km} km, ${l.minutes} min`));
  console.log('  total       :', route.totalKm, 'km,', route.totalMinutes, 'min');
  if (route.source !== 'osrm') {
    ok = false;
    route.warnings.forEach((w) => console.log('  WARNING:', w));
  }

  console.log(
    ok
      ? '\nOK: OSRM is reachable. If the app still shows straight lines, the problem is in the app/frontend, not OSRM.'
      : '\nFAIL: OSRM was NOT used (see WARNING above). Every itinerary will use the Haversine estimate until this works.'
  );
  process.exit(ok ? 0 : 1);
})();