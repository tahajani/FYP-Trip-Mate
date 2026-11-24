// node scripts/checkSeedLogin.js          shows whether each seed user has a password that matches Seed@1234
// node scripts/checkSeedLogin.js --fix    resets the password of every seed user that does not match
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch { bcrypt = require('bcrypt'); }

const PASSWORD = 'Seed@1234';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({ email: { $regex: /^seed\d+@tripmate\.test$/ } }).select('email password');
  if (!users.length) return console.log('No seed users found. Run: node scripts/seedUsers.js --count 12');
  const fix = process.argv.includes('--fix');
  for (const u of users) {
    const has = !!u.password;
    const ok = has && (await bcrypt.compare(PASSWORD, u.password));
    console.log(`${u.email}  hasPassword=${has}  matches=${ok}`);
    if (fix && !ok) {
      u.password = await bcrypt.hash(PASSWORD, 10);
      await u.save();
      console.log('  -> password reset');
    }
  }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());