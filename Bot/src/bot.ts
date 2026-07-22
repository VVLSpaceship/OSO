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
import { handleInteractions } from './Interaction.js';
import { setupDatabase, checkExpiredTickets, autoDodgeWar, autoDodgeWager, getPendingTicketsForReminder } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DB_PATH = (process.env.DB_PATH || 'guilds.db').trim();

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

let commands: Map<string, any>;

// Event: Bot ready
client.once('ready', async () => {
  console.log(`✅ Bot connected as ${client.user?.tag}`);

  // Register commands
  await registerCommands(TOKEN, CLIENT_ID);

  // Load commands into memory
  commands = await loadCommands();

  console.log(`✅ ${commands.size} commands loaded`);

  // Start periodic ticket checking
  setInterval(async () => {
    try {
      await checkAndHandleExpiredTickets(client, db);
      await sendReminders(client, db);
    } catch (error) {
      console.error('Error in periodic ticket check:', error);
    }
  }, 60 * 60 * 1000); // Check every hour

  // Initial check
  setTimeout(async () => {
    try {
      await checkAndHandleExpiredTickets(client, db);
      await sendReminders(client, db);
    } catch (error) {
      console.error('Error in initial ticket check:', error);
    }
  }, 10000); // 10 seconds after startup
});

// Event: Interaction received
client.on('interactionCreate', async interaction => {
  await handleInteractions(interaction, client, db, commands);
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

async function checkAndHandleExpiredTickets(client: Client, db: any) {
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

async function sendReminders(client: Client, db: any) {
  const { wars, wagers } = getPendingTicketsForReminder(db);

  for (const war of wars) {
    await sendReminder(client, db, war, 'war');
  }

  for (const wager of wagers) {
    await sendReminder(client, db, wager, 'wager');
  }
}

async function notifyAutoDodge(client: Client, db: any, ticket: any, type: 'war' | 'wager') {
  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) return;

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

async function sendReminder(client: Client, db: any, ticket: any, type: 'war' | 'wager') {
  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) return;

  const participants = type === 'war'
    ? [ticket.openerGuildId, ticket.opponentGuildId]
    : [ticket.challenger1Id, ticket.challenger2Id, ticket.challenged1Id, ticket.challenged2Id].filter(Boolean);

  const mentions = participants.map((id: string) => `<@${id}>`).join(' ');

  await channel.send(`${mentions} ⏰ Reminder: This ${type} ticket is still pending acceptance. You have time until the automatic dodge in 3 days.`);

  // Try DM fallback
  for (const userId of participants) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(`⏰ Reminder: You have a pending ${type} ticket that needs acceptance. Check the ticket channel.`);
    } catch (error) {
      // Ignore DM errors
    }
  }
}

export { db, client };
