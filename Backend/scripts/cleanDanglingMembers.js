// node scripts/cleanDanglingMembers.js   removes group members whose user no longer exists
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const alive = new Set((await User.find().select('_id').lean()).map((u) => String(u._id)));
  let removed = 0;
  for (const g of await Group.find()) {
    const keep = g.members.filter((m) => alive.has(String(m.userId)));
    if (keep.length === g.members.length) continue;
    try {
      const n = g.members.length - keep.length;
      g.members = keep;
      await g.save();
      removed += n;
    } catch (e) {
      console.log(`Skipped group "${g.name}" (${g._id}): ${e.message}`); // e.g. its owner no longer exists
    }
  }
  console.log(`Removed ${removed} dangling members`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());