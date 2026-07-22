import { SlashCommandBuilder } from 'discord.js';
import { getSetting, setSetting } from '../database.js';
export const data = new SlashCommandBuilder()
    .setName('closesigning')
    .setDescription('Close all guild signings globally (staff only)');
export async function execute(interaction, db) {
    const staffRoleId = getSetting(db, `${interaction.guildId}_staff_role_id`);
    if (staffRoleId && interaction.guild) {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member?.roles.cache.has(staffRoleId)) {
            await interaction.editReply('❌ No permission.');
            return;
        }
    }
    setSetting(db, `${interaction.guildId}_signing_closed`, '1');
    await interaction.editReply('🔒 Signings are now **closed**. No new sign requests can be made.');
}
//# sourceMappingURL=closesigning.js.map
