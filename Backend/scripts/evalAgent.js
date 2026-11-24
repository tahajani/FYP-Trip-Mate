// node scripts/evalAgent.js you@gmail.com [groupId]   -> prints accuracy, writes data/eval/agent.csv (uses real Groq calls)
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { buildTools, runAgent, systemPrompt } = require('../services/agent');

// [prompt, expected FIRST tool, or null when no tool should be used]
const CASES = [
  ['Suggest places to visit in Lahore', 'recommend_places'],
  ['Karachi mein ghoomne ke liye achi jagahen batao', 'recommend_places'],
  ['Recommend history places in Multan', 'recommend_places'],
  ['Mujhe Islamabad mein nature wali jagahen chahiye', 'recommend_places'],
  ['What is the weather in Karachi tomorrow?', 'get_weather'],
  ['Lahore ka mausam kaisa hai?', 'get_weather'],
  ['Will it rain in Islamabad this week?', 'get_weather'],
  ['Multan mein kitni garmi hai aaj?', 'get_weather'],
  ['Why did we get these places?', 'explain_conflict'],
  ['Konsi jagah kis member ko kam pasand hai?', 'explain_conflict'],
  ['Who is unhappy with our itinerary?', 'explain_conflict'],
  ['Hamare group ne ye places kyun chuni?', 'explain_conflict'],
  ['Replace Badshahi Mosque with something else in Lahore', 'suggest_alternative_place'],
  ['Is jagah ki jagah koi aur place batao Karachi mein, Clifton Beach pasand nahi', 'suggest_alternative_place'],
  ['Is there a place called Fort in Lahore?', 'search_places'],
  ['Kya Multan mein Shrine naam ki koi jagah hai?', 'search_places'],
  ['Give me a summary of my trip', 'get_trip_summary'],
  ['Mera trip ka summary do', 'get_trip_summary'],
  ['Is our group plan fair to everyone? Should we vote?', 'check_group_fairness'],
  ['Kya group ko vote karna chahiye?', 'check_group_fairness'],
  ['Who can I travel with?', 'suggest_companions'],
  ['Mere liye koi travel partner batao', 'suggest_companions'],
  ['Hello, who are you?', null],
  ['Thanks!', null],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [email, groupId] = process.argv.slice(2);
  if (!email) throw new Error('Usage: node scripts/evalAgent.js <email> [groupId]');
  if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) throw new Error('Set GROQ_API_KEY and GROQ_MODEL in .env');
  await mongoose.connect(process.env.MONGO_URI);
  const u = await require('../models/User').findOne({ email: email.toLowerCase() }).lean();
  if (!u) throw new Error('User not found');
  const user = { id: String(u._id), name: u.name, interests: u.interests || [], pace: u.pace };
  const rows = [];
  let ok = 0;
  for (const [text, expected] of CASES) {
    const real = buildTools({ user, ctx: { groupId: groupId || null } });
    const calls = [];
    const impl = Object.fromEntries(Object.entries(real).map(([k, fn]) => [k, async (a) => { calls.push(k); return fn(a); }]));
    let first = null; let reply = '';
    try {
      ({ reply } = await runAgent({ messages: [{ role: 'user', content: text }], impl, system: systemPrompt(user) }));
      first = calls[0] || null;
    } catch (e) { reply = `ERROR: ${e.message}`; }
    const pass = first === expected;
    if (pass) ok++;
    rows.push({ text, expected, first, pass, reply: reply.replace(/\s+/g, ' ').slice(0, 120) });
    console.log(`${pass ? 'PASS' : 'FAIL'}  expected=${expected}  got=${first}  | ${text}`);
    await sleep(2500); // free-tier rate limit
  }
  console.log(`\nTool selection accuracy: ${ok}/${CASES.length} = ${(100 * ok / CASES.length).toFixed(1)}%`);
  fs.mkdirSync('data/eval', { recursive: true });
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  fs.writeFileSync('data/eval/agent.csv', ['text,expected,first,pass,reply', ...rows.map((r) => [r.text, r.expected, r.first, r.pass, r.reply].map(esc).join(','))].join('\n'));
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });