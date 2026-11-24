// node scripts/seedUsers.js --count 12      create demo users seed1@tripmate.test ...
// node scripts/seedUsers.js --clean         delete ONLY users with emails seedN@tripmate.test
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch { bcrypt = require('bcrypt'); }
const PASSWORD = 'Seed@1234';

const EMAIL_RE = /^seed\d+@tripmate\.test$/;
// Archetypes: some identical, some sharing 2 of 3 interests, some opposite, so companion matching (>= 0.6) has real cases.
const ARCHETYPES = [
  ['history_heritage', 'religious', 'museums_art'],
  ['history_heritage', 'museums_art', 'viewpoints'],   // 2 of 3 with the first
  ['food_cafes', 'shopping_markets', 'family_entertainment'],
  ['shopping_markets', 'food_cafes', 'religious'],      // 2 of 3 with the third
  ['nature_parks', 'viewpoints', 'outdoor_adventure'],
  ['waterfront_beach', 'family_entertainment', 'food_cafes'],
];
const PACES = ['relaxed', 'moderate', 'fast'];
const NAMES = ['Ayesha Khan', 'Bilal Ahmed', 'Hira Malik', 'Usman Tariq', 'Zainab Ali', 'Hamza Sheikh', 'Maryam Raza', 'Saad Qureshi',
  'Noor Fatima', 'Danish Iqbal', 'Sana Butt', 'Faizan Mirza', 'Rida Shah', 'Talha Chaudhry', 'Iqra Javed', 'Awais Siddiqui'];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
    if (process.argv.includes('--clean')) {
    const Group = require('../models/Group');
    const ids = (await User.find({ email: { $regex: EMAIL_RE } }).select('_id').lean()).map((u) => u._id);
    const g = await Group.updateMany({}, { $pull: { members: { userId: { $in: ids } } } });
    const r = await User.deleteMany({ _id: { $in: ids } });
    console.log(`Removed seed users from ${g.modifiedCount} groups, deleted ${r.deletedCount} users`);
    return;
  }
  const i = process.argv.indexOf('--count');
  const count = Math.min(Math.max(parseInt(i > -1 ? process.argv[i + 1] : '12', 10) || 12, 1), NAMES.length);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const docs = Array.from({ length: count }, (_, n) => ({
    name: NAMES[n],
    email: `seed${n + 1}@tripmate.test`,
    interests: ARCHETYPES[n % ARCHETYPES.length],
    pace: PACES[(n + Math.floor(n / ARCHETYPES.length)) % PACES.length], // mixed paces inside the same archetype
    password: hash,
    // ADD any other required fields of your User schema here (e.g. password, onboardingComplete: true)
  }));

  const err = new User(docs[0]).validateSync();
  if (err) {
    console.error('Your User schema needs more fields. Add them to the object above:\n' + Object.values(err.errors).map((e) => `  - ${e.path}: ${e.message}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  let created = 0; let skipped = 0;
  for (const d of docs) {
    if (await User.exists({ email: d.email })) { skipped++; continue; } // safe to run twice
    await User.create(d);
    created++;
  }
    console.log(`Created ${created}, skipped ${skipped}. Login: seed1@tripmate.test ... password ${PASSWORD}. Delete later with --clean`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());