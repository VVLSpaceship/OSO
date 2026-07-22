import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchOrgs } from '../siteapi.js';
export const data = new SlashCommandBuilder()
    .setName('searchorg')
    .setDescription('Search for a guild/org on the site')
    .addStringOption(o => o.setName('query').setDescription('Org name or tag').setRequired(true));
export async function execute(interaction) {
    const query = interaction.options.getString('query', true);
    try {
        const orgs = await searchOrgs(query);
        if (!orgs.length) {
            await interaction.editReply('No orgs found for that query.');
            return;
        }
        const org = orgs[0];
        const wr = (org.wins + org.losses) > 0 ? `${((org.wins / (org.wins + org.losses)) * 100).toFixed(0)}%` : 'N/A';
        const embed = new EmbedBuilder()
            .setTitle(`${org.name} [${org.tag}]`)
            .setColor(0x5BADFF)
            .setThumbnail(org.logo_url || null)
            .addFields(
                { name: 'Region', value: org.region || '-', inline: true },
                { name: 'Status', value: org.status?.toUpperCase() || '-', inline: true },
                { name: 'Founded', value: org.founded || '-', inline: true },
                { name: 'Record', value: `${org.wins}W / ${org.losses}L`, inline: true },
                { name: 'Winrate', value: wr, inline: true },
                { name: 'Members', value: String(org.members?.length || 0), inline: true },
                { name: 'MVP', value: org.mvp || '-', inline: true },
                { name: 'Points', value: String(org.points || 0), inline: true }
            );
        if (org.members?.length) {
            const rosterLines = org.members.map((m) => `- **${m.name}** (${m.role})`).join('\n');
            embed.addFields({ name: 'Roster', value: rosterLines.slice(0, 1024) });
        }
        await interaction.editReply({ embeds: [embed] });
    }
    catch (e) {
        await interaction.editReply(`❌ Error: ${e.message}`);
    }
}
//# sourceMappingURL=searchorg.js.map
