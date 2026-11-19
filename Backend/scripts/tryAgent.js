// node scripts/tryAgent.js you@gmail.com "foodie places in Lahore"      (talks to Groq directly, no server needed)
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { buildTools, runAgent, systemPrompt } = require('../services/agent');

async function main() {
    const [email, text, groupId] = process.argv.slice(2);
  if (!email || !text) throw new Error('Usage: node scripts/tryAgent.js <email> "<message>"');
  if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) throw new Error('Set GROQ_API_KEY and GROQ_MODEL in .env');
  await mongoose.connect(process.env.MONGO_URI);
  const u = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!u) throw new Error(`No user with email ${email}`);
  const user = { id: String(u._id), name: u.name, interests: u.interests || [], pace: u.pace };
  const logged = {};
    const impl = buildTools({ user, ctx: { groupId: groupId || null } });
  for (const k of Object.keys(impl)) { const f = impl[k]; logged[k] = async (a) => { const r = await f(a); console.log(`  [tool ${k}]`, JSON.stringify(a), '->', JSON.stringify(r).slice(0, 300)); return r; }; }
  const out = await runAgent({ messages: [{ role: 'user', content: text }], impl: logged, system: systemPrompt(user) });
  console.log('\nReply:', out.reply, `\n(${out.steps} tool round(s))`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });