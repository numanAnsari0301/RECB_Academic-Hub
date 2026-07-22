// server/routes/auth.js – Admin login/logout
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { AdminUser } = require('../models');

function validUsername(username) {
  return typeof username === 'string' && /^[A-Za-z0-9_.-]{3,50}$/.test(username);
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const user = await AdminUser.findOne({ username });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    req.session.isAdmin = true;
    req.session.username = user.username;
    res.json({ success: true, message: 'Logged in successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/credentials', async (req, res) => {
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

  try {
    const user = await AdminUser.findOne({ username: req.session.username });
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const usernameTaken = await AdminUser.findOne({ username, _id: { $ne: user._id } }).select('_id');
    if (usernameTaken) return res.status(409).json({ error: 'That username is already in use.' });

    user.username = username;
    user.password_hash = bcrypt.hashSync(newPassword, 12);
    await user.save();

    req.session.username = username;
    res.json({ success: true, message: 'Administrator credentials updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logged out.' });
  });
});

router.get('/status', (req, res) => {
  res.json({
    isAdmin: !!(req.session && req.session.isAdmin),
    username: req.session?.username || null
  });
});

module.exports = router;
