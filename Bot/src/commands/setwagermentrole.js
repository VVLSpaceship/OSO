import { SlashCommandBuilder } from 'discord.js';
import { getSetting, setSetting } from '../database.js';
export const data = new SlashCommandBuilder()
    .setName('setwagermentrole')
    .setDescription('Add or remove a role to mention when a wager is accepted')
    .addRoleOption(o => o.setName('role').setDescription('Role to mention').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('Add or remove').addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }).setRequired(false));
export async function execute(interaction, db) {
    if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.editReply('❌ Only administrators can set this.');
        return;
    }
    const role = interaction.options.getRole('role', true);
    const action = interaction.options.getString('action') || 'add';
    const key = `${interaction.guildId}_wager_mention_roles`;
    const current = getSetting(db, key);
    const roles = current ? current.split(',').filter(Boolean) : [];
    if (action === 'add') {
        if (!roles.includes(role.id))
            roles.push(role.id);
        setSetting(db, key, roles.join(','));
        await interaction.editReply(`❌… <@&${role.id}> will be mentioned when a wager is accepted.\nCurrent roles: ${roles.map(r => `<@&${r}>`).join(' ')}`);
    }
    else {
        const filtered = roles.filter(r => r !== role.id);
        setSetting(db, key, filtered.join(','));
        await interaction.editReply(`❌… <@&${role.id}> removed from wager mentions.\nCurrent roles: ${filtered.length ? filtered.map(r => `<@&${r}>`).join(' ') : 'none'}`);
    }
}
//# sourceMappingURL=setwagermentrole.js.map