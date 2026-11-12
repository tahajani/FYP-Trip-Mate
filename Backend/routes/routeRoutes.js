// routes/routeRoutes.js
// POST /api/routes/day   body: { places: [{ lat, lon }, ...] }   (in visiting order, 2..MAX_ROUTE_POINTS)
// -> { source: 'osrm' | 'haversine' | 'none', coordinates, legs, totalKm, totalMinutes, warnings }
const express = require('express');
const auth = require('../middleware/auth');
const { getDayRoute: defaultGetDayRoute, MAX_ROUTE_POINTS } = require('../services/osrmRoute');

function parsePlaces(body) {
  const places = body && body.places;
  if (!Array.isArray(places)) return { error: 'places must be an array of { lat, lon }' };
  if (places.length > MAX_ROUTE_POINTS) return { error: `At most ${MAX_ROUTE_POINTS} places per day` };
  const points = [];
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    const ok =
      p &&
      typeof p.lat === 'number' &&
      typeof p.lon === 'number' &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lon) <= 180;
    if (!ok) return { error: `places[${i}] must be { lat, lon } numbers (lat -90..90, lon -180..180)` };
    points.push({ lat: p.lat, lon: p.lon });
  }
  return { points };
}

// The factory lets tests inject a fake getDayRoute; app.use('/api/routes', require('./routes/routeRoutes')) still works.
function createRouter({ getDayRoute = defaultGetDayRoute, authMiddleware = auth } = {}) {
  const router = express.Router();

  router.post('/day', authMiddleware, async (req, res) => {
    const { error, points } = parsePlaces(req.body);
    if (error) return res.status(400).json({ message: error });
    try {
      res.json(await getDayRoute(points));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  return router;
}

const router = createRouter();
router.createRouter = createRouter;
module.exports = router;