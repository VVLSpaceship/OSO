import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { getSetting, setSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('setlogchannel')
  .setDescription('Set the channel for signing approval requests (staff only)')
  .addChannelOption(o => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {
  const staffRoleId = getSetting(db, `${interaction.guildId}_staff_role_id`);
  if (staffRoleId && interaction.guild) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.roles.cache.has(staffRoleId)) { await interaction.editReply('âŒ No permission.'); return; }
  }
  const ch = interaction.options.getChannel('channel', true);
  setSetting(db, 'log_channel_id', ch.id);
  await interaction.editReply(`❌… Log channel set to <#${ch.id}>.`);
}
