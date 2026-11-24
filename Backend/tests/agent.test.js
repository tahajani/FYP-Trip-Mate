const test = require('node:test');
const assert = require('node:assert/strict');
const { randomPois } = require('../scripts/compareRouting');
const { selectCandidates } = require('../services/candidates');
const { buildTools, runAgent, systemPrompt, TOOLS } = require('../services/agent');

const user = { id: 'u1', name: 'Taha', interests: ['history_heritage'], pace: 'moderate' };
const pois = randomPois(60, 3).map((p) => ({ ...p, _id: `id${p.osmId}` }));
const toolCall = (name, args, id = 'c1') => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }] });

test('loop: the model asks for a tool, gets the result, then answers', async () => {
  const impl = buildTools({ user, deps: { loadPois: async () => pois, select: selectCandidates } });
  let turn = 0;
  let seen;
  const llm = async (convo) => {
    turn++;
    if (turn === 1) return toolCall('recommend_places', { regionSlug: 'lahore' });
    seen = convo[convo.length - 1];
    return { role: 'assistant', content: 'Here are places.' };
  };
  const r = await runAgent({ messages: [{ role: 'user', content: 'places in Lahore' }], impl, llm });
  assert.equal(r.reply, 'Here are places.');
  assert.equal(seen.role, 'tool');
  const places = JSON.parse(seen.content);
  assert.ok(places.length > 0 && places.length <= 8);
  assert.ok(places.every((p) => p.name && typeof p.score === 'number'));
});

test('bad tool name, broken JSON arguments and a failing tool do not crash the loop', async () => {
  const impl = { boom: async () => { throw new Error('db down'); } };
  const results = [];
  const script = [toolCall('delete_everything', {}, 'a'), toolCall('boom', '{not json', 'b'), toolCall('boom', {}, 'c')];
  let i = 0;
  const llm = async (convo) => {
    if (i < script.length) return script[i++];
    results.push(...convo.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content).error));
    return { role: 'assistant', content: 'ok' };
  };
  const r = await runAgent({ messages: [{ role: 'user', content: 'x' }], impl, llm, maxSteps: 5 });
  assert.equal(r.reply, 'ok');
  assert.equal(results.length, 3);
  assert.equal(results[0], 'unknown tool');
  assert.equal(typeof results[1], 'string'); // the JSON parse error is passed to the model as text
  assert.equal(results[2], 'db down');
});

test('maxSteps stops a model that keeps calling tools', async () => {
  const llm = async () => toolCall('recommend_places', { regionSlug: 'lahore' });
  const impl = buildTools({ user, deps: { loadPois: async () => pois, select: selectCandidates } });
  const r = await runAgent({ messages: [{ role: 'user', content: 'x' }], impl, llm, maxSteps: 2 });
  assert.equal(r.steps, 2);
  assert.match(r.reply, /could not finish/);
});

test('recommend_places: unknown region is refused, invalid interests are dropped, no interests is an error', async () => {
  let used;
  const impl = buildTools({ user, deps: { loadPois: async () => pois, select: (u, d, p) => ((used = u), selectCandidates(u, d, p)) } });
  assert.match((await impl.recommend_places({ regionSlug: 'mars' })).error, /Unknown region/);
  await impl.recommend_places({ regionSlug: 'lahore', interests: ['food_cafes', 'drop_table'] });
  assert.deepEqual(used.interests, ['food_cafes']); // override works and the stored profile is not touched
  assert.deepEqual(user.interests, ['history_heritage']);
  await impl.recommend_places({ regionSlug: 'lahore', interests: ['nonsense'] });
  assert.deepEqual(used.interests, ['history_heritage']); // falls back to the profile
  const empty = buildTools({ user: { ...user, interests: [] }, deps: { loadPois: async () => pois } });
  assert.match((await empty.recommend_places({ regionSlug: 'lahore' })).error, /no interests/);
});

// ---- explain_conflict with fake models ----
const fake = (g, it, users) => ({
  Group: { findById: async () => g, findOne: () => ({ sort: async () => g }) },
  Itinerary: { findById: () => ({ lean: async () => it }) },
  User: { find: () => ({ select: () => ({ lean: async () => users }) }) },
});
const group = { name: 'Trip', latestItineraryId: 'it1', members: [{ userId: 'u1', status: 'accepted' }, { userId: 'u2', status: 'accepted' }] };
const itinerary = {
  warnings: ['w1'],
  satisfaction: [{ userId: 'u1', cumSat: 1.5, avgScore: 0.75 }, { userId: 'u2', cumSat: 1.0, avgScore: 0.5 }],
  days: [{ day: 1, places: [
    { name: 'Fort', source: 'consensus', selectedFor: null, memberScores: [{ userId: 'u1', score: 0.9 }, { userId: 'u2', score: 0.8 }] },
    { name: 'Cafe', source: 'roundrobin', selectedFor: 'u2', memberScores: [{ userId: 'u1', score: 0.1 }, { userId: 'u2', score: 0.9 }] },
  ] }],
};
const users = [{ _id: 'u1', name: 'Taha' }, { _id: 'u2', name: 'Sudais' }];

test('explain_conflict: who got which place and who liked it least', async () => {
  for (const ctx of [{ groupId: 'g1' }, {}]) { // with a groupId and without (latest group of the user)
    const impl = buildTools({ user, ctx, deps: { models: fake(group, itinerary, users) } });
    const r = await impl.explain_conflict();
    assert.deepEqual(r.consensusPlaces, ['Fort']);
    assert.deepEqual(r.members, [{ name: 'Taha', avgScore: 0.75 }, { name: 'Sudais', avgScore: 0.5 }]);
    assert.deepEqual(r.pickedForOneMember, [{ place: 'Cafe', day: 1, pickedFor: 'Sudais', scoreForThem: 0.9, leastLikedBy: 'Taha', theirScore: 0.1 }]);
  }
});

test('explain_conflict: a user who is not an accepted member gets nothing', async () => {
  const stranger = buildTools({ user: { ...user, id: 'u9' }, ctx: { groupId: 'g1' }, deps: { models: fake(group, itinerary, users) } });
  assert.match((await stranger.explain_conflict()).error, /No group/);
  const none = buildTools({ user, ctx: { groupId: 'g1' }, deps: { models: fake({ ...group, latestItineraryId: null }, itinerary, users) } });
  assert.match((await none.explain_conflict()).error, /no itinerary/);
});

test('get_weather: uses the region centre, asks for 3 days, handles failures', async () => {
  let url;
  const Region = { findOne: ({ slug }) => ({ lean: async () => (slug === 'lahore' ? { bbox: { south: 31.0, north: 32.0, west: 74.0, east: 75.0 } } : null) }) };
  const daily = { time: ['2026-12-01', '2026-12-02', '2026-12-03'], temperature_2m_max: [20, 21, 22], temperature_2m_min: [8, 9, 10], precipitation_probability_max: [0, 10, 60] };
  const fetchImpl = async (u) => ((url = u), { ok: true, json: async () => ({ daily }) });
  const impl = buildTools({ user, deps: { models: { Region }, fetchImpl, today: '2026-12-01' } });
  const r = await impl.get_weather({ regionSlug: 'lahore' });
  assert.match(url, /latitude=31\.5&longitude=74\.5/);
  assert.match(url, /start_date=2026-12-01&end_date=2026-12-03/);
  assert.deepEqual(r[2], { date: '2026-12-03', maxC: 22, minC: 10, rainChancePct: 60 });
  await impl.get_weather({ regionSlug: 'lahore', date: '2026-12-10' });
  assert.match(url, /start_date=2026-12-10&end_date=2026-12-12/);
  assert.match((await impl.get_weather({ regionSlug: 'mars' })).error, /Unknown region/);
  const down = buildTools({ user, deps: { models: { Region }, fetchImpl: async () => ({ ok: false, status: 503 }) } });
  assert.match((await down.get_weather({ regionSlug: 'lahore' })).error, /503/);
});

test('tool list matches the implemented tools and the system prompt carries the interests', () => {
  const impl = buildTools({ user });
  assert.deepEqual(TOOLS.map((t) => t.function.name).sort(), Object.keys(impl).sort());
  assert.match(systemPrompt(user, '2026-12-01'), /history_heritage.*2026-12-01/s);
});


// ---- tests for the later tools (stubbed models, no database) ----
const q = (v) => { const o = { sort: () => o, lean: async () => v, select: () => o, limit: () => o }; return o; };
const itin = {
  type: 'group', startDate: '2026-12-01', endDate: '2026-12-02', dayCount: 2, warnings: [], travelTimeSource: 'osrm',
  days: [{ day: 1, date: '2026-12-01', places: [{ name: 'Fort' }], visitMinutes: 90, travelMinutes: 10 }],
  satisfaction: [{ userId: 'a', avgScore: 0.7 }, { userId: 'b', avgScore: 0.35 }],
};
const grp = { members: [{ userId: 'u1', status: 'accepted' }], latestItineraryId: 'i1' };
const models = {
  Group: { findById: () => q(grp), findOne: () => q(grp) },
  Itinerary: { findById: () => q(itin), findOne: () => q(itin) },
  User: { find: () => q([{ _id: 'a', name: 'Ali', interests: ['history_heritage'], pace: 'fast' }, { _id: 'b', name: 'Sara', interests: ['food_cafes'], pace: 'fast' }]), findById: () => q({ _id: 'u1', name: 'Taha', interests: ['history_heritage'], pace: 'moderate' }) },
};

test('get_trip_summary and check_group_fairness read the latest itinerary', async () => {
  const impl = buildTools({ user, ctx: { groupId: 'g1' }, deps: { models } });
  const sum = await impl.get_trip_summary();
  assert.equal(sum.days[0].places[0], 'Fort');
  const fair = await impl.check_group_fairness();
  assert.equal(fair.suggestPoll, true);
  assert.equal(fair.leastHappy.name, 'Sara');
});

test('group tools refuse a user who is not an accepted member', async () => {
  const outsider = { id: 'someone-else', interests: [], pace: 'moderate' };
  const impl = buildTools({ user: outsider, ctx: { groupId: 'g1' }, deps: { models } });
  assert.ok((await impl.get_trip_summary()).error);
  assert.ok((await impl.check_group_fairness()).error);
});

test('search_places and suggest_alternative_place validate input and never invent places', async () => {
  const impl = buildTools({ user, deps: { loadPois: async () => pois, select: selectCandidates } });
  assert.ok((await impl.search_places({ regionSlug: 'nowhere', query: 'fort' })).error);
  assert.ok((await impl.search_places({ regionSlug: 'lahore', query: 'x' })).error);
  const hit = await impl.search_places({ regionSlug: 'lahore', query: pois[0].name.slice(0, 3) });
  assert.ok(Array.isArray(hit) ? hit.every((p) => pois.some((x) => x.name === p.name)) : hit.note);
  const alt = await impl.suggest_alternative_place({ regionSlug: 'lahore', avoidName: pois[0].name });
  if (Array.isArray(alt)) assert.ok(alt.length <= 3 && alt.every((p) => p.name !== pois[0].name));
});

test('suggest_companions returns matching users only', async () => {
  const impl = buildTools({ user, deps: { models } });
  const r = await impl.suggest_companions();
  assert.ok(Array.isArray(r) ? r.every((x) => x.name !== 'Sara') : r.note);
});

test('every declared tool has an implementation', () => {
  const impl = buildTools({ user });
  for (const t of TOOLS) assert.equal(typeof impl[t.function.name], 'function', t.function.name);
});