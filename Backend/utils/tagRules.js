const { CATEGORIES } = require('../config/categories');

// Section 6 ki defaults. monument aur attraction ki values plan me nahi thi,
// wo meri assumption hain [Suggested], review kar lena.
const KIND_DEFAULTS = {
  mosque: { dur: 45, int: 0.3 },
  fort: { dur: 90, int: 0.5 },
  museum: { dur: 90, int: 0.3 },
  park: { dur: 60, int: 0.3 },
  viewpoint: { dur: 30, int: 0.2 },
  market: { dur: 75, int: 0.4 },
  beach: { dur: 90, int: 0.4 },
  zoo: { dur: 150, int: 0.5 },
  trail: { dur: 150, int: 0.9 },
  monument: { dur: 45, int: 0.3 },
  attraction: { dur: 60, int: 0.3 },
};

// Order matter karta hai: pehla match "kind" tay karta hai.
const RULES = [
  { kind: 'mosque',
    test: (t) => t.amenity === 'place_of_worship' && (t.tourism === 'attraction' || t.historic),
    vec: { religious: 0.9, history_heritage: 0.4 } },
  { kind: 'fort',
    test: (t) => ['fort', 'castle'].includes(t.historic),
    vec: { history_heritage: 0.9 } },
  { kind: 'monument',
    test: (t) => ['monument', 'memorial', 'archaeological_site'].includes(t.historic),
    vec: { history_heritage: 0.9 } },
  { kind: 'museum',
    test: (t) => ['museum', 'gallery'].includes(t.tourism),
    vec: { museums_art: 0.9, history_heritage: 0.3 } },
  { kind: 'park',
    test: (t) => ['park', 'garden'].includes(t.leisure) || t.natural === 'wood',
    vec: { nature_parks: 0.8 } },
  { kind: 'viewpoint',
    test: (t) => t.tourism === 'viewpoint',
    vec: { viewpoints: 0.9, nature_parks: 0.3 } },
  { kind: 'trail',
    test: (t) => t.natural === 'peak',
    vec: { outdoor_adventure: 0.8, nature_parks: 0.4 } },
  { kind: 'beach',
    test: (t) => t.natural === 'beach' || t.leisure === 'marina',
    vec: { waterfront_beach: 0.8 } },
  { kind: 'market',
    test: (t) => ['mall', 'marketplace'].includes(t.shop) || t.amenity === 'marketplace',
    vec: { shopping_markets: 0.8 } },
  { kind: 'zoo',
    test: (t) => ['zoo', 'theme_park'].includes(t.tourism),
    vec: { family_entertainment: 0.7 } },
  // Generic attraction: sirf tab jab koi aur rule match na kare
  { kind: 'attraction', fallbackOnly: true,
    test: (t) => t.tourism === 'attraction',
    vec: { family_entertainment: 0.7 } },
];

// Name keyword fallback (jab koi tag rule match na ho)
const KEYWORDS = [
  { re: /masjid|mosque|shrine|darbar|mazar/i, kind: 'mosque', vec: { religious: 0.9 } },
  { re: /\bfort\b|qila|palace|haveli/i, kind: 'fort', vec: { history_heritage: 0.9 } },
  { re: /museum/i, kind: 'museum', vec: { museums_art: 0.9 } },
  { re: /park|garden|bagh/i, kind: 'park', vec: { nature_parks: 0.8 } },
  { re: /bazaar|bazar|market/i, kind: 'market', vec: { shopping_markets: 0.8 } },
  { re: /beach/i, kind: 'beach', vec: { waterfront_beach: 0.8 } },
];

function toVector(map) {
  // Max 3 non-zero entries, values 0..1
  const top = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const vec = new Array(CATEGORIES.length).fill(0);
  for (const [key, val] of top) vec[CATEGORIES.indexOf(key)] = Math.min(1, Math.max(0, val));
  return vec;
}

// Returns { vector, kind, avgVisitDuration, intensity, needsReview, reviewReason }
function classify(tags, name) {
  if (!name) {
    return { needsReview: true, reviewReason: 'no name' };
  }

  const merged = {};
  let kind = null;
  let usedNonFallback = false;

  for (const rule of RULES.filter((r) => !r.fallbackOnly)) {
    if (rule.test(tags)) {
      usedNonFallback = true;
      kind = kind ?? rule.kind;
      for (const [k, v] of Object.entries(rule.vec)) merged[k] = Math.max(merged[k] ?? 0, v);
    }
  }
  if (!usedNonFallback) {
    for (const rule of RULES.filter((r) => r.fallbackOnly)) {
      if (rule.test(tags)) {
        kind = rule.kind;
        Object.assign(merged, rule.vec);
      }
    }
  }

  if (!kind) {
    const hit = KEYWORDS.find((k) => k.re.test(name));
    if (hit) {
      kind = hit.kind;
      Object.assign(merged, hit.vec);
    }
  }

  if (!kind) return { needsReview: true, reviewReason: 'no matching tag or keyword' };

  const d = KIND_DEFAULTS[kind];
  return {
    kind,
    vector: toVector(merged),
    avgVisitDuration: d.dur,
    intensity: d.int,
    needsReview: false,
  };
}

module.exports = { classify };