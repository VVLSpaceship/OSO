import { EmbedBuilder } from 'discord.js';
const ROLE_LABELS = {
    CO_LEADER: 'Co-Leader',
    MANAGER: 'Manager Guild',
    MAIN: 'Main Roster',
    SUB: 'Sub Roster',
};
const ROLE_LIMITS = {
    CO_LEADER: 1,
    MANAGER: 2,
    MAIN: 5,
    SUB: 5,
};
export function setupDatabase(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS Guilds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      leaderId TEXT NOT NULL,
      coLeaderId TEXT,
      imageUrl TEXT,
      panelMessageId TEXT,
      panelChannelId TEXT,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      region TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guildId) REFERENCES Guilds(id),
      UNIQUE(guildId, userId)
    );

    CREATE TABLE IF NOT EXISTS MainRosters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guildId) REFERENCES Guilds(id),
      UNIQUE(guildId, userId)
    );

    CREATE TABLE IF NOT EXISTS SubRosters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guildId) REFERENCES Guilds(id),
      UNIQUE(guildId, userId)
    );

    CREATE TABLE IF NOT EXISTS Invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      targetUserId TEXT NOT NULL,
      roleType TEXT NOT NULL CHECK(roleType IN ('CO_LEADER', 'MANAGER', 'MAIN', 'SUB')),
      inviterId TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      FOREIGN KEY (guildId) REFERENCES Guilds(id)
    );

    CREATE TABLE IF NOT EXISTS Wars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openerGuildId TEXT NOT NULL,
      opponentGuildId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'FINISHED', 'DODGED')),
      createdByUserId TEXT NOT NULL,
      acceptedByUserId TEXT,
      acceptedByGuildId TEXT,
      resultGuildId TEXT,
      winnerScore INTEGER,
      loserScore INTEGER,
      clipsLink TEXT,
      panelMessageId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      closedAt DATETIME,
      FOREIGN KEY (openerGuildId) REFERENCES Guilds(id),
      FOREIGN KEY (opponentGuildId) REFERENCES Guilds(id)
    );

    CREATE TABLE IF NOT EXISTS Wagers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('1V1', '2V2')),
      channelId TEXT NOT NULL,
      challenger1Id TEXT NOT NULL,
      challenger2Id TEXT,
      challenged1Id TEXT NOT NULL,
      challenged2Id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'DODGED', 'CLOSED')),
      acceptedByUserIds TEXT NOT NULL DEFAULT '[]',
      dodgedByUserId TEXT,
      panelMessageId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      closedAt DATETIME
    );
  `);
    ensureInviteColumns(db);
    ensureGuildColumns(db);
    ensureWarColumns(db);
    ensureWagerColumns(db);
    ensurePlayerEloTable(db);
    setupBotTables(db);
}
function setupBotTables(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS signing_requests (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      org_tag          TEXT NOT NULL,
      org_id           INTEGER NOT NULL,
      inviter_discord_id TEXT NOT NULL,
      target_discord_id  TEXT NOT NULL,
      target_name      TEXT NOT NULL,
      role             TEXT NOT NULL DEFAULT 'Player',
      status           TEXT NOT NULL DEFAULT 'PENDING_PLAYER',
      log_message_id   TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cooldowns (
      discord_id   TEXT PRIMARY KEY,
      released_at  TEXT NOT NULL,
      guild_name   TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS wager_amount_collection (
      wager_id             INTEGER PRIMARY KEY,
      channel_id           TEXT NOT NULL,
      challenger1_id       TEXT NOT NULL,
      challenger2_id       TEXT,
      challenged1_id       TEXT NOT NULL,
      challenged2_id       TEXT,
      amount               TEXT,
      confirm_msg_id       TEXT,
      team1_confirmed      INTEGER NOT NULL DEFAULT 0,
      team2_confirmed      INTEGER NOT NULL DEFAULT 0,
      awaiting             INTEGER NOT NULL DEFAULT 1,
      rules_type           TEXT,
      ban_content          TEXT,
      ban_confirm_msg_id   TEXT,
      ban_team1_confirmed  INTEGER NOT NULL DEFAULT 0,
      ban_team2_confirmed  INTEGER NOT NULL DEFAULT 0,
      ban_awaiting         INTEGER NOT NULL DEFAULT 0,
      rules_vote_team1     TEXT,
      rules_vote_team2     TEXT
    );
    CREATE TABLE IF NOT EXISTS war_player_collection (
      war_id          INTEGER PRIMARY KEY,
      guild1_id       TEXT NOT NULL,
      guild2_id       TEXT NOT NULL,
      guild1_players  TEXT NOT NULL DEFAULT '[]',
      guild2_players  TEXT NOT NULL DEFAULT '[]',
      step            INTEGER NOT NULL DEFAULT 1,
      step1_msg_id    TEXT,
      step2_msg_id    TEXT
    );
    CREATE TABLE IF NOT EXISTS guild_dodge_history (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id             TEXT NOT NULL,
      guild_name           TEXT NOT NULL DEFAULT '',
      dodged_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
      grace_until          DATETIME NOT NULL,
      elo_penalty_applied  INTEGER NOT NULL DEFAULT 0
    );
  `);
    // Migration: add guild_name to existing cooldowns tables that pre-date this column
    try { db.exec("ALTER TABLE cooldowns ADD COLUMN guild_name TEXT NOT NULL DEFAULT ''"); } catch (_) {}
    // Migrations: add ban-related columns to existing wager_amount_collection rows
    try { db.exec("ALTER TABLE wager_amount_collection ADD COLUMN rules_type TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE wager_amount_collection ADD COLUMN ban_content TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE wager_amount_collection ADD COLUMN ban_confirm_msg_id TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE wager_amount_collection ADD COLUMN ban_team1_confirmed INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE wager_amount_collection ADD COLUMN ban_team2_confirmed INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE wager_amount_collection ADD COLUMN ban_awaiting INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE wager_amount_collection ADD COLUMN rules_vote_team1 TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE wager_amount_collection ADD COLUMN rules_vote_team2 TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE war_player_collection ADD COLUMN step1_msg_id TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE war_player_collection ADD COLUMN step2_msg_id TEXT"); } catch (_) {}
    // Signing cooldown notifications
    try { db.exec("ALTER TABLE cooldowns ADD COLUMN notify_at TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE cooldowns ADD COLUMN notify_sent INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
    // Dodge grace period notifications
    try { db.exec("ALTER TABLE guild_dodge_history ADD COLUMN notify_sent INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
    // Dodge history: leader + opponent info
    try { db.exec("ALTER TABLE guild_dodge_history ADD COLUMN leader_id TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE guild_dodge_history ADD COLUMN opponent_guild_id TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE guild_dodge_history ADD COLUMN opponent_guild_name TEXT"); } catch (_) {}
}
export function initPlayerCollection(db, warId, guild1Id, guild2Id) {
    db.prepare('INSERT OR REPLACE INTO war_player_collection (war_id, guild1_id, guild2_id, guild1_players, guild2_players, step) VALUES (?, ?, ?, ?, ?, ?)').run(warId, guild1Id, guild2Id, '[]', '[]', 1);
}
export function getPlayerCollection(db, warId) {
    return db.prepare('SELECT * FROM war_player_collection WHERE war_id = ?').get(warId) || null;
}
export function setCollectionPlayers(db, warId, step, players) {
    const col = step === 1 ? 'guild1_players' : 'guild2_players';
    const nextStep = step === 1 ? 2 : 3;
    db.prepare(`UPDATE war_player_collection SET ${col} = ?, step = ? WHERE war_id = ?`).run(JSON.stringify(players), nextStep, warId);
}
export function initWagerAmountCollection(db, wagerId, channelId, challenger1Id, challenger2Id, challenged1Id, challenged2Id) {
    db.prepare(`INSERT OR REPLACE INTO wager_amount_collection
        (wager_id, channel_id, challenger1_id, challenger2_id, challenged1_id, challenged2_id, amount, confirm_msg_id, team1_confirmed, team2_confirmed, awaiting)
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, 1)`)
        .run(wagerId, channelId, challenger1Id, challenger2Id || null, challenged1Id, challenged2Id || null);
}
export function getWagerAmountCollection(db, wagerId) {
    return db.prepare('SELECT * FROM wager_amount_collection WHERE wager_id = ?').get(wagerId) || null;
}
export function getWagerAmountCollectionByChannel(db, channelId) {
    return db.prepare("SELECT * FROM wager_amount_collection WHERE channel_id = ? AND awaiting = 1").get(channelId) || null;
}
export function setWagerAmount(db, wagerId, amount, confirmMsgId) {
    db.prepare('UPDATE wager_amount_collection SET amount = ?, confirm_msg_id = ?, awaiting = 0 WHERE wager_id = ?').run(amount, confirmMsgId, wagerId);
}
export function resetWagerAmount(db, wagerId) {
    db.prepare('UPDATE wager_amount_collection SET amount = NULL, confirm_msg_id = NULL, team1_confirmed = 0, team2_confirmed = 0, awaiting = 1 WHERE wager_id = ?').run(wagerId);
}
export function confirmWagerTeam(db, wagerId, team) {
    const col = team === 1 ? 'team1_confirmed' : 'team2_confirmed';
    db.prepare(`UPDATE wager_amount_collection SET ${col} = 1 WHERE wager_id = ?`).run(wagerId);
    return db.prepare('SELECT team1_confirmed, team2_confirmed FROM wager_amount_collection WHERE wager_id = ?').get(wagerId);
}
export function setWagerRules(db, wagerId, rulesType) {
    db.prepare('UPDATE wager_amount_collection SET rules_type = ? WHERE wager_id = ?').run(rulesType, wagerId);
}
export function getWagerCollectionByChannelForBan(db, channelId) {
    return db.prepare("SELECT * FROM wager_amount_collection WHERE channel_id = ? AND ban_awaiting = 1").get(channelId) || null;
}
export function setWagerBan(db, wagerId, banContent, banConfirmMsgId) {
    db.prepare('UPDATE wager_amount_collection SET ban_content = ?, ban_confirm_msg_id = ?, ban_awaiting = 0 WHERE wager_id = ?').run(banContent, banConfirmMsgId, wagerId);
}
export function resetWagerBan(db, wagerId) {
    db.prepare('UPDATE wager_amount_collection SET ban_content = NULL, ban_confirm_msg_id = NULL, ban_team1_confirmed = 0, ban_team2_confirmed = 0, ban_awaiting = 1 WHERE wager_id = ?').run(wagerId);
}
export function startWagerBanCollection(db, wagerId) {
    db.prepare('UPDATE wager_amount_collection SET ban_awaiting = 1, ban_content = NULL, ban_confirm_msg_id = NULL, ban_team1_confirmed = 0, ban_team2_confirmed = 0 WHERE wager_id = ?').run(wagerId);
}
export function confirmWagerBanTeam(db, wagerId, team) {
    const col = team === 1 ? 'ban_team1_confirmed' : 'ban_team2_confirmed';
    db.prepare(`UPDATE wager_amount_collection SET ${col} = 1 WHERE wager_id = ?`).run(wagerId);
    return db.prepare('SELECT ban_team1_confirmed, ban_team2_confirmed FROM wager_amount_collection WHERE wager_id = ?').get(wagerId);
}
export function recordRulesVote(db, wagerId, team, vote) {
    const col = team === 1 ? 'rules_vote_team1' : 'rules_vote_team2';
    db.prepare(`UPDATE wager_amount_collection SET ${col} = ? WHERE wager_id = ?`).run(vote, wagerId);
    return db.prepare('SELECT rules_vote_team1, rules_vote_team2 FROM wager_amount_collection WHERE wager_id = ?').get(wagerId);
}
export function setPlayerCollectionMsgId(db, warId, step, msgId) {
    const col = step === 1 ? 'step1_msg_id' : 'step2_msg_id';
    db.prepare(`UPDATE war_player_collection SET ${col} = ? WHERE war_id = ?`).run(msgId, warId);
}
export function getSetting(db, key) {
    return db.prepare('SELECT value FROM bot_settings WHERE key = ?').get(key)?.value || '';
}
export function setSetting(db, key, value) {
    db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)').run(key, value);
}
export function getSigningRequest(db, id) {
    return db.prepare('SELECT * FROM signing_requests WHERE id = ?').get(id) || null;
}
export function createSigningRequest(db, data) {
    const r = db.prepare(`INSERT INTO signing_requests (org_tag,org_id,inviter_discord_id,target_discord_id,target_name,role) VALUES (?,?,?,?,?,?)`)
        .run(data.org_tag, data.org_id, data.inviter_discord_id, data.target_discord_id, data.target_name, data.role);
    return Number(r.lastInsertRowid);
}
export function updateSigningStatus(db, id, status, logMessageId) {
    if (logMessageId) {
        db.prepare('UPDATE signing_requests SET status=?, log_message_id=? WHERE id=?').run(status, logMessageId, id);
    }
    else {
        db.prepare('UPDATE signing_requests SET status=? WHERE id=?').run(status, id);
    }
}
export function getCooldownMultiplier(unit) {
    if (unit === 'minutes') return 60 * 1000;
    if (unit === 'hours') return 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000; // days (default)
}
export function getCooldown(db, discordId) {
    const row = db.prepare('SELECT released_at, guild_name FROM cooldowns WHERE discord_id = ?').get(discordId);
    return row ? { releasedAt: new Date(row.released_at), guildName: row.guild_name || '' } : null;
}
export function isOnCooldown(db, discordId, cooldownDays, unit = 'days') {
    if (!cooldownDays || cooldownDays <= 0) return false;
    const cd = getCooldown(db, discordId);
    if (!cd) return false;
    const expiresAt = new Date(cd.releasedAt.getTime() + cooldownDays * getCooldownMultiplier(unit));
    return new Date() < expiresAt;
}
export function setCooldown(db, discordId, guildName = '', notifyAt = null) {
    db.prepare('INSERT OR REPLACE INTO cooldowns (discord_id, released_at, guild_name, notify_at, notify_sent) VALUES (?, ?, ?, ?, 0)')
        .run(discordId, new Date().toISOString(), guildName, notifyAt);
}
export function clearCooldown(db, discordId) {
    db.prepare('DELETE FROM cooldowns WHERE discord_id = ?').run(discordId);
}
export function getAllCooldowns(db) {
    return db.prepare('SELECT discord_id, released_at, guild_name FROM cooldowns').all();
}
function ensureInviteColumns(db) {
    const columns = db.prepare('PRAGMA table_info(Invites)').all();
    const existing = new Set(columns.map((c) => c.name));
    if (!existing.has('inviterId')) {
        db.exec('ALTER TABLE Invites ADD COLUMN inviterId TEXT');
    }
    if (!existing.has('temp_channel_id')) {
        db.exec('ALTER TABLE Invites ADD COLUMN temp_channel_id TEXT');
    }
    if (!existing.has('admin_processed')) {
        db.exec('ALTER TABLE Invites ADD COLUMN admin_processed INTEGER NOT NULL DEFAULT 0');
    }
}
function ensureGuildColumns(db) {
    const columns = db.prepare('PRAGMA table_info(Guilds)').all();
    const existing = new Set(columns.map((c) => c.name));
    if (!existing.has('wins')) {
        db.exec('ALTER TABLE Guilds ADD COLUMN wins INTEGER NOT NULL DEFAULT 0');
    }
    if (!existing.has('losses')) {
        db.exec('ALTER TABLE Guilds ADD COLUMN losses INTEGER NOT NULL DEFAULT 0');
    }
    if (!existing.has('elo')) {
        db.exec('ALTER TABLE Guilds ADD COLUMN elo INTEGER NOT NULL DEFAULT 0');
    }
    if (!existing.has('tag')) {
        db.exec('ALTER TABLE Guilds ADD COLUMN tag TEXT');
    }
    if (!existing.has('site_org_id')) {
        db.exec('ALTER TABLE Guilds ADD COLUMN site_org_id INTEGER');
    }
}
function ensureWarColumns(db) {
    const columns = db.prepare('PRAGMA table_info(Wars)').all();
    const existing = new Set(columns.map((c) => c.name));
    if (!existing.has('winnerScore')) {
        db.exec('ALTER TABLE Wars ADD COLUMN winnerScore INTEGER');
    }
    if (!existing.has('loserScore')) {
        db.exec('ALTER TABLE Wars ADD COLUMN loserScore INTEGER');
    }
    if (!existing.has('clipsLink')) {
        db.exec('ALTER TABLE Wars ADD COLUMN clipsLink TEXT');
    }
    if (!existing.has('expiresAt')) {
        db.exec('ALTER TABLE Wars ADD COLUMN expiresAt DATETIME');
    }
    if (!existing.has('winnerEloChange')) {
        db.exec('ALTER TABLE Wars ADD COLUMN winnerEloChange INTEGER');
    }
    if (!existing.has('loserEloChange')) {
        db.exec('ALTER TABLE Wars ADD COLUMN loserEloChange INTEGER');
    }
}
function ensureWagerColumns(db) {
    const columns = db.prepare('PRAGMA table_info(Wagers)').all();
    if (!columns.length)
        return;
    const existing = new Set(columns.map((c) => c.name));
    if (!existing.has('acceptedByUserIds')) {
        db.exec("ALTER TABLE Wagers ADD COLUMN acceptedByUserIds TEXT NOT NULL DEFAULT '[]'");
    }
    if (!existing.has('dodgedByUserId')) {
        db.exec('ALTER TABLE Wagers ADD COLUMN dodgedByUserId TEXT');
    }
    if (!existing.has('panelMessageId')) {
        db.exec('ALTER TABLE Wagers ADD COLUMN panelMessageId TEXT');
    }
    if (!existing.has('expiresAt')) {
        db.exec('ALTER TABLE Wagers ADD COLUMN expiresAt DATETIME');
    }
    if (!existing.has('winnerEloChange')) {
        db.exec('ALTER TABLE Wagers ADD COLUMN winnerEloChange INTEGER');
    }
    if (!existing.has('loserEloChange')) {
        db.exec('ALTER TABLE Wagers ADD COLUMN loserEloChange INTEGER');
    }
}
function ensurePlayerEloTable(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS PlayerElo (
      userId TEXT PRIMARY KEY,
      elo    INTEGER NOT NULL DEFAULT 1000
    );
  `);
}
export function getRoleLabel(roleType) {
    return ROLE_LABELS[roleType];
}
export function getRoleLimit(roleType) {
    return ROLE_LIMITS[roleType];
}
export function getGuildByLeaderId(db, leaderId) {
    return db.prepare('SELECT * FROM Guilds WHERE leaderId = ?').get(leaderId) || null;
}
export function getGuildById(db, guildId) {
    return db.prepare('SELECT * FROM Guilds WHERE id = ?').get(guildId) || null;
}
export function getRoleMemberCount(db, guildId, roleType) {
    if (roleType === 'CO_LEADER') {
        const guild = getGuildById(db, guildId);
        return guild?.coLeaderId ? 1 : 0;
    }
    if (roleType === 'MANAGER') {
        return db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(guildId)?.count || 0;
    }
    if (roleType === 'MAIN') {
        return db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(guildId)?.count || 0;
    }
    return db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(guildId)?.count || 0;
}
export function isUserInRole(db, guildId, userId, roleType) {
    if (roleType === 'CO_LEADER') {
        const guild = getGuildById(db, guildId);
        return guild?.coLeaderId === userId;
    }
    if (roleType === 'MANAGER') {
        return !!db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guildId, userId);
    }
    if (roleType === 'MAIN') {
        return !!db.prepare('SELECT 1 FROM MainRosters WHERE guildId = ? AND userId = ?').get(guildId, userId);
    }
    return !!db.prepare('SELECT 1 FROM SubRosters WHERE guildId = ? AND userId = ?').get(guildId, userId);
}
export function canAddUserToRole(db, guildId, roleType) {
    return getRoleMemberCount(db, guildId, roleType) < getRoleLimit(roleType);
}
export function addMemberToRole(db, guildId, userId, roleType) {
    if (!canAddUserToRole(db, guildId, roleType))
        return false;
    if (isUserInRole(db, guildId, userId, roleType))
        return false;
    if (roleType === 'CO_LEADER') {
        db.prepare('UPDATE Guilds SET coLeaderId = ? WHERE id = ?').run(userId, guildId);
        return true;
    }
    if (roleType === 'MANAGER') {
        db.prepare('INSERT OR IGNORE INTO Managers (guildId, userId) VALUES (?, ?)').run(guildId, userId);
        return true;
    }
    if (roleType === 'MAIN') {
        db.prepare('INSERT OR IGNORE INTO MainRosters (guildId, userId) VALUES (?, ?)').run(guildId, userId);
        return true;
    }
    db.prepare('INSERT OR IGNORE INTO SubRosters (guildId, userId) VALUES (?, ?)').run(guildId, userId);
    return true;
}
export function removeMemberFromRole(db, guildId, userId, roleType) {
    if (roleType === 'CO_LEADER') {
        const guild = getGuildById(db, guildId);
        if (!guild?.coLeaderId || guild.coLeaderId !== userId)
            return false;
        db.prepare('UPDATE Guilds SET coLeaderId = NULL WHERE id = ?').run(guildId);
        return true;
    }
    if (roleType === 'MANAGER') {
        const result = db.prepare('DELETE FROM Managers WHERE guildId = ? AND userId = ?').run(guildId, userId);
        return result.changes > 0;
    }
    if (roleType === 'MAIN') {
        const result = db.prepare('DELETE FROM MainRosters WHERE guildId = ? AND userId = ?').run(guildId, userId);
        return result.changes > 0;
    }
    const result = db.prepare('DELETE FROM SubRosters WHERE guildId = ? AND userId = ?').run(guildId, userId);
    return result.changes > 0;
}
export function getMembersByRole(db, guildId, roleType) {
    if (roleType === 'CO_LEADER') {
        const guild = getGuildById(db, guildId);
        return guild?.coLeaderId ? [guild.coLeaderId] : [];
    }
    if (roleType === 'MANAGER') {
        return db.prepare('SELECT userId FROM Managers WHERE guildId = ? ORDER BY createdAt ASC').all(guildId).map((row) => row.userId);
    }
    if (roleType === 'MAIN') {
        return db.prepare('SELECT userId FROM MainRosters WHERE guildId = ? ORDER BY createdAt ASC').all(guildId).map((row) => row.userId);
    }
    return db.prepare('SELECT userId FROM SubRosters WHERE guildId = ? ORDER BY createdAt ASC').all(guildId).map((row) => row.userId);
}
export function createInvite(db, guildId, targetUserId, roleType, inviterId, expiresAt) {
    const result = db
        .prepare(`INSERT INTO Invites (guildId, targetUserId, roleType, inviterId, status, expiresAt)
       VALUES (?, ?, ?, ?, 'PENDING', ?)`)
        .run(guildId, targetUserId, roleType, inviterId, expiresAt);
    return Number(result.lastInsertRowid);
}
export function getInviteById(db, inviteId) {
    return db.prepare('SELECT * FROM Invites WHERE id = ?').get(inviteId) || null;
}
export function getPendingInviteForTarget(db, guildId, targetUserId, roleType) {
    db.prepare(`UPDATE Invites
      SET status = 'DECLINED'
      WHERE guildId = ?
        AND targetUserId = ?
        AND roleType = ?
        AND status = 'PENDING'
        AND expiresAt IS NOT NULL
        AND datetime(expiresAt) <= datetime('now')`).run(guildId, targetUserId, roleType);
    return (db
        .prepare(`SELECT * FROM Invites
         WHERE guildId = ?
           AND targetUserId = ?
           AND roleType = ?
           AND status = 'PENDING'
           AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
         ORDER BY createdAt DESC
         LIMIT 1`)
        .get(guildId, targetUserId, roleType) || null);
}
export function setInviteStatus(db, inviteId, status) {
    db.prepare('UPDATE Invites SET status = ? WHERE id = ?').run(status, inviteId);
}
export function setInviteAdminProcessed(db, inviteId) {
    db.prepare('UPDATE Invites SET admin_processed = 1 WHERE id = ?').run(inviteId);
}
function isInviteExpired(invite) {
    if (!invite?.expiresAt)
        return false;
    return Date.now() > new Date(invite.expiresAt).getTime();
}
export function validateInviteForAction(db, inviteId) {
    const invite = getInviteById(db, inviteId);
    if (!invite)
        return { invite: null, reason: 'Invitation not found.' };
    if (invite.status !== 'PENDING')
        return { invite: null, reason: 'This invitation has already been finalized.' };
    if (isInviteExpired(invite)) {
        setInviteStatus(db, inviteId, 'DECLINED');
        return { invite: null, reason: 'This invitation has expired.' };
    }
    return { invite };
}
export function formatGuildPanelDescription(db, guildId) {
    const guild = db.prepare('SELECT * FROM Guilds WHERE id = ?').get(guildId);
    if (!guild)
        return 'Guild not found.';
    const managers = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId);
    const mains = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId);
    const subs = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId);
    let description = `# ${guild.name}\n\n`;
    description += `### 👑 Leader\n<@${guild.leaderId}>\n`;
    description += `### ⭐ Co-Leader\n${guild.coLeaderId ? `<@${guild.coLeaderId}>` : 'None'}\n`;
    description += `**Managers**\n`;
    description += managers.length > 0 ? `${managers.map((m) => `<@${m.userId}>`).join(' ')}\n\n` : 'None\n\n';
    description += `:globe_with_meridians: **Region Stats: ${guild.region}**\n`;
    description += `**Regions:** ${guild.region}\n`;
    description += `:signal_strength: **W/L:** ${guild.wins || 0}/${guild.losses || 0}\n`;
    description += `:bar_chart: **ELO:** ${guild.elo ?? 0}\n`;
    description += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    description += `:crossed_swords: **Main Roster (${guild.region})**\n`;
    description += mains.length > 0 ? `${mains.map((m) => `<@${m.userId}>`).join('\n')}\n\n` : 'None\n\n';
    description += `:dagger: **Sub Roster (${guild.region})**\n`;
    description += subs.length > 0 ? subs.map((s) => `<@${s.userId}>`).join('\n') : 'None';
    return description;
}
export function buildGuildPanelEmbed(db, guildId, thumbnailUrl = null) {
    return new EmbedBuilder()
        .setDescription(formatGuildPanelDescription(db, guildId))
        .setColor(0x5BADFF)
        .setThumbnail(thumbnailUrl);
}
async function tryEditPanelMessage(thread, panelMessageId, embed) {
    const message = await thread.messages.fetch(panelMessageId).catch(() => null);
    if (message) {
        await message.edit({ embeds: [embed] });
        return true;
    }
    if (panelMessageId === thread.id) {
        const starter = await thread.fetchStarterMessage().catch(() => null);
        if (starter) {
            await starter.edit({ embeds: [embed] });
            return true;
        }
    }
    return false;
}
export async function refreshGuildPanel(client, db, guildId) {
    const guild = getGuildById(db, guildId);
    if (!guild?.panelChannelId || !guild?.panelMessageId)
        return false;
    const discordGuild = await client.guilds.fetch(guild.id.split('-')[0]).catch(() => null);
    const embed = buildGuildPanelEmbed(db, guildId, discordGuild?.iconURL() || null);
    const panelChannel = await client.channels.fetch(guild.panelChannelId).catch(() => null);
    if (panelChannel?.isThread()) {
        return tryEditPanelMessage(panelChannel, guild.panelMessageId, embed);
    }
    const maybeThread = await client.channels.fetch(guild.panelMessageId).catch(() => null);
    if (maybeThread?.isThread()) {
        return tryEditPanelMessage(maybeThread, guild.panelMessageId, embed);
    }
    return false;
}
export function createWar(db, openerGuildId, opponentGuildId, channelId, createdByUserId, panelMessageId) {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days from now
    const result = db
        .prepare(`INSERT INTO Wars (openerGuildId, opponentGuildId, channelId, createdByUserId, panelMessageId, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`)
        .run(openerGuildId, opponentGuildId, channelId, createdByUserId, panelMessageId, expiresAt);
    return Number(result.lastInsertRowid);
}
export function createWager(db, type, channelId, challenger1Id, challenger2Id, challenged1Id, challenged2Id, panelMessageId) {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days from now
    const result = db
        .prepare(`INSERT INTO Wagers (type, channelId, challenger1Id, challenger2Id, challenged1Id, challenged2Id, panelMessageId, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(type, channelId, challenger1Id, challenger2Id, challenged1Id, challenged2Id, panelMessageId, expiresAt);
    return Number(result.lastInsertRowid);
}
export function getWagerById(db, wagerId) {
    return db.prepare('SELECT * FROM Wagers WHERE id = ?').get(wagerId) || null;
}
export function getActiveWagerForUser(db, userId) {
    return db.prepare(`SELECT * FROM Wagers WHERE status IN ('PENDING','ACCEPTED') AND (challenger1Id = ? OR challenger2Id = ? OR challenged1Id = ? OR challenged2Id = ?) LIMIT 1`).get(userId, userId, userId, userId) || null;
}
export function getWagerByChannelId(db, channelId) {
    return db.prepare('SELECT * FROM Wagers WHERE channelId = ? ORDER BY id DESC LIMIT 1').get(channelId) || null;
}
export function recordWagerAcceptance(db, wagerId, userId) {
    const wager = getWagerById(db, wagerId);
    if (!wager)
        return [];
    let accepted = [];
    try {
        accepted = JSON.parse(wager.acceptedByUserIds || '[]');
        if (!Array.isArray(accepted))
            accepted = [];
    }
    catch {
        accepted = [];
    }
    if (!accepted.includes(userId))
        accepted.push(userId);
    db.prepare('UPDATE Wagers SET acceptedByUserIds = ? WHERE id = ?').run(JSON.stringify(accepted), wagerId);
    return accepted;
}
export function markWagerAccepted(db, wagerId) {
    db.prepare(`UPDATE Wagers
     SET status = 'ACCEPTED'
     WHERE id = ? AND status = 'PENDING'`).run(wagerId);
}
export function dodgeWager(db, wagerId, dodgedByUserId) {
    db.prepare(`UPDATE Wagers
     SET status = 'DODGED', dodgedByUserId = ?, closedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')`).run(dodgedByUserId, wagerId);
}
export function closeWager(db, wagerId) {
    db.prepare(`UPDATE Wagers
     SET status = 'CLOSED', closedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')`).run(wagerId);
}
export function getWarById(db, warId) {
    return db.prepare('SELECT * FROM Wars WHERE id = ?').get(warId) || null;
}
export function getWarByChannelId(db, channelId) {
    return db.prepare('SELECT * FROM Wars WHERE channelId = ? ORDER BY id DESC LIMIT 1').get(channelId) || null;
}
export function acceptWar(db, warId, acceptedByUserId, acceptedByGuildId) {
    db.prepare(`UPDATE Wars
     SET status = 'ACCEPTED', acceptedByUserId = ?, acceptedByGuildId = ?
     WHERE id = ? AND status = 'PENDING'`).run(acceptedByUserId, acceptedByGuildId, warId);
}
export function finishWar(db, warId, resultGuildId, winnerScore, loserScore, clipsLink = null) {
    db.prepare(`UPDATE Wars
     SET status = 'FINISHED', resultGuildId = ?, winnerScore = ?, loserScore = ?, clipsLink = ?, closedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')`).run(resultGuildId, winnerScore, loserScore, clipsLink, warId);
}
export function dodgeWar(db, warId) {
    db.prepare(`UPDATE Wars
     SET status = 'DODGED', closedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')`).run(warId);
}
export function addGuildWin(db, guildId) {
    db.prepare('UPDATE Guilds SET wins = COALESCE(wins, 0) + 1 WHERE id = ?').run(guildId);
}
export function addGuildLoss(db, guildId) {
    db.prepare('UPDATE Guilds SET losses = COALESCE(losses, 0) + 1 WHERE id = ?').run(guildId);
}
export function applyGuildElo(db, winnerGuildId, winnerGain, loserGuildId, loserLoss, warId) {
    db.prepare('UPDATE Guilds SET elo = COALESCE(elo, 0) + ? WHERE id = ?').run(winnerGain, winnerGuildId);
    db.prepare('UPDATE Guilds SET elo = COALESCE(elo, 0) - ? WHERE id = ?').run(loserLoss, loserGuildId);
    if (warId != null) {
        db.prepare('UPDATE Wars SET winnerEloChange = ?, loserEloChange = ? WHERE id = ?').run(winnerGain, loserLoss, warId);
    }
}
export function getPlayerElo(db, userId) {
    const row = db.prepare('SELECT elo FROM PlayerElo WHERE userId = ?').get(userId);
    if (!row) {
        db.prepare('INSERT OR IGNORE INTO PlayerElo (userId, elo) VALUES (?, 1000)').run(userId);
        return 1000;
    }
    return row.elo;
}
export function applyPlayerElo(db, winnerIds, winnerGain, loserIds, loserLoss, wagerId) {
    for (const uid of winnerIds) {
        db.prepare('INSERT INTO PlayerElo (userId, elo) VALUES (?, 1000) ON CONFLICT(userId) DO UPDATE SET elo = MAX(0, elo + ?)').run(uid, winnerGain);
    }
    for (const uid of loserIds) {
        db.prepare('INSERT INTO PlayerElo (userId, elo) VALUES (?, 1000) ON CONFLICT(userId) DO UPDATE SET elo = MAX(0, elo - ?)').run(uid, loserLoss);
    }
    if (wagerId != null) {
        db.prepare('UPDATE Wagers SET winnerEloChange = ?, loserEloChange = ? WHERE id = ?').run(winnerGain, loserLoss, wagerId);
    }
}
export function renderGuildPanel(db, guildId) {
    const guild = db.prepare('SELECT * FROM Guilds WHERE id = ?').get(guildId);
    if (!guild)
        return null;
    const managers = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(guildId);
    const mainRosters = db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(guildId);
    const subRosters = db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(guildId);
    return {
        guild,
        managers: managers.count,
        mainRosters: mainRosters.count,
        subRosters: subRosters.count,
    };
}
export function checkExpiredTickets(db) {
    const now = new Date().toISOString();
    const expiredWars = db.prepare('SELECT * FROM Wars WHERE status = ? AND expiresAt < ?').all('PENDING', now);
    const expiredWagers = db.prepare('SELECT * FROM Wagers WHERE status = ? AND expiresAt < ?').all('PENDING', now);
    return { wars: expiredWars, wagers: expiredWagers };
}
export function autoDodgeWar(db, warId) {
    db.prepare('UPDATE Wars SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', warId);
}
export function autoDodgeWager(db, wagerId) {
    db.prepare('UPDATE Wagers SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', wagerId);
}
export function getPendingTicketsForReminder(db) {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const pendingWars = db.prepare('SELECT * FROM Wars WHERE status = ? AND createdAt < ? AND expiresAt > ?').all('PENDING', twoHoursAgo, now.toISOString());
    const pendingWagers = db.prepare('SELECT * FROM Wagers WHERE status = ? AND createdAt < ? AND expiresAt > ?').all('PENDING', twoHoursAgo, now.toISOString());
    return { wars: pendingWars, wagers: pendingWagers };
}
// ── Dodge History ────────────────────────────────────────────────────────────
export function recordGuildDodge(db, guildId, guildName, graceMinutes = 5, opponent = null) {
    // Check if there's an earlier dodge within the last 3 days that hasn't had its ELO penalty applied yet
    const priorDodge = db.prepare(`
        SELECT * FROM guild_dodge_history
        WHERE guild_id = ?
          AND dodged_at > datetime('now', '-3 days')
          AND elo_penalty_applied = 0
        ORDER BY dodged_at DESC LIMIT 1
    `).get(guildId);
    let eloPenaltyApplied = false;
    if (priorDodge) {
        // Only apply ELO if the grace period of the PRIOR dodge has already expired
        const graceExpired = new Date(priorDodge.grace_until) < new Date();
        if (graceExpired) {
            db.prepare('UPDATE Guilds SET elo = COALESCE(elo, 0) - 25 WHERE id = ?').run(guildId);
            db.prepare('UPDATE guild_dodge_history SET elo_penalty_applied = 1 WHERE id = ?').run(priorDodge.id);
            eloPenaltyApplied = true;
        }
    }
    const graceUntil = new Date(Date.now() + (graceMinutes || 5) * 60 * 1000).toISOString();
    db.prepare('INSERT INTO guild_dodge_history (guild_id, guild_name, grace_until, leader_id, opponent_guild_id, opponent_guild_name) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, guildName || '', graceUntil, opponent?.leaderId ?? null, opponent?.guildId ?? null, opponent?.guildName ?? null);
    return { eloPenaltyApplied, graceUntil };
}
export function isUserInGuildAnyRole(db, guildId, userId) {
    const guild = db.prepare('SELECT leaderId, coLeaderId FROM Guilds WHERE id = ?').get(guildId);
    if (!guild) return false;
    if (guild.leaderId === userId || guild.coLeaderId === userId) return true;
    return !!db.prepare(`SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?
        UNION SELECT 1 FROM MainRosters WHERE guildId = ? AND userId = ?
        UNION SELECT 1 FROM SubRosters WHERE guildId = ? AND userId = ?`)
        .get(guildId, userId, guildId, userId, guildId, userId);
}
export function getGuildActiveDodge(db, guildId) {
    return db.prepare(`
        SELECT * FROM guild_dodge_history
        WHERE guild_id = ? AND datetime(grace_until) > datetime('now')
        ORDER BY grace_until DESC LIMIT 1
    `).get(guildId) || null;
}
export function getAllDodgeRecords(db) {
    return db.prepare(`
        SELECT d.*, g.elo as current_elo
        FROM guild_dodge_history d
        LEFT JOIN Guilds g ON g.id = d.guild_id
        ORDER BY d.dodged_at DESC
    `).all();
}
export function getExpiredCooldownsToNotify(db) {
    // Use datetime() to properly parse ISO 8601 strings (stored with 'T' separator)
    return db.prepare(
        "SELECT * FROM cooldowns WHERE notify_at IS NOT NULL AND datetime(notify_at) <= datetime('now') AND notify_sent = 0"
    ).all();
}
export function markCooldownNotified(db, discordId) {
    db.prepare("UPDATE cooldowns SET notify_sent = 1 WHERE discord_id = ?").run(discordId);
}
export function getExpiredDodgesToNotify(db) {
    // One row per guild (most recent dodge), to avoid duplicate notifications
    // Use datetime() to properly parse ISO 8601 strings (stored with 'T' separator)
    return db.prepare(`
        SELECT d.guild_id, d.guild_name, g.leaderId, MAX(d.id) as id
        FROM guild_dodge_history d
        LEFT JOIN Guilds g ON g.id = d.guild_id
        WHERE datetime(d.grace_until) <= datetime('now') AND d.notify_sent = 0
        GROUP BY d.guild_id
    `).all();
}
export function markDodgeNotified(db, guildId) {
    // Mark ALL unnotified expired records for this guild at once
    db.prepare("UPDATE guild_dodge_history SET notify_sent = 1 WHERE guild_id = ? AND datetime(grace_until) <= datetime('now')").run(guildId);
}
export function getActiveDodgeRecords(db) {
    // Only guilds currently under an active grace period
    return db.prepare(`
        SELECT d.*, g.elo as current_elo
        FROM guild_dodge_history d
        LEFT JOIN Guilds g ON g.id = d.guild_id
        WHERE datetime(d.grace_until) > datetime('now')
        ORDER BY d.dodged_at DESC
    `).all();
}
export function setInviteTempChannel(db, inviteId, channelId) {
    db.prepare('UPDATE Invites SET temp_channel_id = ? WHERE id = ?').run(channelId, inviteId);
}
export function getExpiredPendingInvites(db) {
    return db.prepare(
        "SELECT * FROM Invites WHERE status = 'PENDING' AND expiresAt IS NOT NULL AND datetime(expiresAt) <= datetime('now')"
    ).all();
}
//# sourceMappingURL=database.js.map