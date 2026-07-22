import { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, } from 'discord.js';
import { getSetting } from '../database.js';
const ALLOWED_GUILD_PANEL_ROLE_IDS_DEFAULT = [
    '1470554645364478016',
    '1470554652264108204',
    '1470554648568926219',
];
export const data = new SlashCommandBuilder()
    .setName('guildlist')
    .setDescription('Lists guilds and opens their management panel');
export async function execute(interaction, db) {
    try {
        const guildId = interaction.guildId;
        if (!guildId) {
            await interaction.editReply({
                content: 'This command can only be used in a server.',
            });
            return;
        }
        const actorMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const isAdmin = !!actorMember?.permissions.has('Administrator');
        const configuredRole = getSetting(db, `${guildId}_guild_register_role_id`);
        const canUseGuildList = isAdmin || (!!actorMember && (configuredRole
            ? actorMember.roles.cache.has(configuredRole)
            : ALLOWED_GUILD_PANEL_ROLE_IDS_DEFAULT.some(roleId => actorMember.roles.cache.has(roleId))));
        if (!canUseGuildList) {
            await interaction.editReply({
                content: '❌ You do not have permission. Configure the role with `/setup guild_register_role`.',
            });
            return;
        }
        // Fetch all registered guilds
        const guilds = db.prepare('SELECT * FROM Guilds ORDER BY name ASC').all();
        if (!guilds || guilds.length === 0) {
            await interaction.editReply({
                content: 'ℹ️ No guilds are registered yet.',
            });
            return;
        }
        const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
        const currentPage = 1;
        const menuGuilds = guilds.slice((currentPage - 1) * 25, currentPage * 25);
        const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
            .setLabel(guild.name)
            .setDescription(`Region: ${guild.region} | Leader: ${guild.leaderId}`)
            .setValue(guild.id)
            .setEmoji('🏰'));
        // Build select menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('guild_select')
            .setPlaceholder('Select a guild to open panel')
            .addOptions(options);
        const row = new ActionRowBuilder()
            .addComponents(selectMenu);
        const components = [row];
        if (totalPages > 1) {
            const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(`guild_list_page|${currentPage - 1}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage <= 1), new ButtonBuilder()
                .setCustomId(`guild_list_page|${currentPage + 1}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage >= totalPages));
            components.push(pageRow);
        }
        const embed = new EmbedBuilder()
            .setTitle('🏰 Registered Guilds')
            .setDescription(`📊 Total guilds: **${guilds.length}**\n\nSelect a guild from the menu below to open its management panel.\nPage ${currentPage}/${totalPages}.`)
            .setColor(0x5BADFF);
        await interaction.editReply({
            embeds: [embed],
            components,
        });
        // Collector for select menu
        const collector = interaction.channel?.createMessageComponentCollector({
            filter: (i) => i.customId === 'guild_select' && i.user.id === interaction.user.id,
            time: 300000, // 5 minutos
        });
        collector?.on('collect', async (i) => {
            if (!i.isStringSelectMenu())
                return;
            const selectedGuildId = i.values[0];
            const selectedGuild = db.prepare('SELECT * FROM Guilds WHERE id = ?').get(selectedGuildId);
            if (!selectedGuild) {
                await i.reply({
                    content: '❌ Guild not found.',
                    ephemeral: true,
                });
                return;
            }
            const coLeader = selectedGuild.coLeaderId;
            const managersCount = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(selectedGuild.id)?.count || 0;
            const mainsCount = db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(selectedGuild.id)?.count || 0;
            const subsCount = db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(selectedGuild.id)?.count || 0;
            const panelEmbed = new EmbedBuilder()
                .setTitle(`🏰 ${selectedGuild.name}`)
                .setColor(0x5BADFF)
                .addFields({ name: 'Leader', value: `<@${selectedGuild.leaderId}>`, inline: true }, { name: 'Co-Leader', value: coLeader ? `<@${coLeader}>` : 'None', inline: true }, { name: 'Region', value: selectedGuild.region, inline: true }, { name: 'Managers', value: `${managersCount}/2`, inline: true }, { name: 'Main Roster', value: `${mainsCount}/5`, inline: true }, { name: 'Sub Roster', value: `${subsCount}/5`, inline: true })
                .setThumbnail(selectedGuild.imageUrl || null);
            const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(`gp_open_add|${selectedGuild.id}|CO_LEADER`)
                .setLabel('Add Co-Leader')
                .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                .setCustomId(`gp_open_add|${selectedGuild.id}|MANAGER`)
                .setLabel('Add Manager Guild')
                .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                .setCustomId(`gp_open_add|${selectedGuild.id}|MAIN`)
                .setLabel('Add Main Roster')
                .setStyle(ButtonStyle.Success));
            const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(`gp_open_add|${selectedGuild.id}|SUB`)
                .setLabel('Add Sub Roster')
                .setStyle(ButtonStyle.Success), new ButtonBuilder()
                .setCustomId(`gp_open_remove|${selectedGuild.id}`)
                .setLabel('Remove Member')
                .setStyle(ButtonStyle.Danger), new ButtonBuilder()
                .setCustomId(`gp_open_transfer|${selectedGuild.id}`)
                .setLabel('Ownership Transfer')
                .setStyle(ButtonStyle.Secondary));
            await i.update({
                content: '',
                embeds: [panelEmbed],
                components: [row1, row2],
            });
        });
        collector?.on('end', () => {
            interaction.editReply({
                components: [],
            }).catch(() => { });
        });
    }
    catch (error) {
        console.error('Error listing guilds:', error);
        await interaction.editReply({
            content: '❌ An unexpected error occurred while processing your request.',
        });
    }
}
//# sourceMappingURL=guildlist.js.map