/*
You are creating a Discord guild management bot.

Architecture Rules:
- discord.js v14
- TypeScript
- Slash Commands only
- Use Buttons, SelectMenus and Modals for UI
- Use ephemeral responses whenever possible
- Persistent storage with SQLite (better-sqlite3)
- Every guild registered creates a persistent panel message in channel: registered-guilds
- Panel must auto update after any change
*/
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import Database from 'better-sqlite3';
import { registerCommands, loadCommands } from './commands.js';
import { handleInteractions, handleWagerAmountMessage } from './Interaction.js';
import { setupDatabase, checkExpiredTickets, autoDodgeWar, autoDodgeWager, getPendingTicketsForReminder, getSetting, getExpiredCooldownsToNotify, markCooldownNotified, getExpiredDodgesToNotify, markDodgeNotified, getExpiredPendingInvites, setInviteStatus } from './database.js';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
dotenv.config();
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DEFAULT_DB_PATH = existsSync('/var/data') ? '/var/data/guilds.db' : 'guilds.db';
const DB_PATH = (process.env.DB_PATH || DEFAULT_DB_PATH).trim();
if (!TOKEN || !CLIENT_ID) {
    throw new Error('DISCORD_TOKEN and CLIENT_ID are required in .env');
}
// Create database connection
const db = new Database(DB_PATH);
console.log(`📦 Using database at: ${DB_PATH}`);
setupDatabase(db);
// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});
let commands;
// Deduplication: prevent double-fire from WebSocket reconnects
const seenInteractions = new Set();
// Event: Bot ready
client.once('ready', async () => {
    console.log(`✅ Bot connected as ${client.user?.tag}`);
    // Load commands into memory first so interactions work immediately
    commands = await loadCommands();
    console.log(`✅ ${commands.size} commands loaded`);
    // Register commands with Discord API in background (slow — don't block interactions)
    registerCommands(TOKEN, CLIENT_ID).catch(e => console.error('Command registration error:', e));
    // Start periodic ticket checking
    setInterval(async () => {
        try {
            await checkAndHandleExpiredTickets(client, db);
            await sendReminders(client, db);
        }
        catch (error) {
            console.error('Error in periodic ticket check:', error);
        }
    }, 60 * 60 * 1000); // Check every hour
    // Cooldown + dodge grace period notifications — check every 60 seconds
    setInterval(async () => {
        try { await sendCooldownNotifications(client, db); } catch (e) { console.error('Cooldown notify error:', e); }
        try { await sendDodgeNotifications(client, db); } catch (e) { console.error('Dodge notify error:', e); }
        try { await cleanupExpiredInvites(client, db); } catch (e) { console.error('Invite cleanup error:', e); }
    }, 60 * 1000);
    // Initial check
    setTimeout(async () => {
        try {
            await checkAndHandleExpiredTickets(client, db);
            await sendReminders(client, db);
        }
        catch (error) {
            console.error('Error in initial ticket check:', error);
        }
    }, 10000); // 10 seconds after startup
});
// Event: Interaction received
client.on('interactionCreate', async (interaction) => {
    if (seenInteractions.has(interaction.id)) return;
    seenInteractions.add(interaction.id);
    if (seenInteractions.size > 500) seenInteractions.clear();
    await handleInteractions(interaction, client, db, commands);
});
// Event: Message (for wager amount collection)
client.on('messageCreate', async (message) => {
    try {
        await handleWagerAmountMessage(message, db);
    } catch (e) {
        console.error('[messageCreate] wager amount handler error:', e);
    }
});
// Event: Error
client.on('error', error => {
    console.error('Client error:', error);
});
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
// Connect to Discord
client.login(TOKEN);
async function checkAndHandleExpiredTickets(client, db) {
    const { wars, wagers } = checkExpiredTickets(db);
    for (const war of wars) {
        autoDodgeWar(db, war.id);
        await notifyAutoDodge(client, db, war, 'war');
    }
    for (const wager of wagers) {
        autoDodgeWager(db, wager.id);
        await notifyAutoDodge(client, db, wager, 'wager');
    }
}
async function sendReminders(client, db) {
    const { wars, wagers } = getPendingTicketsForReminder(db);
    for (const war of wars) {
        await sendReminder(client, db, war, 'war');
    }
    for (const wager of wagers) {
        await sendReminder(client, db, wager, 'wager');
    }
}
async function notifyAutoDodge(client, db, ticket, type) {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel))
        return;
    const summary = type === 'war'
        ? `⚠️ War automatically dodged due to no acceptance within 3 days.`
        : `⚠️ Wager automatically dodged due to no acceptance within 3 days.`;
    await channel.send(summary);
    // Notify hosters
    const hosterRoles = ['1470554662687215741', '1470554664238845962', '1470554662687215741']; // Hoster, Junior Hoster, Event Hoster
    const logChannel = await client.channels.fetch('1470554772678512794').catch(() => null);
    if (logChannel && logChannel.isTextBased() && 'send' in logChannel) {
        await logChannel.send(`🔄 Auto-dodge: ${type} ticket #${ticket.id} expired and was automatically closed.`);
    }
}
async function sendReminder(client, db, ticket, type) {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel))
        return;
    const participants = type === 'war'
        ? [ticket.openerGuildId, ticket.opponentGuildId]
        : [ticket.challenger1Id, ticket.challenger2Id, ticket.challenged1Id, ticket.challenged2Id].filter(Boolean);
    const mentions = participants.map((id) => `<@${id}>`).join(' ');
    await channel.send(`${mentions} ⏰ Reminder: This ${type} ticket is still pending acceptance. You have time until the automatic dodge in 3 days.`);
    // Try DM fallback
    for (const userId of participants) {
        try {
            const user = await client.users.fetch(userId);
            await user.send(`⏰ Reminder: You have a pending ${type} ticket that needs acceptance. Check the ticket channel.`);
        }
        catch (error) {
            // Ignore DM errors
        }
    }
}
async function sendCooldownNotifications(client, db) {
    const expired = getExpiredCooldownsToNotify(db);
    for (const row of expired) {
        markCooldownNotified(db, row.discord_id);
        for (const [serverId] of client.guilds.cache) {
            const channelId = getSetting(db, `${serverId}_signing_cooldown_notify_channel_id`);
            if (!channelId) continue;
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel?.isTextBased() || !('send' in channel)) continue;
            await channel.send(`✅ <@${row.discord_id}> your signing cooldown has ended! You can now be signed to a new guild.`).catch(() => null);
            break;
        }
    }
}
async function sendDodgeNotifications(client, db) {
    const expired = getExpiredDodgesToNotify(db);
    for (const row of expired) {
        markDodgeNotified(db, row.guild_id);
        for (const [serverId, server] of client.guilds.cache) {
            const channelId = getSetting(db, `${serverId}_dodge_notify_channel_id`);
            if (!channelId) continue;
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel?.isTextBased() || !('send' in channel)) continue;
            // Mention the guild's Discord role (role named after the guild); fallback to leader mention
            let guildRole = server.roles.cache.find(r => r.name === row.guild_name);
            if (!guildRole) {
                const fetchedRoles = await server.roles.fetch().catch(() => null);
                if (fetchedRoles) guildRole = fetchedRoles.find(r => r.name === row.guild_name);
            }
            const mention = guildRole
                ? `<@&${guildRole.id}>`
                : (row.leaderId ? `<@${row.leaderId}>` : `**${row.guild_name}**`);
            await channel.send({
                content: `✅ ( ${mention} ) your dodge grace period has ended! Your guild can now be challenged again.`,
                allowedMentions: guildRole ? { roles: [guildRole.id] } : (row.leaderId ? { users: [row.leaderId] } : {}),
            }).catch(() => null);
            break;
        }
    }
}
async function cleanupExpiredInvites(client, db) {
    const expired = getExpiredPendingInvites(db);
    for (const invite of expired) {
        setInviteStatus(db, invite.id, 'DECLINED');
        if (invite.temp_channel_id) {
            const ch = await client.channels.fetch(invite.temp_channel_id).catch(() => null);
            if (ch && 'delete' in ch) await ch.delete('Invite expired').catch(() => null);
        }
    }
}
export { db, client };
//# sourceMappingURL=bot.js.map