// services/agent.js  Groq function calling. The LLM only chooses a tool; the backend does all the computing.
const { CATEGORIES } = require('../config/categories');
const { selectCandidates, loadRegionPois } = require('./candidates');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'; // OpenAI-style API, NOT VERIFIED (written without network access)
const REGIONS = ['islamabad', 'lahore', 'karachi', 'multan'];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000));
const PACE_WEIGHT = 0.25;
const r2 = (x) => Math.round(x * 100) / 100;

const systemPrompt = (user, today = iso(new Date())) => [
  "You are TripMate's travel assistant for group trips in Pakistan.",
  'Use the tools for every fact about places, weather or groups. Never invent places, numbers or dates.',
  `Available regions: ${REGIONS.join(', ')}.`,
  `The user's interests: ${(user.interests || []).join(', ') || 'not set'}. Today is ${today}.`,
  'Reply in the language the user writes in (English or Roman Urdu). Keep answers short.',
    'You can only suggest alternatives; you cannot change an itinerary. Tell the user to apply changes in the app.',
].join('\n');

const TOOLS = [
  { type: 'function', function: {
    name: 'recommend_places',
    description: 'Suggest places in a region for the current user. Pass interests only when the user asks for something specific (this does not change their profile).',
    parameters: { type: 'object', properties: {
      regionSlug: { type: 'string', enum: REGIONS },
      interests: { type: 'array', items: { type: 'string', enum: CATEGORIES } },
      days: { type: 'integer', minimum: 1, maximum: 14 },
    }, required: ['regionSlug'] },
  } },
  { type: 'function', function: {
    name: 'get_weather',
    description: 'Daily weather forecast (3 days) for a region, starting on the given date (default today).',
    parameters: { type: 'object', properties: {
      regionSlug: { type: 'string', enum: REGIONS },
      date: { type: 'string', description: 'YYYY-MM-DD, optional' },
    }, required: ['regionSlug'] },
  } },
  { type: 'function', function: {
    name: 'explain_conflict',
    description: "Explain why the places of the user's latest group itinerary were chosen: who got which place, and who liked it least.",
    parameters: { type: 'object', properties: {} },
  } },
    { type: 'function', function: {
    name: 'suggest_alternative_place',
    description: 'Suggest up to 3 other places in a region to replace a place the user does not want. Suggestions only, nothing is changed.',
    parameters: { type: 'object', properties: {
      regionSlug: { type: 'string', enum: REGIONS },
      avoidName: { type: 'string', description: 'Name of the place to replace' },
    }, required: ['regionSlug', 'avoidName'] },
  } },
  { type: 'function', function: {
    name: 'search_places',
    description: 'Find places by name or keyword in a region.',
    parameters: { type: 'object', properties: {
      regionSlug: { type: 'string', enum: REGIONS },
      query: { type: 'string', description: 'Part of a place name' },
    }, required: ['regionSlug', 'query'] },
  } },
];

// Tools are built per request. userId and groupId come from the JWT / request, never from the model's arguments.
function buildTools({ user, ctx = {}, deps = {} }) {
  const model = (name) => (deps.models && deps.models[name]) || require(`../models/${name}`);
  const loadPois = deps.loadPois || loadRegionPois;
  const select = deps.select || selectCandidates;
  const fetchImpl = deps.fetchImpl || fetch;
  const today = deps.today || iso(new Date());

  return {
    async recommend_places({ regionSlug, interests, days = 2 } = {}) {
      if (!REGIONS.includes(regionSlug)) return { error: `Unknown region. Use one of: ${REGIONS.join(', ')}` };
      const asked = Array.isArray(interests) ? interests.filter((c) => CATEGORIES.includes(c)) : [];
      const chosen = asked.length ? asked : user.interests || [];
      if (chosen.length === 0) return { error: 'The user has no interests set yet' };
      const d = Number.isInteger(days) ? Math.min(Math.max(days, 1), 14) : 2;
            const { places } = select({ interests: chosen, pace: user.pace }, d, await loadPois(regionSlug));
      // score = 0.75 * interest match + 0.25 * pace fit, so a place with NO interest match can still score up to 0.25: not a recommendation
      const matching = places.filter((r) => r.score > PACE_WEIGHT).slice(0, 8);
      if (matching.length === 0) return { note: 'No place in this region matches these interests (the data may be sparse).' };
      return matching.map((r) => ({ name: r.poi.name, kind: r.poi.kind, score: r.score }));
    },

    async get_weather({ regionSlug, date } = {}) {
      const region = await model('Region').findOne({ slug: String(regionSlug) }).lean();
      if (!region || !region.bbox) return { error: 'Unknown region' };
      const lat = (region.bbox.south + region.bbox.north) / 2;
      const lon = (region.bbox.west + region.bbox.east) / 2;
      const start = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${start}&end_date=${addDays(start, 2)}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) }); // Open-Meteo, NOT VERIFIED (no network here)
      if (!res.ok) return { error: `Weather service failed (${res.status})` };
      const d = (await res.json()).daily;
      return d.time.map((t, i) => ({ date: t, maxC: d.temperature_2m_max[i], minC: d.temperature_2m_min[i], rainChancePct: d.precipitation_probability_max[i] }));
    },

    async explain_conflict() {
      const Group = model('Group');
      const accepted = (g) => g.members.some((m) => String(m.userId) === user.id && m.status === 'accepted');
      const g = ctx.groupId
        ? await Group.findById(ctx.groupId)
        : await Group.findOne({ members: { $elemMatch: { userId: user.id, status: 'accepted' } }, latestItineraryId: { $ne: null } }).sort({ updatedAt: -1 });
      if (!g || !accepted(g)) return { error: 'No group found for this user' };
      if (!g.latestItineraryId) return { error: 'This group has no itinerary yet' };
      const it = await model('Itinerary').findById(g.latestItineraryId).lean();
      if (!it) return { error: 'Itinerary not found' };
      const users = await model('User').find({ _id: { $in: it.satisfaction.map((s) => s.userId) } }).select('name').lean();
      const nameOf = (id) => (users.find((u) => String(u._id) === String(id)) || {}).name || 'a member';
      const places = it.days.flatMap((d) => d.places.map((p) => ({ day: d.day, ...p })));
      return {
        group: g.name,
        members: it.satisfaction.map((s) => ({ name: nameOf(s.userId), avgScore: r2(s.avgScore) })),
        consensusPlaces: places.filter((p) => p.source === 'consensus').map((p) => p.name).slice(0, 10),
        pickedForOneMember: places.filter((p) => p.source === 'roundrobin').slice(0, 10).map((p) => {
          const scores = p.memberScores.map((m) => ({ name: nameOf(m.userId), score: r2(m.score), id: String(m.userId) }));
          const low = scores.reduce((a, b) => (b.score < a.score ? b : a));
          const own = scores.find((s) => s.id === String(p.selectedFor));
          return { place: p.name, day: p.day, pickedFor: nameOf(p.selectedFor), scoreForThem: own && own.score, leastLikedBy: low.name, theirScore: low.score };
        }),
        warnings: (it.warnings || []).slice(0, 5),
      };
    },
        async suggest_alternative_place({ regionSlug, avoidName } = {}) {
      if (!REGIONS.includes(regionSlug)) return { error: `Unknown region. Use one of: ${REGIONS.join(', ')}` };
      if (!user.interests || user.interests.length === 0) return { error: 'The user has no interests set yet' };
      const pois = await loadPois(regionSlug);
      const avoid = String(avoidName || '').trim().toLowerCase();
      const old = pois.find((p) => (p.name || '').toLowerCase() === avoid);
      const { places } = select({ interests: user.interests, pace: user.pace }, 3, pois);
      const options = places
        .filter((r) => r.score > PACE_WEIGHT && (r.poi.name || '').toLowerCase() !== avoid)
        .sort((a, b) => (old && b.poi.kind === old.kind) - (old && a.poi.kind === old.kind) || b.score - a.score) // same kind first
        .slice(0, 3);
      if (options.length === 0) return { note: 'No good alternative found (the data may be sparse).' };
      return options.map((r) => ({ name: r.poi.name, kind: r.poi.kind, score: r.score }));
    },

    async search_places({ regionSlug, query } = {}) {
      if (!REGIONS.includes(regionSlug)) return { error: `Unknown region. Use one of: ${REGIONS.join(', ')}` };
      const q = String(query || '').trim().toLowerCase();
      if (q.length < 2) return { error: 'Query is too short' };
      const hits = (await loadPois(regionSlug)).filter((p) => (p.name || '').toLowerCase().includes(q)).slice(0, 8);
      if (hits.length === 0) return { note: 'No place with this name in the database.' };
      return hits.map((p) => ({ name: p.name, kind: p.kind }));
    },
  };
}

async function groqChat(messages, tools, { apiKey = process.env.GROQ_API_KEY, model = process.env.GROQ_MODEL, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Groq failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).choices[0].message;
}

// messages: [{ role: 'user' | 'assistant', content }]   impl: buildTools(...)   llm: replaceable in tests
async function runAgent({ messages, impl, system = 'You are a travel assistant.', llm = groqChat, maxSteps = 4 }) {
  const convo = [{ role: 'system', content: system }, ...messages];
  for (let step = 0; step < maxSteps; step++) {
    const msg = await llm(convo, TOOLS);
    if (!msg.tool_calls || msg.tool_calls.length === 0) return { reply: msg.content || '', steps: step };
    convo.push(msg);
    for (const call of msg.tool_calls) {
      let out;
      try {
        const fn = impl[call.function.name];
        out = fn ? await fn(JSON.parse(call.function.arguments || '{}')) : { error: 'unknown tool' };
      } catch (e) {
        out = { error: e.message }; // the model sees the error and can answer politely
      }
      convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }
  return { reply: 'Sorry, I could not finish that request. Please try again.', steps: maxSteps };
}

module.exports = { TOOLS, REGIONS, systemPrompt, buildTools, runAgent, groqChat };