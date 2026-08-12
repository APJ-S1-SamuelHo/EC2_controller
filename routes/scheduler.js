'use strict';

const express = require('express');
const router  = express.Router();

function db(req) { return req.app.locals.db; }
function auth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function adminOnly(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// GET /api/scheduler
router.get('/', auth, (req, res) => {
  const cfg = db(req).prepare('SELECT * FROM scheduler_config WHERE id=1').get();
  const lastActivity = cfg.last_activity ? new Date(cfg.last_activity + 'Z') : new Date();
  const idleMs = Date.now() - lastActivity.getTime();
  const idleMin = Math.floor(idleMs / 60000);
  const remainingMin = Math.max(0, cfg.limit_minutes - idleMin);

  res.json({
    enabled:      cfg.enabled === 1,
    limitMinutes: cfg.limit_minutes,
    idleMinutes:  idleMin,
    remainingMinutes: remainingMin,
    lastActivity: cfg.last_activity
  });
});

// PATCH /api/scheduler — update config (admin only)
router.patch('/', adminOnly, (req, res) => {
  const { enabled, limit_minutes } = req.body;
  const cfg = db(req).prepare('SELECT * FROM scheduler_config WHERE id=1').get();

  const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : cfg.enabled;
  const newLimit   = limit_minutes !== undefined ? parseInt(limit_minutes) : cfg.limit_minutes;

  db(req).prepare('UPDATE scheduler_config SET enabled=?, limit_minutes=? WHERE id=1')
    .run(newEnabled, newLimit);

  res.json({ ok: true });
});

// POST /api/scheduler/reset — reset the idle timer
router.post('/reset', auth, (req, res) => {
  db(req).prepare("UPDATE scheduler_config SET last_activity=datetime('now') WHERE id=1").run();
  res.json({ ok: true, lastActivity: new Date().toISOString() });
});

module.exports = router;
