'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

function db(req) { return req.app.locals.db; }

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db(req).prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  // Reset scheduler activity on login
  db(req).prepare("UPDATE scheduler_config SET last_activity=datetime('now') WHERE id=1").run();

  res.json({ user: req.session.user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.session.user });
});

module.exports = router;
