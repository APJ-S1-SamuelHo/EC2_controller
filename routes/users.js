'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

function db(req) { return req.app.locals.db; }
function adminOnly(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// GET /api/users
router.get('/', adminOnly, (req, res) => {
  const users = db(req).prepare(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at'
  ).all();
  res.json(users);
});

// POST /api/users
router.post('/', adminOnly, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password required' });
  const safeRole = role === 'admin' ? 'admin' : 'user';
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db(req).prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), email.trim().toLowerCase(), hash, safeRole);
    res.json({ id: info.lastInsertRowid, name, email, role: safeRole });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

// PATCH /api/users/:id/role — toggle role
router.patch('/:id/role', adminOnly, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Role must be admin or user' });

  // Prevent demoting yourself
  if (parseInt(req.params.id) === req.session.user.id && role === 'user') {
    return res.status(400).json({ error: 'Cannot demote yourself' });
  }

  db(req).prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
  res.json({ ok: true, role });
});

// DELETE /api/users/:id
router.delete('/:id', adminOnly, (req, res) => {
  // Prevent deleting yourself
  if (parseInt(req.params.id) === req.session.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  db(req).prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
