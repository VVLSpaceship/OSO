import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { setSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('setwagerrole')
  .setDescription('Set the role(s) that can publish the Wager Ticket panel')
  .addRoleOption(o => o.setName('role').setDescription('Role to allow').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {
  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.editReply('âŒ Only administrators can set this.'); return;
  }
  const role = interaction.options.getRole('role', true);
  setSetting(db, `${interaction.guildId}_wager_role_id`, role.id);
  await interaction.editReply(`❌… Wager ticket role set to <@&${role.id}>.`);
}
