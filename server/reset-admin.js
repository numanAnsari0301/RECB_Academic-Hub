const mongoose = require('mongoose');

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username || '')) {
  throw new Error('Set ADMIN_USERNAME to 3-50 letters, numbers, dots, underscores, or hyphens.');
}
if (!password || password.length < 10) {
  throw new Error('Set ADMIN_PASSWORD to a password of at least 10 characters.');
}

async function resetAdmin() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/recb_education';
  await mongoose.connect(uri);

  const bcrypt = require('bcryptjs');
  const { AdminUser } = require('./models');
  const hash = bcrypt.hashSync(password, 12);
  const existing = await AdminUser.findOne({ username });

  if (existing) {
    existing.password_hash = hash;
    await existing.save();
  } else {
    await AdminUser.create({ username, password_hash: hash });
  }

  await mongoose.disconnect();
  console.log(`Administrator credentials set for ${username}.`);
}

resetAdmin().catch(err => {
  console.error(err.message);
  process.exit(1);
});
