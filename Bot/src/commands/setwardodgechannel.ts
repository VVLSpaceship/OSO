import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { setSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('setwardodgechannel')
  .setDescription('Set the channel where war dodges are logged')
  .addChannelOption(o => o.setName('channel').setDescription('Dodge log channel').addChannelTypes(ChannelType.GuildText).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {
  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.editReply('âŒ Only administrators can set this.'); return;
  }
  const ch = interaction.options.getChannel('channel', true);
  setSetting(db, `${interaction.guildId}_war_dodge_channel_id`, ch.id);
  await interaction.editReply(`❌… War dodge log channel set to <#${ch.id}>.`);
}
