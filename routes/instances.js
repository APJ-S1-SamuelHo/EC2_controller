'use strict';

const express = require('express');
const { EC2Client, DescribeInstancesCommand, StartInstancesCommand, StopInstancesCommand } = require('@aws-sdk/client-ec2');
const router = express.Router();

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

function getEC2Client(region) {
  // Uses IAM role automatically when running on EC2.
  // Falls back to AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars.
  return new EC2Client({ region: region || 'us-west-2' });
}

// ── Instances CRUD ───────────────────────────────────────────────────────

// GET /api/instances — list all saved instances
router.get('/', auth, (req, res) => {
  const rows = db(req).prepare('SELECT * FROM instances ORDER BY created_at').all();
  res.json(rows);
});

// POST /api/instances — add a new instance (admin only)
router.post('/', adminOnly, (req, res) => {
  const { name, instance_id, region } = req.body;
  if (!name || !instance_id) return res.status(400).json({ error: 'name and instance_id required' });
  try {
    const info = db(req).prepare(
      'INSERT INTO instances (name, instance_id, region) VALUES (?, ?, ?)'
    ).run(name.trim(), instance_id.trim(), (region || 'us-west-2').trim());
    res.json({ id: info.lastInsertRowid, name, instance_id, region: region || 'us-west-2' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Instance ID already exists' });
    throw e;
  }
});

// DELETE /api/instances/:id — remove an instance (admin only)
router.delete('/:id', adminOnly, (req, res) => {
  db(req).prepare('DELETE FROM instances WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── AWS Live Status ──────────────────────────────────────────────────────

// GET /api/instances/:id/status — live AWS describe
router.get('/:id/status', auth, async (req, res) => {
  const row = db(req).prepare('SELECT * FROM instances WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance not found' });

  try {
    const ec2 = getEC2Client(row.region);
    const cmd = new DescribeInstancesCommand({ InstanceIds: [row.instance_id] });
    const data = await ec2.send(cmd);
    const inst = data.Reservations?.[0]?.Instances?.[0];
    if (!inst) return res.status(404).json({ error: 'Instance not found in AWS' });

    res.json({
      instanceId:   inst.InstanceId,
      state:        inst.State?.Name,
      publicIp:     inst.PublicIpAddress || null,
      privateIp:    inst.PrivateIpAddress || null,
      instanceType: inst.InstanceType,
      launchTime:   inst.LaunchTime,
      name:         row.name,
      region:       row.region,
      dbId:         row.id
    });
  } catch (err) {
    console.error('AWS describe error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/instances/:id/start
router.post('/:id/start', auth, async (req, res) => {
  const row = db(req).prepare('SELECT * FROM instances WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance not found' });

  try {
    const ec2 = getEC2Client(row.region);
    await ec2.send(new StartInstancesCommand({ InstanceIds: [row.instance_id] }));
    res.json({ ok: true, action: 'start', instance_id: row.instance_id });
  } catch (err) {
    console.error('AWS start error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/instances/:id/stop
router.post('/:id/stop', auth, async (req, res) => {
  const row = db(req).prepare('SELECT * FROM instances WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance not found' });

  try {
    const ec2 = getEC2Client(row.region);
    await ec2.send(new StopInstancesCommand({ InstanceIds: [row.instance_id] }));
    res.json({ ok: true, action: 'stop', instance_id: row.instance_id });
  } catch (err) {
    console.error('AWS stop error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Applications ──────────────────────────────────────────────────────────

// GET /api/instances/:id/apps
router.get('/:id/apps', auth, (req, res) => {
  const apps = db(req).prepare(
    'SELECT * FROM applications WHERE instance_db_id=? ORDER BY created_at'
  ).all(req.params.id);
  res.json(apps);
});

// POST /api/instances/:id/apps
router.post('/:id/apps', adminOnly, (req, res) => {
  const { name, url, icon } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const info = db(req).prepare(
    'INSERT INTO applications (instance_db_id, name, url, icon) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, name.trim(), url.trim(), (icon || '🔗').trim());
  res.json({ id: info.lastInsertRowid, name, url, icon: icon || '🔗' });
});

// DELETE /api/instances/:id/apps/:appId
router.delete('/:id/apps/:appId', adminOnly, (req, res) => {
  db(req).prepare('DELETE FROM applications WHERE id=? AND instance_db_id=?')
    .run(req.params.appId, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
