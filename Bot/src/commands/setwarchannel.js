import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { setSetting } from '../database.js';
export const data = new SlashCommandBuilder()
    .setName('setwarchannel')
    .setDescription('Set the channel where the War Ticket panel is published')
    .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true));
export async function execute(interaction, db) {
    if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.editReply('❌ Only administrators can set this.');
        return;
    }
    const ch = interaction.options.getChannel('channel', true);
    setSetting(db, `${interaction.guildId}_war_channel_id`, ch.id);
    await interaction.editReply(`❌… War ticket channel set to <#${ch.id}>.`);
}
//# sourceMappingURL=setwarchannel.js.map