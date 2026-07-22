import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { setSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('setstaffrole')
  .setDescription('Set the staff role that can approve signings')
  .addRoleOption(o => o.setName('role').setDescription('Staff role').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {
  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.editReply('âŒ Only administrators can set the staff role.'); return;
  }
  const role = interaction.options.getRole('role', true);
  setSetting(db, `${interaction.guildId}_staff_role_id`, role.id);
  await interaction.editReply(`❌… Staff role set to <@&${role.id}>. Members with this role can approve signings.`);
}
