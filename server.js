'use strict';

const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'ec2-control-secret-change-me';
const DB_PATH = path.join(__dirname, 'panel.db');

// ── Database setup ─────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    email      TEXT    UNIQUE NOT NULL,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'user',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS instances (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    instance_id TEXT UNIQUE NOT NULL,
    region      TEXT NOT NULL DEFAULT 'us-west-2',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_db_id  INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    icon            TEXT NOT NULL DEFAULT '🔗',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scheduler_config (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    enabled        INTEGER NOT NULL DEFAULT 1,
    limit_minutes  INTEGER NOT NULL DEFAULT 30,
    last_activity  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed scheduler config row
if (!db.prepare('SELECT id FROM scheduler_config WHERE id=1').get()) {
  db.prepare("INSERT INTO scheduler_config (id) VALUES (1)").run();
}

// Seed default admin if no users exist
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')")
    .run('Admin', 'admin@example.com', hash);
  console.log('Default admin created: admin@example.com / admin123');
}

// ── Express setup ──────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Attach db to every request
app.use((req, _res, next) => { req.db = db; next(); });

// Activity tracker for scheduler
app.use((req, res, next) => {
  if (req.session?.user && req.path.startsWith('/api')) {
    db.prepare("UPDATE scheduler_config SET last_activity=datetime('now') WHERE id=1").run();
  }
  next();
});

// ── Auth middleware ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// Export helpers so routes can use them
app.locals.db = db;
app.locals.requireAuth = requireAuth;
app.locals.requireAdmin = requireAdmin;

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/instances', require('./routes/instances'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/scheduler', require('./routes/scheduler'));

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────
const scheduler = require('./scheduler');
scheduler.init(db);

app.listen(PORT, () => console.log(`EC2 Control Panel running on http://0.0.0.0:${PORT}`));
