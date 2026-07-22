import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllOrgs } from '../siteapi.js';
import { getRoleLimit } from '../database.js';

export const data = new SlashCommandBuilder()
    .setName('teamstats')
    .setDescription('Show all active guilds and their roster status');

const MAX_SIZE = 1 + getRoleLimit('CO_LEADER') + getRoleLimit('MANAGER') + getRoleLimit('MAIN') + getRoleLimit('SUB');

export async function execute(interaction) {
    try {
        const orgs = await getAllOrgs();
        const active = orgs.filter((o) => o.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
        if (!active.length) {
            await interaction.editReply('No active guilds found.');
            return;
        }

        const lines = active.map((o) => {
            const memberCount = o.members?.length ?? 0;
            const ratio = memberCount / MAX_SIZE;

            let dot, status;
            if (memberCount >= MAX_SIZE) {
                dot = '🔴'; status = 'Full';
            } else if (ratio >= 0.8) {
                dot = '🟡'; status = 'Almost Full';
            } else {
                dot = '🟢'; status = 'Open';
            }

            const roleMention = o.discord_role_id ? `<@&${o.discord_role_id}>` : `**${o.name}**`;
            const leader = o.members?.find(m => m.role === 'Leader');
            const leaderName = leader?.name || 'No captain';

            return `${dot} ${status} ${roleMention} — ${memberCount}/${MAX_SIZE}\n👑 ${leaderName}`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 Team Overview')
            .setColor(0x5BADFF)
            .setDescription(lines.join('\n\n').slice(0, 4096));

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        await interaction.editReply(`❌ Error: ${e.message}`);
    }
}
//# sourceMappingURL=teamstats.js.map
