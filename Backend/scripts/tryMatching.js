// node scripts/tryMatching.js --demo                 (fake users, no database)
// node scripts/tryMatching.js you@gmail.com          (real users from MongoDB: who matches this user?)
require('dotenv').config();
const { suggestCompanions, MATCH_THRESHOLD } = require('../services/companionMatching');

const show = (me, list) => {
  console.log(`\nMatches for ${me.name || me.id} [${me.interests.join(', ')}] (threshold ${MATCH_THRESHOLD}):`);
  if (!list.length) return console.log('  none');
  list.forEach((r) => console.log(`  ${r.score.toFixed(3)}  ${r.name || r.userId}  pace=${r.pace}  shared: ${r.sharedInterests.join(', ')}`));
};

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error('Usage: node scripts/tryMatching.js --demo | <email>');
  if (arg === '--demo') {
    const users = [
      { id: 'ali', name: 'Ali', interests: ['history_heritage', 'religious', 'museums_art'], pace: 'moderate' },
      { id: 'sara', name: 'Sara', interests: ['history_heritage', 'museums_art'], pace: 'relaxed' },
      { id: 'omar', name: 'Omar', interests: ['food_cafes', 'shopping_markets'], pace: 'fast' },
      { id: 'hina', name: 'Hina', interests: ['religious', 'history_heritage', 'nature_parks'], pace: 'moderate' },
      { id: 'zed', name: 'Zed', interests: ['outdoor_adventure', 'viewpoints'], pace: 'fast' },
    ];
    users.forEach((me) => show(me, suggestCompanions(me, users)));
    return;
  }
  const mongoose = require('mongoose');
  const User = require('../models/User');
  await mongoose.connect(process.env.MONGO_URI);
  const toM = (u) => ({ id: String(u._id), name: u.name, interests: u.interests || [], pace: u.pace }); // field names not verified
  const me = await User.findOne({ email: arg.toLowerCase() }).lean();
  if (!me) throw new Error(`No user with email ${arg}`);
  const all = (await User.find({ 'interests.0': { $exists: true } }).lean()).map(toM);
  console.log(`${all.length} users have interests`);
  show(toM(me), suggestCompanions(toM(me), all));
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });