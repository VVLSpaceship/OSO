import { SlashCommandBuilder } from 'discord.js';
import { getSetting } from '../database.js';
const HOSTER_ROLE_IDS_DEFAULT = ['1470554662687215741', '1470554664238845962'];
const WAR_DODGE_LOGS_CHANNEL_ID_DEFAULT = '1473408078358642759';
const WAGER_DODGE_LOGS_CHANNEL_ID_DEFAULT = '1473407994535346177';
export const data = new SlashCommandBuilder()
    .setName('admindodge')
    .setDescription('Force dodge a war or wager ticket (Admin only)')
    .addStringOption(option => option
    .setName('type')
    .setDescription('Type of ticket to dodge')
    .setRequired(true)
    .addChoices({ name: 'War', value: 'war' }, { name: 'Wager', value: 'wager' }))
    .addStringOption(option => option
    .setName('ticket_id')
    .setDescription('Channel ID of the ticket (right-click the channel → Copy ID)')
    .setRequired(true))
    .addStringOption(option => option
    .setName('reason')
    .setDescription('Reason for dodging the ticket')
    .setRequired(true));
async function fetchChannel(interaction, channelId) {
    // Try guild channels first (bot can see all guild channels)
    const fromGuild = interaction.guild?.channels.cache.get(channelId)
        ?? await interaction.guild?.channels.fetch(channelId).catch(() => null);
    if (fromGuild)
        return fromGuild;
    return interaction.client.channels.fetch(channelId).catch(() => null);
}
export async function execute(interaction, db) {
    try {
        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const isAdmin = !!member?.permissions.has('Administrator');
        const hosterRoleId = getSetting(db, `${interaction.guildId}_hoster_role_id`);
        const hasPermission = isAdmin || (!!member && (hosterRoleId
            ? member.roles.cache.has(hosterRoleId)
            : HOSTER_ROLE_IDS_DEFAULT.some(roleId => member.roles.cache.has(roleId))));
        if (!hasPermission) {
            await interaction.editReply({ content: '❌ You do not have permission. Configure the role with `/setup hoster_role`.' });
            return;
        }
        const type = interaction.options.getString('type', true);
        const ticketId = interaction.options.getString('ticket_id', true).trim();
        const reason = interaction.options.getString('reason', true);
        if (!ticketId) {
            await interaction.editReply({ content: '❌ Invalid ID.' });
            return;
        }
        if (type === 'war') {
            const war = db.prepare('SELECT * FROM Wars WHERE channelId = ?').get(ticketId);
            if (!war) {
                await interaction.editReply({ content: '❌ War ticket not found. Make sure you are using the Discord channel ID (right-click the channel → Copy ID).' });
                return;
            }
            if (war.status === 'FINISHED' || war.status === 'DODGED') {
                await interaction.editReply({ content: '❌ This war is already closed.' });
                return;
            }
            // Update status using war.id (not channelId)
            db.prepare('UPDATE Wars SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', war.id);
            // Send dodge message to ticket channel then delete it
            const ticketChannel = await fetchChannel(interaction, war.channelId);
            if (ticketChannel && 'send' in ticketChannel) {
                await ticketChannel.send(`⚠️ This war was closed by an admin. Reason: **${reason}**\nChannel will be deleted in 5 seconds.`).catch(() => null);
                setTimeout(async () => {
                    await ticketChannel.delete(`War force dodged by admin: ${reason}`).catch((e) => {
                        console.error('Failed to delete war channel:', e);
                    });
                }, 5000);
            }
            else {
                console.warn(`Could not find/access war ticket channel ${war.channelId}`);
            }
            // Send to dodge log channel
            const warDodgeId = getSetting(db, `${interaction.guildId}_war_dodge_channel_id`) || WAR_DODGE_LOGS_CHANNEL_ID_DEFAULT;
            const dodgeLogChannel = await fetchChannel(interaction, warDodgeId);
            if (dodgeLogChannel && 'send' in dodgeLogChannel) {
                await dodgeLogChannel.send(`⚠️ **Admin Dodge — War**\nForced by <@${interaction.user.id}>\nReason: ${reason}`).catch(() => null);
            }
            await interaction.editReply({ content: `✅ War ticket closed by dodge successfully.` });
        }
        else if (type === 'wager') {
            const wager = db.prepare('SELECT * FROM Wagers WHERE channelId = ?').get(ticketId);
            if (!wager) {
                await interaction.editReply({ content: '❌ Wager ticket not found. Make sure you are using the Discord channel ID (right-click the channel → Copy ID).' });
                return;
            }
            if (wager.status === 'CLOSED' || wager.status === 'DODGED') {
                await interaction.editReply({ content: '❌ This wager is already closed.' });
                return;
            }
            // Update status using wager.id (not channelId)
            db.prepare('UPDATE Wagers SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', wager.id);
            // Send dodge message to ticket channel then delete it
            const ticketChannel = await fetchChannel(interaction, wager.channelId);
            if (ticketChannel && 'send' in ticketChannel) {
                await ticketChannel.send(`⚠️ This wager was closed by an admin. Reason: **${reason}**\nChannel will be deleted in 5 seconds.`).catch(() => null);
                setTimeout(async () => {
                    await ticketChannel.delete(`Wager force dodged by admin: ${reason}`).catch((e) => {
                        console.error('Failed to delete wager channel:', e);
                    });
                }, 5000);
            }
            else {
                console.warn(`Could not find/access wager ticket channel ${wager.channelId}`);
            }
            // Send to dodge log channel
            const wagerDodgeId = getSetting(db, `${interaction.guildId}_wager_dodge_channel_id`) || WAGER_DODGE_LOGS_CHANNEL_ID_DEFAULT;
            const dodgeLogChannel = await fetchChannel(interaction, wagerDodgeId);
            if (dodgeLogChannel && 'send' in dodgeLogChannel) {
                await dodgeLogChannel.send(`⚠️ **Admin Dodge — Wager**\nForced by <@${interaction.user.id}>\nReason: ${reason}`).catch(() => null);
            }
            await interaction.editReply({ content: `✅ Wager ticket closed by dodge successfully.` });
        }
    }
    catch (error) {
        console.error('Error in admindodge command:', error);
        await interaction.editReply({ content: '❌ An unexpected error occurred.' });
    }
}
//# sourceMappingURL=admindodge.js.map