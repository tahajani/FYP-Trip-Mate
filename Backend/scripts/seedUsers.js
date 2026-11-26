// node scripts/seedUsers.js --count 30      create or update demo users seed1@tripmate.test ... (password Seed@1234), max 36
// node scripts/seedUsers.js --clean         delete ONLY seedN@tripmate.test users (and remove them from groups)
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch { bcrypt = require('bcrypt'); }

const EMAIL_RE = /^seed\d+@tripmate\.test$/;
const PASSWORD = 'Seed@1234';
const ALL = ['history_heritage', 'religious', 'museums_art', 'nature_parks', 'viewpoints', 'food_cafes', 'shopping_markets',
  'outdoor_adventure', 'waterfront_beach', 'family_entertainment'];
const THEMES = [
  ['history_heritage', 'religious', 'museums_art'],
  ['history_heritage', 'museums_art', 'viewpoints'],
  ['food_cafes', 'shopping_markets', 'family_entertainment'],
  ['shopping_markets', 'food_cafes', 'religious'],
  ['nature_parks', 'viewpoints', 'outdoor_adventure'],
  ['waterfront_beach', 'family_entertainment', 'food_cafes'],
  ['religious', 'history_heritage', 'nature_parks'],
  ['outdoor_adventure', 'viewpoints', 'waterfront_beach'],
  ['family_entertainment', 'nature_parks', 'food_cafes'],
  ['museums_art', 'shopping_markets', 'food_cafes'],
  ['viewpoints', 'history_heritage', 'nature_parks'],
  ['waterfront_beach', 'nature_parks', 'viewpoints'],
];
const PACES = ['relaxed', 'moderate', 'fast'];
const NAMES = [
  'Ayesha Khan', 'Bilal Ahmed', 'Hira Malik', 'Usman Tariq', 'Zainab Ali', 'Hamza Sheikh', 'Maryam Raza', 'Saad Qureshi',
  'Noor Fatima', 'Danish Iqbal', 'Sana Butt', 'Faizan Mirza', 'Rida Shah', 'Talha Chaudhry', 'Iqra Javed', 'Awais Siddiqui',
  'Mahnoor Aslam', 'Junaid Anwar', 'Laiba Hussain', 'Haris Naveed', 'Komal Yousaf', 'Shahzaib Rana', 'Areeba Farooq', 'Ibrahim Saleem',
  'Amna Rauf', 'Zeeshan Latif', 'Fatima Bashir', 'Osama Hanif', 'Nimra Akhtar', 'Rehan Zafar', 'Sidra Ghani', 'Moeez Abbasi',
  'Anum Kiani', 'Fahad Cheema', 'Bushra Waheed', 'Yasir Mehmood',
];

// Interests overlap with the other users on purpose:
// round 0 = the theme, round 1 = same first two interests + a different third, round 2 = first two + two others.
function interestsFor(n) {
  const base = THEMES[n % THEMES.length];
  const round = Math.floor(n / THEMES.length) % 3;
  if (round === 0) return [...base];
  const rest = ALL.filter((c) => !base.includes(c));
  const extra = rest[(n * 3) % rest.length];
  if (round === 1) return [base[0], base[1], extra];
  const other = rest[(n * 5 + 1) % rest.length];
  return [...new Set([base[0], base[1], extra, other === extra ? rest[(n * 5 + 2) % rest.length] : other])];
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  if (process.argv.includes('--clean')) {
    const ids = (await User.find({ email: { $regex: EMAIL_RE } }).select('_id').lean()).map((u) => u._id);
    const g = await Group.updateMany({}, { $pull: { members: { userId: { $in: ids } } } });
    const r = await User.deleteMany({ _id: { $in: ids } });
    console.log(`Removed seed users from ${g.modifiedCount} groups, deleted ${r.deletedCount} users`);
    return;
  }

  const i = process.argv.indexOf('--count');
  const count = Math.min(Math.max(parseInt(i > -1 ? process.argv[i + 1] : '30', 10) || 30, 1), NAMES.length);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const noPassword = [{ password: { $exists: false } }, { password: null }, { password: '' }];

  let created = 0;
  let updated = 0;
  for (let n = 0; n < count; n++) {
    const d = {
      name: NAMES[n],
      email: `seed${n + 1}@tripmate.test`,
      interests: interestsFor(n),
      pace: PACES[(n * 5 + Math.floor(n / THEMES.length)) % PACES.length], // mixed paces, also inside one theme
    };
    if (await User.exists({ email: d.email })) {
      await User.updateOne({ email: d.email }, { $set: { name: d.name, interests: d.interests, pace: d.pace } });
      await User.updateOne({ email: d.email, $or: noPassword }, { $set: { password: hash } });
      updated++;
    } else {
      await User.create({ ...d, password: hash });
      created++;
    }
  }
  console.log(`Created ${created}, updated ${updated}. Login: seed1@tripmate.test ... seed${count}@tripmate.test, password ${PASSWORD}`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());