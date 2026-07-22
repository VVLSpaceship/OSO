import { SlashCommandBuilder } from 'discord.js';
import { getSetting } from '../database.js';
const WAR_DODGE_LOGS_CHANNEL_ID_DEFAULT = '1473408078358642759';
const WAGER_DODGE_LOGS_CHANNEL_ID_DEFAULT = '1473407994535346177';
const HOSTER_ROLE_IDS_DEFAULT = ['1470554662687215741', '1470554664238845962'];
function formatWagerTeam(teamIds) {
    return teamIds
        .filter((v) => !!v)
        .map((id) => `<@${id}>`)
        .join(' + ');
}
function buildWagerParticipantIds(wager) {
    return [wager.challenger1Id, wager.challenger2Id, wager.challenged1Id, wager.challenged2Id]
        .filter((value) => !!value);
}
export const data = new SlashCommandBuilder()
    .setName('adminclose')
    .setDescription('Force close a war or wager ticket (Admin only)')
    .addStringOption(option => option
    .setName('type')
    .setDescription('Type of ticket to close')
    .setRequired(true)
    .addChoices({ name: 'War', value: 'war' }, { name: 'Wager', value: 'wager' }))
    .addStringOption(option => option
    .setName('ticket_id')
    .setDescription('ID of the ticket to close')
    .setRequired(true))
    .addStringOption(option => option
    .setName('reason')
    .setDescription('Reason for closing the ticket')
    .setRequired(true));
export async function execute(interaction, db) {
    try {
        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const isAdmin = !!member?.permissions.has('Administrator');
        const hosterRoleId = getSetting(db, `${interaction.guildId}_hoster_role_id`);
        const hasPermission = isAdmin || (!!member && (hosterRoleId
            ? member.roles.cache.has(hosterRoleId)
            : HOSTER_ROLE_IDS_DEFAULT.some(roleId => member.roles.cache.has(roleId))));
        if (!hasPermission) {
            await interaction.editReply({
                content: '❌ You do not have permission. Configure the role with `/setup hoster_role`.',
            });
            return;
        }
        const type = interaction.options.getString('type', true);
        const ticketId = interaction.options.getString('ticket_id', true);
        const reason = interaction.options.getString('reason', true);
        if (!ticketId || ticketId.trim() === '') {
            await interaction.editReply({
                content: '❌ Invalid ticket ID.',
            });
            return;
        }
        if (type === 'war') {
            const war = db.prepare('SELECT * FROM Wars WHERE channelId = ?').get(ticketId);
            if (!war) {
                await interaction.editReply({
                    content: '❌ War ticket not found.',
                });
                return;
            }
            if (war.status === 'FINISHED' || war.status === 'DODGED') {
                await interaction.editReply({
                    content: '❌ This war is already closed.',
                });
                return;
            }
            // Get guild names for the dodge message
            const openerGuild = db.prepare('SELECT name FROM Guilds WHERE id = ?').get(war.openerGuildId);
            const opponentGuild = db.prepare('SELECT name FROM Guilds WHERE id = ?').get(war.opponentGuildId);
            // Close the war
            db.prepare('UPDATE Wars SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', war.id);
            // Send dodge message to war-dodge channel
            const dodgeSummary = `⚠️ <@${interaction.user.id}> force closed the war ticket (${openerGuild?.name || 'Unknown'} vs ${opponentGuild?.name || 'Unknown'}). Reason: ${reason}`;
            const warDodgeId = getSetting(db, `${interaction.guildId}_war_dodge_channel_id`) || WAR_DODGE_LOGS_CHANNEL_ID_DEFAULT;
            const warDodgeLogsChannel = (interaction.guild?.channels.cache.get(warDodgeId) ?? await interaction.guild?.channels.fetch(warDodgeId).catch(() => null));
            if (warDodgeLogsChannel && warDodgeLogsChannel.isTextBased() && 'send' in warDodgeLogsChannel) {
                await warDodgeLogsChannel.send({
                    content: dodgeSummary,
                });
            }
            // Try to delete the channel
            if (war.channelId) {
                const channel = (interaction.guild?.channels.cache.get(war.channelId) ?? await interaction.guild?.channels.fetch(war.channelId).catch(() => null));
                if (channel && 'send' in channel) {
                    await channel.send(`⚠️ This war was closed by an admin. Reason: **${reason}**\nChannel will be deleted in 5 seconds.`).catch(() => null);
                }
                setTimeout(async () => {
                    await channel?.delete(`War ticket force closed by admin: ${reason}`).catch(() => null);
                }, 5000);
            }
            await interaction.editReply({
                content: `✅ War ticket #${ticketId} has been force closed.`,
            });
        }
        else if (type === 'wager') {
            const wager = db.prepare('SELECT * FROM Wagers WHERE channelId = ?').get(ticketId);
            if (!wager) {
                await interaction.editReply({
                    content: '❌ Wager ticket not found.',
                });
                return;
            }
            if (wager.status === 'CLOSED' || wager.status === 'DODGED') {
                await interaction.editReply({
                    content: '❌ This wager is already closed.',
                });
                return;
            }
            // Get team info for the dodge message
            const participants = buildWagerParticipantIds(wager);
            const mentionUsers = Array.from(new Set([...participants, interaction.user.id]));
            const teamA = formatWagerTeam([wager.challenger1Id, wager.challenger2Id]);
            const teamB = formatWagerTeam([wager.challenged1Id, wager.challenged2Id]);
            // Close the wager
            db.prepare('UPDATE Wagers SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', wager.id);
            // Send dodge message to wager-dodge channel
            const dodgeSummary = `# WAGER FORCE CLOSE\n<@${interaction.user.id}> force closed the wager ticket (${teamA} vs ${teamB}). Reason: ${reason}`;
            const wagerDodgeId = getSetting(db, `${interaction.guildId}_wager_dodge_channel_id`) || WAGER_DODGE_LOGS_CHANNEL_ID_DEFAULT;
            const wagerDodgeLogsChannel = (interaction.guild?.channels.cache.get(wagerDodgeId) ?? await interaction.guild?.channels.fetch(wagerDodgeId).catch(() => null));
            if (wagerDodgeLogsChannel && wagerDodgeLogsChannel.isTextBased() && 'send' in wagerDodgeLogsChannel) {
                await wagerDodgeLogsChannel.send({
                    content: dodgeSummary,
                    allowedMentions: { users: mentionUsers },
                });
            }
            // Try to delete the channel
            if (wager.channelId) {
                const channel = (interaction.guild?.channels.cache.get(wager.channelId) ?? await interaction.guild?.channels.fetch(wager.channelId).catch(() => null));
                if (channel && 'send' in channel) {
                    await channel.send(`⚠️ This wager was closed by an admin. Reason: **${reason}**\nChannel will be deleted in 5 seconds.`).catch(() => null);
                }
                setTimeout(async () => {
                    await channel?.delete(`Wager ticket force closed by admin: ${reason}`).catch(() => null);
                }, 5000);
            }
            await interaction.editReply({
                content: `✅ Wager ticket #${ticketId} has been force closed.`,
            });
        }
    }
    catch (error) {
        console.error('Error in adminclose command:', error);
        await interaction.editReply({
            content: '❌ An unexpected error occurred.',
        });
    }
}
//# sourceMappingURL=adminclose.js.map