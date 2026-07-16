const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username || '')) {
  throw new Error('Set ADMIN_USERNAME to 3-50 letters, numbers, dots, underscores, or hyphens.');
}
if (!password || password.length < 10) {
  throw new Error('Set ADMIN_PASSWORD to a password of at least 10 characters.');
}

const db = new Database(path.join(__dirname, '..', 'database', 'recb.db'));
const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
const hash = bcrypt.hashSync(password, 12);

if (existing) {
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
} else {
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
}

db.close();
console.log(`Administrator credentials set for ${username}.`);
