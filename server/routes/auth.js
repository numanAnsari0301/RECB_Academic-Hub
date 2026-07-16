// server/routes/auth.js – Admin login/logout
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

function validUsername(username) {
  return typeof username === 'string' && /^[A-Za-z0-9_.-]{3,50}$/.test(username);
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  const dbModule = req.app.get('db');
  const user = dbModule.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  req.session.isAdmin = true;
  req.session.username = user.username;
  res.json({ success: true, message: 'Logged in successfully.' });
});

// PUT /api/auth/credentials - change the logged-in administrator credentials
router.put('/credentials', (req, res) => {
  if (!req.session?.isAdmin || !req.session.username) {
    return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
  }

  const { currentPassword, username, newPassword } = req.body;
  if (!currentPassword || !newPassword || !validUsername(username)) {
    return res.status(400).json({ error: 'Provide your current password, a valid username, and a new password.' });
  }
  if (newPassword.length < 10) {
    return res.status(400).json({ error: 'New password must be at least 10 characters.' });
  }

  const db = req.app.get('db');
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(req.session.username);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const usernameTaken = db.prepare('SELECT id FROM admin_users WHERE username = ? AND id <> ?').get(username, user.id);
  if (usernameTaken) return res.status(409).json({ error: 'That username is already in use.' });

  db.prepare('UPDATE admin_users SET username = ?, password_hash = ? WHERE id = ?')
    .run(username, bcrypt.hashSync(newPassword, 12), user.id);
  req.session.username = username;
  res.json({ success: true, message: 'Administrator credentials updated.' });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logged out.' });
  });
});

// GET /api/auth/status
router.get('/status', (req, res) => {
  res.json({
    isAdmin: !!(req.session && req.session.isAdmin),
    username: req.session?.username || null
  });
});

module.exports = router;
