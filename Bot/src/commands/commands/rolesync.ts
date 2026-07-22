import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getAllOrgs } from '../siteapi.js';
import { getSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('rolesync')
  .setDescription('Sync guild roles to all members based on site data (staff only)');

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {

  const staffRoleId = getSetting(db, `${interaction.guildId}_staff_role_id`);
  if (staffRoleId && interaction.guild) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.roles.cache.has(staffRoleId)) {
      await interaction.editReply('âŒ You do not have permission to use this command.'); return;
    }
  }

  if (!interaction.guild) { await interaction.editReply('âŒ This command must be used in a server.'); return; }

  const orgs = await getAllOrgs();
  let synced = 0, errors = 0;

  for (const org of orgs) {
    if (!org.discord_role_id || !org.members?.length) continue;
    for (const m of org.members) {
      if (!m.discord_id) continue;
      try {
        const guildMember = await interaction.guild.members.fetch(m.discord_id).catch(() => null);
        if (guildMember) { await guildMember.roles.add(org.discord_role_id); synced++; }
      } catch { errors++; }
    }
  }

  await interaction.editReply(`❌… Role sync complete. **${synced}** members synced, **${errors}** errors.`);
}
