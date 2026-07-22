import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchPlayers } from '../siteapi.js';
export const data = new SlashCommandBuilder()
    .setName('searchplayer')
    .setDescription('Search for a player on the leaderboard')
    .addStringOption(o => o.setName('query').setDescription('Player name').setRequired(true));
export async function execute(interaction) {
    const query = interaction.options.getString('query', true);
    try {
        const players = await searchPlayers(query);
        if (!players.length) {
            await interaction.editReply('No players found.');
            return;
        }
        const p = players[0];
        const wr = (p.wins + p.losses) > 0 ? `${((p.wins / (p.wins + p.losses)) * 100).toFixed(0)}%` : 'N/A';
        const embed = new EmbedBuilder()
            .setTitle(p.name)
            .setColor(0x5BADFF)
            .addFields({ name: 'ELO', value: String(p.elo || 1000), inline: true }, { name: 'Wins', value: String(p.wins || 0), inline: true }, { name: 'Losses', value: String(p.losses || 0), inline: true }, { name: 'Winrate', value: wr, inline: true }, { name: 'Guild', value: p.org || 'Free Agent', inline: true });
        await interaction.editReply({ embeds: [embed] });
    }
    catch (e) {
        await interaction.editReply(`❌ Error: ${e.message}`);
    }
}
//# sourceMappingURL=searchplayer.js.map