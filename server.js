require('dotenv').config();
const express              = require('express');
const { DatabaseSync }     = require('node:sqlite');
const jwt                  = require('jsonwebtoken');
const crypto               = require('crypto');
const fs                   = require('fs');
const path                 = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET      = process.env.JWT_SECRET      || 'vvl-change-me';
const ADMIN_USER_HASH = process.env.ADMIN_USER_HASH || '';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || '';
const BOT_API_KEY     = process.env.BOT_API_KEY     || '';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ============================================================
// DATABASE
// ============================================================
const DEFAULT_DB_PATH = fs.existsSync('/var/data')
  ? '/var/data/vvleague.db'
  : path.join(__dirname, 'vvleague.db');
const DB_PATH = (process.env.DB_PATH || DEFAULT_DB_PATH).trim();
const db = new DatabaseSync(DB_PATH);
console.log(`📦 Website database: ${DB_PATH}`);
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS war_logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    date      TEXT NOT NULL,
    org1      TEXT NOT NULL,
    org2      TEXT NOT NULL,
    score1    INTEGER DEFAULT 0,
    score2    INTEGER DEFAULT 0,
    winner    TEXT DEFAULT '',
    wager     INTEGER DEFAULT 0,
    region    TEXT DEFAULT 'NA',
    season    TEXT DEFAULT 'S3',
    notes     TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS season_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    season      TEXT NOT NULL,
    date        TEXT NOT NULL,
    event_name  TEXT DEFAULT '',
    org1        TEXT NOT NULL,
    org2        TEXT NOT NULL,
    score1      INTEGER DEFAULT 0,
    score2      INTEGER DEFAULT 0,
    winner      TEXT DEFAULT '',
    region      TEXT DEFAULT 'NA',
    notes       TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wager_records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    challenger TEXT NOT NULL,
    challenged TEXT NOT NULL,
    amount     INTEGER NOT NULL DEFAULT 0,
    winner     TEXT DEFAULT '',
    status     TEXT DEFAULT 'pending',
    paid       INTEGER DEFAULT 0,
    season     TEXT DEFAULT 'S3',
    notes      TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS awards (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    season            TEXT NOT NULL,
    recipient_name    TEXT NOT NULL,
    recipient_org     TEXT DEFAULT '',
    award_title       TEXT NOT NULL,
    award_description TEXT DEFAULT '',
    photo_url         TEXT DEFAULT '',
    sort_order        INTEGER DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS brackets (
    region     TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rules (
    page       TEXT PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrate: add elo columns to war_logs if not present
try { db.exec('ALTER TABLE war_logs ADD COLUMN elo_org1 INTEGER DEFAULT NULL'); } catch(e) {}
try { db.exec('ALTER TABLE war_logs ADD COLUMN elo_org2 INTEGER DEFAULT NULL'); } catch(e) {}

// ============================================================
// ORGS / MEMBERS / PLAYERS TABLES
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS orgs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tag        TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    status     TEXT DEFAULT 'active',
    founded    TEXT DEFAULT 'S1',
    region     TEXT DEFAULT 'NA',
    icon       TEXT DEFAULT '',
    mvp        TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS org_members (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    name   TEXT NOT NULL,
    role   TEXT DEFAULT 'Player'
  );

  CREATE TABLE IF NOT EXISTS players (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    org        TEXT DEFAULT '',
    elo        INTEGER DEFAULT 1000,
    wins       INTEGER DEFAULT 0,
    losses     INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed orgs if empty
if (!db.prepare('SELECT COUNT(*) as c FROM orgs').get().c) {
  const insOrg = db.prepare('INSERT INTO orgs (tag,name,status,founded,region,icon,mvp) VALUES (?,?,?,?,?,?,?)');
  const insMem = db.prepare('INSERT INTO org_members (org_id,name,role) VALUES (?,?,?)');
  [
    { tag:'VVS', name:'VVS Esports',  status:'active',   founded:'Season 1', region:'NA',   icon:'⚡', mvp:'ShadowX',    members:[{name:'ShadowX',role:'Leader'},{name:'NightFox',role:'Player'},{name:'BladeRush',role:'Player'},{name:'ColdWave',role:'Player'},{name:'IronGhost',role:'Sub'}] },
    { tag:'NXS', name:'Nexus Gaming', status:'active',   founded:'Season 1', region:'NA',   icon:'🔷', mvp:'PhoenixR',   members:[{name:'PhoenixR',role:'Leader'},{name:'VoltEdge',role:'Player'},{name:'StormByte',role:'Player'},{name:'DarkPulse',role:'Player'}] },
    { tag:'ZRO', name:'Zero Hour',    status:'active',   founded:'Season 2', region:'NA',   icon:'🌀', mvp:'GlitchKing', members:[{name:'GlitchKing',role:'Leader'},{name:'SteelViper',role:'Player'},{name:'ArcFlame',role:'Player'}] },
    { tag:'RVN', name:'Raven Org',    status:'active',   founded:'Season 2', region:'NA',   icon:'🦅', mvp:'LunarBlade', members:[{name:'CrimsonFang',role:'Leader'},{name:'LunarBlade',role:'Player'},{name:'EchoSniper',role:'Player'},{name:'WarpField',role:'Sub'}] },
    { tag:'TRX', name:'Torex Squad',  status:'inactive', founded:'Season 1', region:'NA',   icon:'🔩', mvp:'ThunderX',   members:[{name:'ThunderX',role:'Leader'},{name:'HazeSpark',role:'Player'}] },
    { tag:'ABY', name:'Abyss Club',   status:'active',   founded:'Season 3', region:'NA',   icon:'🌑', mvp:'VoidSeeker', members:[{name:'VoidSeeker',role:'Leader'},{name:'NullByte',role:'Player'},{name:'ChaosBolt',role:'Player'}] },
    { tag:'FRZ', name:'Frenzy EU',    status:'active',   founded:'Season 2', region:'EU',   icon:'🔥', mvp:'KrakenX',    members:[{name:'KrakenX',role:'Leader'},{name:'FrostEdge',role:'Player'},{name:'GaleForce',role:'Player'},{name:'TerraFirm',role:'Player'}] },
    { tag:'SKY', name:'Skyline ASIA', status:'active',   founded:'Season 1', region:'ASIA', icon:'🐉', mvp:'DragonFist', members:[{name:'DragonFist',role:'Leader'},{name:'ThunderKoi',role:'Player'},{name:'SilkWind',role:'Player'}] },
  ].forEach(o => {
    const r = insOrg.run(o.tag, o.name, o.status, o.founded, o.region, o.icon, o.mvp);
    o.members.forEach(m => insMem.run(r.lastInsertRowid, m.name, m.role));
  });
}

// Schedule table
db.exec(`
  CREATE TABLE IF NOT EXISTS schedule (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    time       TEXT DEFAULT '',
    match      TEXT NOT NULL,
    region     TEXT DEFAULT 'ALL',
    round      TEXT DEFAULT '',
    status     TEXT DEFAULT 'upcoming',
    season     TEXT DEFAULT 'S3',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed players if empty
if (!db.prepare('SELECT COUNT(*) as c FROM players').get().c) {
  const insP = db.prepare('INSERT INTO players (name,org,elo,wins,losses) VALUES (?,?,?,?,?)');
  [
    {name:'ShadowX',    org:'VVS', elo:2780, wins:38, losses:12},
    {name:'PhoenixR',   org:'NXS', elo:2610, wins:34, losses:16},
    {name:'KrakenX',    org:'FRZ', elo:2580, wins:32, losses:14},
    {name:'DragonFist', org:'SKY', elo:2490, wins:29, losses:18},
    {name:'GlitchKing', org:'ZRO', elo:2440, wins:27, losses:19},
    {name:'LunarBlade', org:'RVN', elo:2240, wins:26, losses:20},
    {name:'NightFox',   org:'VVS', elo:2180, wins:25, losses:22},
    {name:'VoltEdge',   org:'NXS', elo:1940, wins:21, losses:24},
    {name:'VoidSeeker', org:'ABY', elo:1820, wins:20, losses:25},
    {name:'ArcFlame',   org:'ZRO', elo:1750, wins:18, losses:26},
    {name:'CrimsonFang',org:'RVN', elo:1620, wins:16, losses:28},
    {name:'EchoSniper', org:'RVN', elo:1530, wins:15, losses:29},
    {name:'StormByte',  org:'NXS', elo:1480, wins:14, losses:30},
    {name:'BladeRush',  org:'VVS', elo:1390, wins:13, losses:31},
    {name:'HazeSpark',  org:'TRX', elo:890,  wins:7,  losses:37},
  ].forEach(p => insP.run(p.name, p.org, p.elo, p.wins, p.losses));
}

// Seed schedule if empty
if (!db.prepare('SELECT COUNT(*) as c FROM schedule').get().c) {
  const insS = db.prepare('INSERT INTO schedule (date,time,match,region,round,status,season) VALUES (?,?,?,?,?,?,?)');
  [
    ['2026-06-25','18:00','VVS vs ABY',  'NA',  'Semifinal',  'upcoming','S3'],
    ['2026-06-25','20:00','ZRO vs VLT',  'NA',  'Semifinal',  'upcoming','S3'],
    ['2026-06-26','17:00','FRZ vs NOV',  'EU',  'Semifinal',  'upcoming','S3'],
    ['2026-06-27','14:00','SKY vs KRN',  'ASIA','Semifinal',  'upcoming','S3'],
    ['2026-06-27','10:00','WVE vs DNG',  'OCE', 'Semifinal',  'upcoming','S3'],
    ['2026-06-28','19:00','JGR vs SOL',  'SA',  'Semifinal',  'upcoming','S3'],
    ['2026-07-05','20:00','NA Finals',   'NA',  'Final',      'upcoming','S3'],
    ['2026-07-06','19:00','EU Finals',   'EU',  'Final',      'upcoming','S3'],
    ['2026-07-07','14:00','ASIA Finals', 'ASIA','Final',      'upcoming','S3'],
    ['2026-07-07','10:00','OCE Finals',  'OCE', 'Final',      'upcoming','S3'],
    ['2026-07-08','19:00','SA Finals',   'SA',  'Final',      'upcoming','S3'],
    ['2026-08-01','20:00','VVL S3 Championship','ALL','Grand Final','upcoming','S3'],
  ].forEach(r => insS.run(...r));
}

// Migrate: convert amount column in wager_records to TEXT
const wagerRecCols = db.prepare("PRAGMA table_info(wager_records)").all();
if (wagerRecCols.find(c => c.name === 'amount' && c.type === 'INTEGER')) {
  db.exec(`
    BEGIN;
    ALTER TABLE wager_records RENAME TO _wager_records_old;
    CREATE TABLE wager_records (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      challenger TEXT NOT NULL,
      challenged TEXT NOT NULL,
      amount     TEXT DEFAULT '',
      winner     TEXT DEFAULT '',
      status     TEXT DEFAULT 'pending',
      paid       INTEGER DEFAULT 0,
      season     TEXT DEFAULT 'S3',
      notes      TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      stats      TEXT DEFAULT ''
    );
    INSERT INTO wager_records SELECT id,date,challenger,challenged,CAST(amount AS TEXT),winner,status,paid,season,notes,created_at,'' FROM _wager_records_old;
    DROP TABLE _wager_records_old;
    COMMIT;
  `);
}

// Migrate brackets to support seasons
const bracketColCheck = db.prepare("PRAGMA table_info(brackets)").all();
if (!bracketColCheck.find(c => c.name === 'season')) {
  db.exec(`
    BEGIN;
    ALTER TABLE brackets RENAME TO _brackets_old;
    CREATE TABLE brackets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      region     TEXT NOT NULL,
      season     TEXT NOT NULL DEFAULT 'S3',
      data       TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(region, season)
    );
    INSERT INTO brackets (region, season, data, updated_at)
      SELECT region, 'S3', data, updated_at FROM _brackets_old;
    DROP TABLE _brackets_old;
    COMMIT;
  `);
}

// Seed S3 brackets if empty
if (!db.prepare('SELECT COUNT(*) as c FROM brackets').get().c) {
  const insBr = db.prepare('INSERT INTO brackets (region,season,data) VALUES (?,?,?)');
  [
    ['NA','S3',JSON.stringify({qf:[{t1:'VVS',s1:3,t2:'TRX',s2:0,done:true},{t1:'NXS',s1:2,t2:'ABY',s2:3,done:true},{t1:'ZRO',s1:3,t2:'RVN',s2:1,done:true},{t1:'FRZ',s1:1,t2:'VLT',s2:3,done:true}],sf:[{t1:'VVS',s1:null,t2:'ABY',s2:null,done:false},{t1:'ZRO',s1:null,t2:'VLT',s2:null,done:false}],f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}],champion:null})],
    ['EU','S3',JSON.stringify({qf:[{t1:'FRZ',s1:3,t2:'EMP',s2:1,done:true},{t1:'VLT',s1:2,t2:'NOV',s2:3,done:true}],sf:[{t1:'FRZ',s1:null,t2:'NOV',s2:null,done:false}],f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}],champion:null})],
    ['ASIA','S3',JSON.stringify({qf:[{t1:'SKY',s1:3,t2:'ZEN',s2:0,done:true},{t1:'ONI',s1:1,t2:'KRN',s2:3,done:true}],sf:[{t1:'SKY',s1:null,t2:'KRN',s2:null,done:false}],f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}],champion:null})],
    ['OCE','S3',JSON.stringify({qf:[{t1:'WVE',s1:3,t2:'CRL',s2:1,done:true}],sf:[{t1:'WVE',s1:null,t2:'DNG',s2:null,done:false}],f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}],champion:null})],
    ['SA','S3',JSON.stringify({qf:[{t1:'JGR',s1:3,t2:'CAP',s2:0,done:true},{t1:'AND',s1:2,t2:'SOL',s2:3,done:true}],sf:[{t1:'JGR',s1:null,t2:'SOL',s2:null,done:false}],f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}],champion:null})],
  ].forEach(r => insBr.run(...r));
}

// Migrate: add points columns to season_logs
try { db.exec('ALTER TABLE season_logs ADD COLUMN points_winner INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE season_logs ADD COLUMN points_loser  INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec("ALTER TABLE orgs ADD COLUMN logo_url TEXT DEFAULT ''"); } catch(e) {}

// Migrate: add stats column to all log tables (must run after table recreations below)
// NOTE: placed here so recreated tables also get the column
try { db.exec('ALTER TABLE season_logs ADD COLUMN stats TEXT DEFAULT ""'); } catch(e) {}

// Migrate: convert wager column to TEXT (recreate table preserving data)
const warCols = db.prepare("PRAGMA table_info(war_logs)").all();
if (warCols.find(c => c.name === 'wager' && c.type === 'INTEGER')) {
  db.exec(`
    BEGIN;
    ALTER TABLE war_logs RENAME TO _war_logs_old;
    CREATE TABLE war_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      org1       TEXT NOT NULL,
      org2       TEXT NOT NULL,
      score1     INTEGER DEFAULT 0,
      score2     INTEGER DEFAULT 0,
      winner     TEXT DEFAULT '',
      wager      TEXT DEFAULT '',
      region     TEXT DEFAULT 'NA',
      season     TEXT DEFAULT 'S3',
      notes      TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      elo_org1   INTEGER DEFAULT NULL,
      elo_org2   INTEGER DEFAULT NULL,
      stats      TEXT DEFAULT ''
    );
    INSERT INTO war_logs SELECT id,date,org1,org2,score1,score2,winner,CAST(wager AS TEXT),region,season,notes,created_at,elo_org1,elo_org2,'' FROM _war_logs_old;
    DROP TABLE _war_logs_old;
    COMMIT;
  `);
}

// Migrate: add stats to war_logs and wager_records (safe after recreation above)
try { db.exec('ALTER TABLE war_logs ADD COLUMN stats TEXT DEFAULT ""'); } catch(e) {}
try { db.exec('ALTER TABLE wager_records ADD COLUMN stats TEXT DEFAULT ""'); } catch(e) {}
try { db.exec('ALTER TABLE war_logs ADD COLUMN stats_synced INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec("ALTER TABLE war_logs ADD COLUMN mvp TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE season_logs ADD COLUMN mvp TEXT DEFAULT ''"); } catch(e) {}
// Site settings table (ELO per kill/death etc.)
db.exec(`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
// Ensure default ELO stat settings exist
const _eloKill = db.prepare("SELECT value FROM site_settings WHERE key='stat_elo_per_kill'").get();
if (!_eloKill) db.prepare("INSERT INTO site_settings (key,value) VALUES ('stat_elo_per_kill','2.5')").run();
const _eloDeath = db.prepare("SELECT value FROM site_settings WHERE key='stat_elo_per_death'").get();
if (!_eloDeath) db.prepare("INSERT INTO site_settings (key,value) VALUES ('stat_elo_per_death','-2.5')").run();
// Migrate: bot integration columns
try { db.exec("ALTER TABLE org_members ADD COLUMN discord_id TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE orgs ADD COLUMN discord_role_id TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE orgs ADD COLUMN signing_open INTEGER DEFAULT 1"); } catch(e) {}
try { db.exec("ALTER TABLE players ADD COLUMN discord_id TEXT DEFAULT ''"); } catch(e) {}

// Admin users table (multi-login with permissions)
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    pass_hash  TEXT NOT NULL,
    perms      TEXT DEFAULT 'logs',
    active     INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ============================================================
// HELPERS
// ============================================================
function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }
}

function requireBotAuth(req, res, next) {
  if (!BOT_API_KEY) return res.status(503).json({ error: 'Bot API not configured' });
  if (req.headers['x-bot-key'] !== BOT_API_KEY) return res.status(401).json({ error: 'Invalid bot key' });
  next();
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (req.admin.perms === 'all') return next();
    const perms = (req.admin.perms || '').split(',').map(p => p.trim());
    if (perms.includes(perm)) return next();
    // _delete variant implies the base permission
    if (!perm.endsWith('_delete') && perms.includes(perm + '_delete')) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

// ============================================================
// AUTH
// ============================================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  // Super admin via env vars
  if (sha256(username) === ADMIN_USER_HASH && sha256(password) === ADMIN_PASS_HASH) {
    const token = jwt.sign({ role: 'admin', perms: 'all' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, perms: 'all' });
  }
  // Sub-admins via DB
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ? AND active = 1').get(username);
  if (user && sha256(password) === user.pass_hash) {
    const token = jwt.sign({ role: 'admin', perms: user.perms }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, perms: user.perms });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/auth/verify', requireAdmin, (req, res) => res.json({ valid: true, perms: req.admin.perms || 'all' }));

// ============================================================
// ADMIN USERS (multi-login management)
// ============================================================
app.get('/api/admin-users', requireAdmin, (req, res) => {
  if (req.admin.perms !== 'all') return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT id,username,perms,active,created_at FROM admin_users ORDER BY id').all());
});

app.post('/api/admin-users', requireAdmin, (req, res) => {
  if (req.admin.perms !== 'all') return res.status(403).json({ error: 'Forbidden' });
  const { username, password, perms } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const r = db.prepare('INSERT INTO admin_users (username,pass_hash,perms) VALUES (?,?,?)').run(username, sha256(password), perms||'logs');
    res.json({ id: r.lastInsertRowid });
  } catch(e) { res.status(400).json({ error: 'Username already exists' }); }
});

app.put('/api/admin-users/:id', requireAdmin, (req, res) => {
  if (req.admin.perms !== 'all') return res.status(403).json({ error: 'Forbidden' });
  const { perms, active, password } = req.body;
  if (password) {
    db.prepare('UPDATE admin_users SET perms=?,active=?,pass_hash=? WHERE id=?').run(perms||'logs', active?1:0, sha256(password), req.params.id);
  } else {
    db.prepare('UPDATE admin_users SET perms=?,active=? WHERE id=?').run(perms||'logs', active?1:0, req.params.id);
  }
  res.json({ ok: true });
});

app.delete('/api/admin-users/:id', requireAdmin, (req, res) => {
  if (req.admin.perms !== 'all') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM admin_users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// WAR LOGS
// ============================================================
app.get('/api/logs/war', (req, res) => {
  const { season, region } = req.query;
  const conds = [], params = [];
  if (season) { conds.push('season = ?'); params.push(season); }
  if (region && region !== 'ALL') { conds.push('region = ?'); params.push(region); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM war_logs${where} ORDER BY date DESC, id DESC`).all(...params);
  res.json(rows.map(r => ({...r, stats: r.stats ? JSON.parse(r.stats) : []})));
});

function syncWarStatsToPlayerLB(stats, winner, org1, org2, elo_org1, elo_org2) {
  if (!Array.isArray(stats) || !stats.length) return;
  const killVal  = parseFloat(db.prepare("SELECT value FROM site_settings WHERE key='stat_elo_per_kill'").get()?.value  ?? '2.5');
  const deathVal = parseFloat(db.prepare("SELECT value FROM site_settings WHERE key='stat_elo_per_death'").get()?.value ?? '-2.5');
  for (const s of stats) {
    const name = (s.player || '').trim();
    if (!name) continue;
    const kills    = parseInt(s.kills)  || 0;
    const deaths   = parseInt(s.deaths) || 0;
    const kdDelta  = Math.round(kills * killVal + deaths * deathVal);
    // Guild win/loss ELO added on top of K/D ELO
    const guildElo = s.team === 1 ? (parseInt(elo_org1) || 0) : s.team === 2 ? (parseInt(elo_org2) || 0) : 0;
    const eloDelta = kdDelta + guildElo;
    let isWin = false, isLoss = false;
    if (winner && s.team) {
      if      (s.team === 1 && winner === org1) isWin  = true;
      else if (s.team === 2 && winner === org2) isWin  = true;
      else if (s.team === 1 || s.team === 2)    isLoss = true;
    }
    const playerOrg = s.team === 1 ? (org1 || '') : s.team === 2 ? (org2 || '') : '';
    const existing  = db.prepare('SELECT * FROM players WHERE LOWER(name) = LOWER(?)').get(name);
    if (existing) {
      db.prepare('UPDATE players SET elo=?,wins=?,losses=? WHERE id=?').run(
        (existing.elo ?? 0) + eloDelta,
        (existing.wins   || 0) + (isWin  ? 1 : 0),
        (existing.losses || 0) + (isLoss ? 1 : 0),
        existing.id
      );
    } else {
      db.prepare('INSERT INTO players (name,org,elo,wins,losses) VALUES (?,?,?,?,?)').run(
        name, playerOrg, eloDelta, isWin ? 1 : 0, isLoss ? 1 : 0
      );
    }
  }
}

function reverseWarStatsFromPlayerLB(stats, winner, org1, org2, elo_org1, elo_org2) {
  if (!Array.isArray(stats) || !stats.length) return;
  const killVal  = parseFloat(db.prepare("SELECT value FROM site_settings WHERE key='stat_elo_per_kill'").get()?.value  ?? '2.5');
  const deathVal = parseFloat(db.prepare("SELECT value FROM site_settings WHERE key='stat_elo_per_death'").get()?.value ?? '-2.5');
  for (const s of stats) {
    const name = (s.player || '').trim();
    if (!name) continue;
    const kills   = parseInt(s.kills)  || 0;
    const deaths  = parseInt(s.deaths) || 0;
    const kdDelta = Math.round(kills * killVal + deaths * deathVal);
    const guildElo = s.team === 1 ? (parseInt(elo_org1) || 0) : s.team === 2 ? (parseInt(elo_org2) || 0) : 0;
    const eloDelta = kdDelta + guildElo;
    let wasWin = false, wasLoss = false;
    if (winner && s.team) {
      if      (s.team === 1 && winner === org1) wasWin  = true;
      else if (s.team === 2 && winner === org2) wasWin  = true;
      else if (s.team === 1 || s.team === 2)    wasLoss = true;
    }
    const existing = db.prepare('SELECT * FROM players WHERE LOWER(name) = LOWER(?)').get(name);
    if (existing) {
      db.prepare('UPDATE players SET elo=?,wins=?,losses=? WHERE id=?').run(
        (existing.elo ?? 0) - eloDelta,
        Math.max(0, (existing.wins   || 0) - (wasWin  ? 1 : 0)),
        Math.max(0, (existing.losses || 0) - (wasLoss ? 1 : 0)),
        existing.id
      );
    }
  }
}

app.post('/api/logs/war', requireAdmin, requirePerm('logs'), (req, res) => {
  const { date, org1, org2, score1, score2, winner, wager, region, season, notes, elo_org1, elo_org2, stats, mvp } = req.body;
  if (!date || !org1 || !org2) return res.status(400).json({ error: 'date, org1, org2 required' });
  const r = db.prepare(
    'INSERT INTO war_logs (date,org1,org2,score1,score2,winner,wager,region,season,notes,elo_org1,elo_org2,stats,mvp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(date, org1, org2, score1||0, score2||0, winner||'', wager||'', region||'NA', season||'S3', notes||'', elo_org1??null, elo_org2??null, stats ? JSON.stringify(stats) : '', mvp||'');
  if (Array.isArray(stats) && stats.length) {
    syncWarStatsToPlayerLB(stats, winner || '', org1, org2, elo_org1, elo_org2);
    db.prepare('UPDATE war_logs SET stats_synced=1 WHERE id=?').run(r.lastInsertRowid);
  }
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/logs/war/:id', requireAdmin, requirePerm('logs'), (req, res) => {
  const { date, org1, org2, score1, score2, winner, wager, region, season, notes, elo_org1, elo_org2, stats, mvp } = req.body;
  const oldLog = db.prepare('SELECT * FROM war_logs WHERE id=?').get(req.params.id);
  // Reverse previous sync before applying new data
  if (oldLog?.stats_synced) {
    const oldStats = oldLog.stats ? JSON.parse(oldLog.stats) : [];
    reverseWarStatsFromPlayerLB(oldStats, oldLog.winner, oldLog.org1, oldLog.org2, oldLog.elo_org1, oldLog.elo_org2);
  }
  db.prepare(
    'UPDATE war_logs SET date=?,org1=?,org2=?,score1=?,score2=?,winner=?,wager=?,region=?,season=?,notes=?,elo_org1=?,elo_org2=?,stats=?,stats_synced=0,mvp=? WHERE id=?'
  ).run(date, org1, org2, score1||0, score2||0, winner||'', wager||'', region||'NA', season||'S3', notes||'', elo_org1??null, elo_org2??null, stats ? JSON.stringify(stats) : '', mvp||'', req.params.id);
  if (Array.isArray(stats) && stats.length) {
    syncWarStatsToPlayerLB(stats, winner || '', org1, org2, elo_org1, elo_org2);
    db.prepare('UPDATE war_logs SET stats_synced=1 WHERE id=?').run(req.params.id);
  }
  res.json({ ok: true });
});

app.delete('/api/logs/war/:id', requireAdmin, requirePerm('logs_delete'), (req, res) => {
  db.prepare('DELETE FROM war_logs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// SEASON LOGS
// ============================================================
app.get('/api/logs/season', (req, res) => {
  const { season, region } = req.query;
  const conds = [], params = [];
  if (season) { conds.push('season = ?'); params.push(season); }
  if (region && region !== 'ALL') { conds.push('region = ?'); params.push(region); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM season_logs${where} ORDER BY date DESC, id DESC`).all(...params);
  res.json(rows.map(r => ({...r, stats: r.stats ? JSON.parse(r.stats) : []})));
});

app.post('/api/logs/season', requireAdmin, requirePerm('logs'), (req, res) => {
  const { season, date, event_name, org1, org2, score1, score2, winner, region, notes, points_winner, points_loser, stats, mvp } = req.body;
  if (!season || !date || !org1 || !org2) return res.status(400).json({ error: 'season, date, org1, org2 required' });
  const r = db.prepare(
    'INSERT INTO season_logs (season,date,event_name,org1,org2,score1,score2,winner,region,notes,points_winner,points_loser,stats,mvp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(season, date, event_name||'', org1, org2, score1||0, score2||0, winner||'', region||'NA', notes||'', points_winner||0, points_loser||0, stats ? JSON.stringify(stats) : '', mvp||'');
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/logs/season/:id', requireAdmin, requirePerm('logs'), (req, res) => {
  const { season, date, event_name, org1, org2, score1, score2, winner, region, notes, points_winner, points_loser, stats, mvp } = req.body;
  db.prepare(
    'UPDATE season_logs SET season=?,date=?,event_name=?,org1=?,org2=?,score1=?,score2=?,winner=?,region=?,notes=?,points_winner=?,points_loser=?,stats=?,mvp=? WHERE id=?'
  ).run(season, date, event_name||'', org1, org2, score1||0, score2||0, winner||'', region||'NA', notes||'', points_winner||0, points_loser||0, stats ? JSON.stringify(stats) : '', mvp||'', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/logs/season/:id', requireAdmin, requirePerm('logs_delete'), (req, res) => {
  db.prepare('DELETE FROM season_logs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// WAGER RECORDS
// ============================================================
app.get('/api/logs/wager', (req, res) => {
  const { season, status } = req.query;
  const conds = [], params = [];
  if (season) { conds.push('season = ?'); params.push(season); }
  if (status && status !== 'ALL') { conds.push('status = ?'); params.push(status); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM wager_records${where} ORDER BY date DESC, id DESC`).all(...params);
  res.json(rows.map(r => ({...r, stats: r.stats ? JSON.parse(r.stats) : []})));
});

app.post('/api/logs/wager', requireAdmin, requirePerm('wager'), (req, res) => {
  const { date, challenger, challenged, amount, winner, status, paid, season, notes, stats } = req.body;
  if (!date || !challenger || !challenged || amount === undefined)
    return res.status(400).json({ error: 'date, challenger, challenged, amount required' });
  const r = db.prepare(
    'INSERT INTO wager_records (date,challenger,challenged,amount,winner,status,paid,season,notes,stats) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(date, challenger, challenged, amount||'', winner||'', status||'pending', paid ? 1 : 0, season||'S3', notes||'', stats ? JSON.stringify(stats) : '');
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/logs/wager/:id', requireAdmin, requirePerm('wager'), (req, res) => {
  const { date, challenger, challenged, amount, winner, status, paid, season, notes, stats } = req.body;
  db.prepare(
    'UPDATE wager_records SET date=?,challenger=?,challenged=?,amount=?,winner=?,status=?,paid=?,season=?,notes=?,stats=? WHERE id=?'
  ).run(date, challenger, challenged, amount||'', winner||'', status||'pending', paid ? 1 : 0, season||'S3', notes||'', stats ? JSON.stringify(stats) : '', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/logs/wager/:id', requireAdmin, requirePerm('wager_delete'), (req, res) => {
  db.prepare('DELETE FROM wager_records WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// AWARDS
// ============================================================
app.get('/api/awards/seasons', (_req, res) => {
  res.json(db.prepare('SELECT DISTINCT season FROM awards ORDER BY season DESC').all().map(r => r.season));
});

app.get('/api/awards', (req, res) => {
  const { season } = req.query;
  const rows = season
    ? db.prepare('SELECT * FROM awards WHERE season=? ORDER BY sort_order ASC, id ASC').all(season)
    : db.prepare('SELECT * FROM awards ORDER BY season DESC, sort_order ASC, id ASC').all();
  res.json(rows);
});

app.post('/api/awards', requireAdmin, requirePerm('awards'), (req, res) => {
  const { season, recipient_name, recipient_org, award_title, award_description, photo_url, sort_order } = req.body;
  if (!season || !recipient_name || !award_title)
    return res.status(400).json({ error: 'season, recipient_name, award_title required' });
  const r = db.prepare(
    'INSERT INTO awards (season,recipient_name,recipient_org,award_title,award_description,photo_url,sort_order) VALUES (?,?,?,?,?,?,?)'
  ).run(season, recipient_name, recipient_org||'', award_title, award_description||'', photo_url||'', sort_order||0);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/awards/:id', requireAdmin, requirePerm('awards'), (req, res) => {
  const { season, recipient_name, recipient_org, award_title, award_description, photo_url, sort_order } = req.body;
  db.prepare(
    'UPDATE awards SET season=?,recipient_name=?,recipient_org=?,award_title=?,award_description=?,photo_url=?,sort_order=? WHERE id=?'
  ).run(season, recipient_name, recipient_org||'', award_title, award_description||'', photo_url||'', sort_order||0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/awards/:id', requireAdmin, requirePerm('awards_delete'), (req, res) => {
  db.prepare('DELETE FROM awards WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// BRACKETS
// ============================================================
app.get('/api/brackets/seasons', (_req, res) => {
  const seasons = db.prepare("SELECT DISTINCT season FROM brackets ORDER BY CAST(REPLACE(UPPER(season),'S','') AS INTEGER) ASC").all().map(r => r.season);
  res.json(seasons.length ? seasons : ['S3']);
});

app.get('/api/brackets', (req, res) => {
  const season = req.query.season || 'S3';
  const rows = db.prepare('SELECT region, data FROM brackets WHERE season = ?').all(season);
  const out  = {};
  rows.forEach(r => { out[r.region] = JSON.parse(r.data); });
  res.json(out);
});

app.post('/api/brackets', requireAdmin, requirePerm('brackets'), (req, res) => {
  const { region, season, data } = req.body;
  if (!region || !season) return res.status(400).json({ error: 'region and season required' });
  const initialData = data || { qf:[], sf:[], f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}], gf:[], champion:null, labels:{} };
  try {
    db.prepare('INSERT INTO brackets (region,season,data) VALUES (?,?,?)').run(region.toUpperCase(), season, JSON.stringify(initialData));
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: 'Bracket already exists' }); }
});

app.put('/api/brackets/:region', requireAdmin, requirePerm('brackets'), (req, res) => {
  const region = req.params.region.toUpperCase();
  const season = req.query.season || 'S3';
  db.prepare(`
    INSERT INTO brackets (region, season, data, updated_at) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(region, season) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
  `).run(region, season, JSON.stringify(req.body));
  res.json({ ok: true });
});

app.delete('/api/brackets/season/:season', requireAdmin, requirePerm('brackets_delete'), (req, res) => {
  db.prepare('DELETE FROM brackets WHERE season = ?').run(req.params.season);
  res.json({ ok: true });
});

// ============================================================
// SCHEDULE
// ============================================================
app.get('/api/schedule', (req, res) => {
  const { region, season } = req.query;
  const conds = [], params = [];
  if (season) { conds.push('season = ?'); params.push(season); }
  if (region && region !== 'ALL') { conds.push('(region = ? OR region = ?)'); params.push(region, 'ALL'); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  res.json(db.prepare(`SELECT * FROM schedule${where} ORDER BY date ASC, time ASC`).all(...params));
});

app.post('/api/schedule', requireAdmin, requirePerm('schedule'), (req, res) => {
  const { date, time, match, region, round, status, season } = req.body;
  if (!date || !match) return res.status(400).json({ error: 'date and match required' });
  const r = db.prepare('INSERT INTO schedule (date,time,match,region,round,status,season) VALUES (?,?,?,?,?,?,?)').run(date, time||'', match, region||'ALL', round||'', status||'upcoming', season||'S3');
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/schedule/:id', requireAdmin, requirePerm('schedule'), (req, res) => {
  const { date, time, match, region, round, status, season } = req.body;
  db.prepare('UPDATE schedule SET date=?,time=?,match=?,region=?,round=?,status=?,season=? WHERE id=?').run(date, time||'', match, region||'ALL', round||'', status||'upcoming', season||'S3', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/schedule/:id', requireAdmin, requirePerm('schedule_delete'), (req, res) => {
  db.prepare('DELETE FROM schedule WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// RULES
// ============================================================
app.get('/api/rules/:page', (req, res) => {
  const row = db.prepare('SELECT content FROM rules WHERE page=?').get(req.params.page);
  res.json({ content: row ? row.content : '' });
});

app.put('/api/rules/:page', requireAdmin, requirePerm('all'), (req, res) => {
  const { content } = req.body;
  db.prepare(`
    INSERT INTO rules (page, content, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(page) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at
  `).run(req.params.page, content || '');
  res.json({ ok: true });
});

// ============================================================
// ORGS
// ============================================================
function computeOrgStats(tag) {
  const warWins  = db.prepare("SELECT COUNT(*) as c FROM war_logs WHERE winner = ?").get(tag).c;
  const warTotal = db.prepare("SELECT COUNT(*) as c FROM war_logs WHERE org1 = ? OR org2 = ?").get(tag, tag).c;
  const seaWins  = db.prepare("SELECT COUNT(*) as c FROM season_logs WHERE winner = ?").get(tag).c;
  const seaTotal = db.prepare("SELECT COUNT(*) as c FROM season_logs WHERE org1 = ? OR org2 = ?").get(tag, tag).c;
  // Custom points: ELO from war_logs + season log points
  const eloOrg1 = db.prepare("SELECT COALESCE(SUM(elo_org1),0) as s FROM war_logs WHERE org1 = ? AND elo_org1 IS NOT NULL").get(tag).s;
  const eloOrg2 = db.prepare("SELECT COALESCE(SUM(elo_org2),0) as s FROM war_logs WHERE org2 = ? AND elo_org2 IS NOT NULL").get(tag).s;
  const seaPtsWin  = db.prepare("SELECT COALESCE(SUM(points_winner),0) as s FROM season_logs WHERE winner = ?").get(tag).s;
  const seaPtsLose = db.prepare("SELECT COALESCE(SUM(points_loser),0) as s FROM season_logs WHERE (org1 = ? OR org2 = ?) AND winner != ?").get(tag, tag, tag).s;
  const points = eloOrg1 + eloOrg2 + seaPtsWin + seaPtsLose;
  return { wins: warWins + seaWins, losses: (warTotal - warWins) + (seaTotal - seaWins), wonEvents: seaWins, points };
}

function orgWithStats(o) {
  return { ...o, members: db.prepare('SELECT * FROM org_members WHERE org_id = ? ORDER BY id').all(o.id), ...computeOrgStats(o.tag) };
}

app.get('/api/orgs', (req, res) => {
  const { status, region } = req.query;
  const conds = [], params = [];
  if (status && status !== 'all') { conds.push('status = ?'); params.push(status); }
  if (region && region !== 'ALL') { conds.push('region = ?');  params.push(region); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  res.json(db.prepare(`SELECT * FROM orgs${where} ORDER BY name`).all(...params).map(orgWithStats));
});

app.get('/api/orgs/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM orgs WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json(orgWithStats(o));
});

app.post('/api/orgs', requireAdmin, requirePerm('orgs'), (req, res) => {
  const { tag, name, status, founded, region, icon, mvp, logo_url } = req.body;
  if (!tag || !name) return res.status(400).json({ error: 'tag and name required' });
  try {
    const r = db.prepare('INSERT INTO orgs (tag,name,status,founded,region,icon,mvp,logo_url) VALUES (?,?,?,?,?,?,?,?)').run(tag.toUpperCase(), name, status||'active', founded||'S1', region||'NA', icon||'', mvp||'', logo_url||'');
    res.json({ id: r.lastInsertRowid });
  } catch(e) { res.status(400).json({ error: 'Tag already exists' }); }
});

app.put('/api/orgs/:id', requireAdmin, requirePerm('orgs'), (req, res) => {
  const { tag, name, status, founded, region, icon, mvp, logo_url } = req.body;
  db.prepare('UPDATE orgs SET tag=?,name=?,status=?,founded=?,region=?,icon=?,mvp=?,logo_url=? WHERE id=?').run(tag.toUpperCase(), name, status||'active', founded||'S1', region||'NA', icon||'', mvp||'', logo_url||'', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/orgs/:id', requireAdmin, requirePerm('orgs_delete'), (req, res) => {
  db.prepare('DELETE FROM org_members WHERE org_id = ?').run(req.params.id);
  db.prepare('DELETE FROM orgs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/orgs/:id/members', requireAdmin, requirePerm('orgs'), (req, res) => {
  const { name, role, discord_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare('INSERT INTO org_members (org_id,name,role,discord_id) VALUES (?,?,?,?)').run(req.params.id, name, role||'Player', discord_id||'');
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/org-members/:id', requireAdmin, requirePerm('orgs_delete'), (req, res) => {
  db.prepare('DELETE FROM org_members WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// PLAYERS (leaderboard)
// ============================================================
app.get('/api/players', (_req, res) => {
  res.json(db.prepare('SELECT * FROM players ORDER BY elo DESC').all());
});

app.post('/api/players', requireAdmin, requirePerm('orgs'), (req, res) => {
  const { name, org, elo, wins, losses } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare('INSERT INTO players (name,org,elo,wins,losses) VALUES (?,?,?,?,?)').run(name, org||'', elo||1000, wins||0, losses||0);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/players/:id', requireAdmin, requirePerm('orgs'), (req, res) => {
  const { name, org, elo, wins, losses } = req.body;
  db.prepare('UPDATE players SET name=?,org=?,elo=?,wins=?,losses=? WHERE id=?').run(name, org||'', elo||1000, wins||0, losses||0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/players/:id', requireAdmin, requirePerm('orgs_delete'), (req, res) => {
  db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/players/elo-adjust', requireAdmin, requirePerm('orgs'), (req, res) => {
  const { name, delta, org, result } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const player = db.prepare('SELECT * FROM players WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (!player) return res.status(404).json({ error: `Player "${name}" not found on leaderboard` });
  const newElo    = (player.elo    || 1000) + (parseInt(delta) || 0);
  const newWins   = (player.wins   || 0)    + (result === 'win'  ? 1 : 0);
  const newLosses = (player.losses || 0)    + (result === 'loss' ? 1 : 0);
  const newOrg    = org || player.org || '';
  db.prepare('UPDATE players SET elo=?,wins=?,losses=?,org=? WHERE id=?').run(newElo, newWins, newLosses, newOrg, player.id);
  res.json({ id: player.id, name: player.name, elo: newElo, wins: newWins, losses: newLosses, org: newOrg });
});

// ============================================================
// ============================================================
// BOT API
// ============================================================
app.get('/api/bot/orgs', requireBotAuth, (req, res) => {
  const { q } = req.query;
  let orgs = db.prepare('SELECT * FROM orgs ORDER BY name').all().map(orgWithStats);
  if (q) { const ql = q.toLowerCase(); orgs = orgs.filter(o => o.name.toLowerCase().includes(ql) || o.tag.toLowerCase().includes(ql)); }
  res.json(orgs);
});

app.get('/api/bot/players', requireBotAuth, (req, res) => {
  const { q } = req.query;
  let players = db.prepare('SELECT * FROM players ORDER BY elo DESC').all();
  if (q) { const ql = q.toLowerCase(); players = players.filter(p => p.name.toLowerCase().includes(ql)); }
  res.json(players);
});

app.get('/api/bot/players/by-discord/:discord_id', requireBotAuth, (req, res) => {
  const p = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(req.params.discord_id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

app.post('/api/bot/players/wager-result', requireBotAuth, (req, res) => {
  const { discord_id, name, org, elo_delta, won } = req.body;
  if (!discord_id || !name) return res.status(400).json({ error: 'discord_id and name required' });
  const delta = parseInt(elo_delta) || 0;
  const existing = db.prepare("SELECT * FROM players WHERE discord_id = ?").get(discord_id);
  if (existing) {
    const newElo = (existing.elo || 0) + delta;
    const newWins = (existing.wins || 0) + (won ? 1 : 0);
    const newLosses = (existing.losses || 0) + (won ? 0 : 1);
    db.prepare("UPDATE players SET elo = ?, wins = ?, losses = ?, org = ?, name = ? WHERE discord_id = ?")
      .run(newElo, newWins, newLosses, org ?? existing.org ?? '', name, discord_id);
    res.json({ id: existing.id, elo: newElo, wins: newWins, losses: newLosses, created: false });
  } else {
    const startElo = delta;
    const r = db.prepare("INSERT INTO players (name, org, elo, wins, losses, discord_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(name, org || '', startElo, won ? 1 : 0, won ? 0 : 1, discord_id);
    res.json({ id: r.lastInsertRowid, elo: startElo, wins: won ? 1 : 0, losses: won ? 0 : 1, created: true });
  }
});

app.get('/api/bot/member/:discord_id', requireBotAuth, (req, res) => {
  const m = db.prepare('SELECT m.*, o.id as org_id, o.tag, o.name as org_name, o.discord_role_id, o.signing_open, o.region FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.discord_id = ?').get(req.params.discord_id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json(m);
});

app.post('/api/bot/sign', requireBotAuth, (req, res) => {
  const { org_id, discord_id, name, role } = req.body;
  if (!org_id || !discord_id || !name) return res.status(400).json({ error: 'org_id, discord_id, name required' });
  const existing = db.prepare('SELECT id FROM org_members WHERE discord_id = ?').get(discord_id);
  if (existing) return res.status(409).json({ error: 'Player already in a guild' });
  const r = db.prepare('INSERT INTO org_members (org_id,name,role,discord_id) VALUES (?,?,?,?)').run(org_id, name, role||'Player', discord_id);
  res.json({ id: r.lastInsertRowid });
});

app.post('/api/bot/release', requireBotAuth, (req, res) => {
  const { discord_id } = req.body;
  if (!discord_id) return res.status(400).json({ error: 'discord_id required' });
  const r = db.prepare('DELETE FROM org_members WHERE discord_id = ?').run(discord_id);
  res.json({ ok: true, removed: r.changes });
});

app.post('/api/bot/orgs', requireBotAuth, (req, res) => {
  const { tag, name, region, logo_url, founded } = req.body;
  if (!tag || !name) return res.status(400).json({ error: 'tag and name required' });
  try {
    const r = db.prepare('INSERT INTO orgs (tag,name,status,founded,region,icon,mvp,logo_url) VALUES (?,?,?,?,?,?,?,?)').run(tag.toUpperCase(), name, 'active', founded || 'S1', region||'NA', '', '', logo_url||'');
    res.json({ id: r.lastInsertRowid });
  } catch(e) { res.status(400).json({ error: 'Tag already exists' }); }
});

app.delete('/api/bot/orgs/:tag', requireBotAuth, (req, res) => {
  const o = db.prepare('SELECT * FROM orgs WHERE tag = ?').get(req.params.tag.toUpperCase());
  if (!o) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM org_members WHERE org_id = ?').run(o.id);
  db.prepare('DELETE FROM orgs WHERE id = ?').run(o.id);
  res.json({ ok: true });
});

app.put('/api/bot/orgs/:tag/signing', requireBotAuth, (req, res) => {
  db.prepare('UPDATE orgs SET signing_open = ? WHERE tag = ?').run(req.body.open ? 1 : 0, req.params.tag.toUpperCase());
  res.json({ ok: true });
});

app.put('/api/bot/orgs/:tag/role', requireBotAuth, (req, res) => {
  db.prepare('UPDATE orgs SET discord_role_id = ? WHERE tag = ?').run(req.body.discord_role_id||'', req.params.tag.toUpperCase());
  res.json({ ok: true });
});

app.put('/api/bot/orgs/:tag/founded', requireBotAuth, (req, res) => {
  const { founded } = req.body;
  if (!founded) return res.status(400).json({ error: 'founded required' });
  db.prepare('UPDATE orgs SET founded = ? WHERE tag = ?').run(founded, req.params.tag.toUpperCase());
  res.json({ ok: true });
});

// Site settings (ELO per kill/death)
app.get('/api/settings/stats', (req, res) => {
  const kill  = db.prepare("SELECT value FROM site_settings WHERE key='stat_elo_per_kill'").get()?.value ?? '2.5';
  const death = db.prepare("SELECT value FROM site_settings WHERE key='stat_elo_per_death'").get()?.value ?? '-2.5';
  res.json({ elo_per_kill: parseFloat(kill), elo_per_death: parseFloat(death) });
});
app.put('/api/settings/stats', requireAdmin, (req, res) => {
  const { elo_per_kill, elo_per_death } = req.body;
  if (elo_per_kill !== undefined) db.prepare("INSERT OR REPLACE INTO site_settings (key,value) VALUES ('stat_elo_per_kill',?)").run(String(elo_per_kill));
  if (elo_per_death !== undefined) db.prepare("INSERT OR REPLACE INTO site_settings (key,value) VALUES ('stat_elo_per_death',?)").run(String(elo_per_death));
  res.json({ ok: true });
});

// Bot wager log creation
app.post('/api/bot/logs/wager', requireBotAuth, (req, res) => {
  const { date, challenger, challenged, amount, winner, season, stats } = req.body;
  if (!date || !challenger || !challenged) return res.status(400).json({ error: 'date, challenger, challenged required' });
  const statsJson = Array.isArray(stats) && stats.length > 0 ? JSON.stringify(stats) : '';
  const r = db.prepare(
    'INSERT INTO wager_records (date,challenger,challenged,amount,winner,status,paid,season,notes,stats) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(date, challenger, challenged, amount||'', winner||'', 'settled', 1, season||'', '', statsJson);
  res.json({ id: r.lastInsertRowid });
});

app.post('/api/bot/logs/war', requireBotAuth, (req, res) => {
  const { date, org1, org2, score1, score2, winner, region, season, elo_org1, elo_org2, stats, mvp, notes } = req.body;
  if (!date || !org1 || !org2) return res.status(400).json({ error: 'date, org1, org2 required' });
  console.log(`[bot/logs/war] received org1=${org1} org2=${org2} statsIsArray=${Array.isArray(stats)} statsLen=${Array.isArray(stats)?stats.length:'N/A'}`);
  const statsJson = Array.isArray(stats) && stats.length > 0 ? JSON.stringify(stats) : '';
  console.log(`[bot/logs/war] statsJson length=${statsJson.length}`);
  const r = db.prepare(
    'INSERT INTO war_logs (date,org1,org2,score1,score2,winner,wager,region,season,notes,elo_org1,elo_org2,stats,mvp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(date, org1.toUpperCase(), org2.toUpperCase(), score1||0, score2||0, winner||'', '', region||'NA', season||'', notes||'', elo_org1??null, elo_org2??null, statsJson, mvp||'');
  const stored = db.prepare('SELECT stats FROM war_logs WHERE id=?').get(r.lastInsertRowid);
  const storedLen = stored?.stats?.length ?? 0;
  console.log(`[bot/logs/war] inserted id=${r.lastInsertRowid} storedStats length=${storedLen}`);
  if (Array.isArray(stats) && stats.length) {
    syncWarStatsToPlayerLB(stats, winner || '', org1.toUpperCase(), org2.toUpperCase(), elo_org1, elo_org2);
    db.prepare('UPDATE war_logs SET stats_synced=1 WHERE id=?').run(r.lastInsertRowid);
    console.log(`[bot/logs/war] synced ${stats.length} player(s) to Player-LB`);
  }
  res.json({ id: r.lastInsertRowid, stats_stored: storedLen > 0 });
});

// ============================================================
// SERVE FRONTEND
// ============================================================
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  ██╗   ██╗██╗   ██╗██╗     ███████╗ █████╗  ██████╗ ██╗   ██╗███████╗`);
  console.log(`  ██║   ██║██║   ██║██║     ██╔════╝██╔══██╗██╔════╝ ██║   ██║██╔════╝`);
  console.log(`  ██║   ██║██║   ██║██║     █████╗  ███████║██║  ███╗██║   ██║█████╗  `);
  console.log(`  ╚██╗ ██╔╝╚██╗ ██╔╝██║     ██╔══╝  ██╔══██║██║   ██║██║   ██║██╔══╝  `);
  console.log(`   ╚████╔╝  ╚████╔╝ ███████╗███████╗██║  ██║╚██████╔╝╚██████╔╝███████╗`);
  console.log(`    ╚═══╝    ╚═══╝  ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝\n`);
  console.log(`  Server running at  →  http://localhost:${PORT}`);
  console.log(`  Database           →  ${DB_PATH}\n`);
});
