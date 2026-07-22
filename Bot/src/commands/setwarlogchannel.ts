import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { setSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('setwarlogchannel')
  .setDescription('Set the channel where war results are logged')
  .addChannelOption(o => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {
  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.editReply('âŒ Only administrators can set this.'); return;
  }
  const ch = interaction.options.getChannel('channel', true);
  setSetting(db, `${interaction.guildId}_war_log_channel_id`, ch.id);
  await interaction.editReply(`❌… War log channel set to <#${ch.id}>.`);
}
