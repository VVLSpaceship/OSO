import { SlashCommandBuilder } from 'discord.js';
import { getAllOrgs } from '../siteapi.js';
import { getSetting, refreshGuildPanel } from '../database.js';

export const data = new SlashCommandBuilder()
    .setName('rolesync')
    .setDescription('Sync guild name roles to all site members who are missing them (staff only)');

export async function execute(interaction, db) {
    const staffRoleId = getSetting(db, `${interaction.guildId}_staff_role_id`);
    if (staffRoleId && interaction.guild) {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member?.roles.cache.has(staffRoleId)) {
            await interaction.editReply('❌ You do not have permission to use this command.');
            return;
        }
    }
    if (!interaction.guild) {
        await interaction.editReply('❌ This command must be used in a server.');
        return;
    }

    await interaction.editReply('⏳ Syncing roles… this may take a moment.');

    const orgs = await getAllOrgs().catch(() => []);
    let synced = 0, skipped = 0, errors = 0;

    for (const org of orgs) {
        const membersWithId = (org.members || []).filter(m => m.discord_id);
        if (!membersWithId.length) continue;

        // Find the local bot guild record via site_org_id
        const localGuild = org.id ? db.prepare('SELECT id FROM Guilds WHERE site_org_id = ?').get(org.id) : null;

        // Find the guild name role (role named after the org)
        let nameRole = interaction.guild.roles.cache.find(r => r.name === org.name);
        if (!nameRole) {
            await interaction.guild.roles.fetch().catch(() => null);
            nameRole = interaction.guild.roles.cache.find(r => r.name === org.name);
        }
        if (!nameRole) {
            nameRole = await interaction.guild.roles.create({
                name: org.name,
                reason: `VVLeague /rolesync: auto-create role for ${org.name}`,
            }).catch(() => null);
        }

        for (const m of membersWithId) {
            try {
                const guildMember = await interaction.guild.members.fetch(m.discord_id).catch(() => null);
                if (!guildMember) { skipped++; continue; }

                let changed = false;

                // Assign guild name role if missing
                if (nameRole && !guildMember.roles.cache.has(nameRole.id)) {
                    await guildMember.roles.add(nameRole).catch(() => null);
                    changed = true;
                }

                // Assign generic org Discord role if configured and missing
                if (org.discord_role_id && !guildMember.roles.cache.has(org.discord_role_id)) {
                    await guildMember.roles.add(org.discord_role_id).catch(() => null);
                    changed = true;
                }

                // Assign positional role (leader / co-leader / manager) from local bot DB
                if (m.role === 'Leader') {
                    const leaderRoleId = getSetting(db, `${interaction.guildId}_guild_leader_role_id`);
                    if (leaderRoleId && !guildMember.roles.cache.has(leaderRoleId)) {
                        await guildMember.roles.add(leaderRoleId).catch(() => null);
                        changed = true;
                    }
                }

                // Sync to local bot guild DB (skip Leader — stored in Guilds.leaderId)
                if (localGuild && m.role !== 'Leader') {
                    if (m.role === 'Sub') {
                        db.prepare('INSERT OR IGNORE INTO SubRosters (guildId, userId) VALUES (?, ?)').run(localGuild.id, m.discord_id);
                    } else {
                        // Player, Coach, etc.
                        db.prepare('INSERT OR IGNORE INTO MainRosters (guildId, userId) VALUES (?, ?)').run(localGuild.id, m.discord_id);
                    }
                }

                changed ? synced++ : skipped++;
            }
            catch {
                errors++;
            }
        }
        // Refresh the guild panel so new members appear in guild-registered
        if (localGuild) {
            await refreshGuildPanel(interaction.client, db, localGuild.id).catch(() => null);
        }
    }

    await interaction.editReply(
        `✅ Role sync complete.\n` +
        `**${synced}** member(s) updated · **${skipped}** already in sync · **${errors}** error(s).`
    );
}
//# sourceMappingURL=rolesync.js.map
