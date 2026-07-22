import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getSetting, setSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('setcooldown')
  .setDescription('Set cooldown (days) before a released player can join another guild')
  .addIntegerOption(o => o.setName('days').setDescription('Number of days (0 = no cooldown)').setMinValue(0).setMaxValue(30).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {
  const staffRoleId = getSetting(db, `${interaction.guildId}_staff_role_id`);
  if (staffRoleId && interaction.guild) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.roles.cache.has(staffRoleId)) { await interaction.editReply('âŒ No permission.'); return; }
  }
  const days = interaction.options.getInteger('days', true);
  setSetting(db, 'cooldown_days', String(days));
  await interaction.editReply(days === 0
    ? '❌… Signing cooldown **disabled**.'
    : `❌… Signing cooldown set to **${days} day(s)**.`);
}
