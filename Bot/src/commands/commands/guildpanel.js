import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } from 'discord.js';
export const data = new SlashCommandBuilder()
    .setName('guildpanel')
    .setDescription('Displays your guild management panel (leader, co-leader, or manager)');
export async function execute(interaction, db) {
    try {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        if (!guildId) {
            await interaction.editReply({
                content: 'This command can only be used in a server.',
            });
            return;
        }
        // Check if user belongs to a guild as leader, co-leader, manager, main roster, or sub roster
        let guild = db
            .prepare('SELECT * FROM Guilds WHERE leaderId = ? OR coLeaderId = ? LIMIT 1')
            .get(userId, userId);
        if (!guild) {
            guild = db
                .prepare(`SELECT g.*
           FROM Guilds g
           INNER JOIN Managers m ON m.guildId = g.id
           WHERE m.userId = ?
           ORDER BY g.createdAt ASC
           LIMIT 1`)
                .get(userId);
        }
        if (!guild) {
            guild = db
                .prepare(`SELECT g.*
           FROM Guilds g
           INNER JOIN MainRosters r ON r.guildId = g.id
           WHERE r.userId = ?
           ORDER BY g.createdAt ASC
           LIMIT 1`)
                .get(userId);
        }
        if (!guild) {
            guild = db
                .prepare(`SELECT g.*
           FROM Guilds g
           INNER JOIN SubRosters s ON s.guildId = g.id
           WHERE s.userId = ?
           ORDER BY g.createdAt ASC
           LIMIT 1`)
                .get(userId);
        }
        if (!guild) {
            await interaction.editReply({
                content: '❌ You are not registered in any guild (leader/co-leader/manager/main/sub).',
            });
            return;
        }
        // Load guild info
        const coLeader = guild.coLeaderId;
        const managersCount = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(guild.id)?.count || 0;
        const mainsCount = db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(guild.id)?.count || 0;
        const subsCount = db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(guild.id)?.count || 0;
        // Build management panel embed
        const embed = new EmbedBuilder()
            .setTitle(`🏰 ${guild.name}`)
            .setColor(0x5BADFF)
            .addFields({ name: 'Leader', value: `<@${guild.leaderId}>`, inline: true }, { name: 'Co-Leader', value: coLeader ? `<@${coLeader}>` : 'None', inline: true }, { name: 'Region', value: guild.region, inline: true }, { name: 'Managers', value: `${managersCount}/2`, inline: true }, { name: 'Main Roster', value: `${mainsCount}/5`, inline: true }, { name: 'Sub Roster', value: `${subsCount}/5`, inline: true })
            .setThumbnail(guild.imageUrl || null);
        const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(`gp_open_add|${guild.id}|CO_LEADER`)
            .setLabel('Add Co-Leader')
            .setStyle(ButtonStyle.Primary), new ButtonBuilder()
            .setCustomId(`gp_open_add|${guild.id}|MANAGER`)
            .setLabel('Add Manager Guild')
            .setStyle(ButtonStyle.Primary), new ButtonBuilder()
            .setCustomId(`gp_open_add|${guild.id}|MAIN`)
            .setLabel('Add Main Roster')
            .setStyle(ButtonStyle.Success));
        const rowLeave = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(`gp_leave_guild|${guild.id}`)
            .setLabel('Leave Guild')
            .setStyle(ButtonStyle.Danger));
        const components = [rowLeave];
        const roleCandidate = guild.leaderId === userId ? 'LEADER' :
            guild.coLeaderId === userId ? 'CO_LEADER' :
                db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guild.id, userId) ? 'MANAGER' :
                    db.prepare('SELECT 1 FROM MainRosters WHERE guildId = ? AND userId = ?').get(guild.id, userId) ? 'MAIN' :
                        db.prepare('SELECT 1 FROM SubRosters WHERE guildId = ? AND userId = ?').get(guild.id, userId) ? 'SUB' : null;
        const isLeaderOrCoLeader = roleCandidate === 'LEADER' || roleCandidate === 'CO_LEADER';
        if (isLeaderOrCoLeader || roleCandidate === 'MANAGER') {
            // row2: Remove Member and Ownership Transfer only for leader/co-leader
            const row2Buttons = [
                new ButtonBuilder()
                    .setCustomId(`gp_open_add|${guild.id}|SUB`)
                    .setLabel('Add Sub Roster')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`gp_open_rotate|${guild.id}`)
                    .setLabel('Rotate Member')
                    .setStyle(ButtonStyle.Secondary),
            ];
            if (isLeaderOrCoLeader) {
                row2Buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`gp_open_remove|${guild.id}`)
                        .setLabel('Remove Member')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`gp_open_transfer|${guild.id}`)
                        .setLabel('Ownership Transfer')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            const row2 = new ActionRowBuilder().addComponents(...row2Buttons);
            components.unshift(row2);
            components.unshift(row1);
        }
        await interaction.editReply({
            embeds: [embed],
            components,
        });
    }
    catch (error) {
        console.error('Error displaying guild panel:', error);
        await interaction.editReply({
            content: '❌ An unexpected error occurred while processing your request.',
        });
    }
}
//# sourceMappingURL=guildpanel.js.map