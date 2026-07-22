import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { setSetting } from '../database.js';
export const data = new SlashCommandBuilder()
    .setName('setwagerdodgechannel')
    .setDescription('Set the channel where wager dodges are logged')
    .addChannelOption(o => o.setName('channel').setDescription('Dodge log channel').addChannelTypes(ChannelType.GuildText).setRequired(true));
export async function execute(interaction, db) {
    if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.editReply('❌ Only administrators can set this.');
        return;
    }
    const ch = interaction.options.getChannel('channel', true);
    setSetting(db, `${interaction.guildId}_wager_dodge_channel_id`, ch.id);
    await interaction.editReply(`❌… Wager dodge log channel set to <#${ch.id}>.`);
}
//# sourceMappingURL=setwagerdodgechannel.js.map