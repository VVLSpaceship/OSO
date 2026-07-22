import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllCooldowns, getSetting, getCooldownMultiplier } from '../database.js';

export const data = new SlashCommandBuilder()
    .setName('cooldown')
    .setDescription('View all players currently on a signing cooldown');

export async function execute(interaction, db) {
    const staffRoleId = interaction.guildId ? getSetting(db, `${interaction.guildId}_staff_role_id`) : null;
    const isAdmin = interaction.memberPermissions?.has('Administrator');
    const isStaff = staffRoleId && interaction.member?.roles?.cache?.has(staffRoleId);
    if (!isAdmin && !isStaff) {
        await interaction.editReply({ content: '❌ Only staff can use this command.' });
        return;
    }

    const cooldownDays = interaction.guildId
        ? parseInt(getSetting(db, `${interaction.guildId}_signing_cooldown_days`) || '0')
        : 0;
    const cooldownUnit = interaction.guildId
        ? (getSetting(db, `${interaction.guildId}_signing_cooldown_unit`) || 'days')
        : 'days';

    const rows = getAllCooldowns(db);

    if (rows.length === 0) {
        await interaction.editReply({ content: '✅ No players are currently on a signing cooldown.' });
        return;
    }

    const now = Date.now();
    const lines = [];

    for (const row of rows) {
        const releasedAt = new Date(row.released_at);
        if (cooldownDays > 0) {
            const expiresAt = new Date(releasedAt.getTime() + cooldownDays * getCooldownMultiplier(cooldownUnit));
            if (now >= expiresAt.getTime()) continue; // cooldown already expired
            const expiresTs = Math.floor(expiresAt.getTime() / 1000);
            const guildDisplay = row.guild_name ? `**${row.guild_name}**` : '*Unknown guild*';
            lines.push(`<@${row.discord_id}> — left ${guildDisplay} — expires <t:${expiresTs}:R>`);
        } else {
            // Cooldown disabled — still show the list with release date
            const releasedTs = Math.floor(releasedAt.getTime() / 1000);
            const guildDisplay = row.guild_name ? `**${row.guild_name}**` : '*Unknown guild*';
            lines.push(`<@${row.discord_id}> — left ${guildDisplay} — released <t:${releasedTs}:D>`);
        }
    }

    if (lines.length === 0) {
        await interaction.editReply({ content: '✅ No players are currently on an active signing cooldown.' });
        return;
    }

    const unitLabel = cooldownUnit === 'minutes' ? 'minute(s)' : cooldownUnit === 'hours' ? 'hour(s)' : 'day(s)';
    const cooldownLabel = cooldownDays > 0 ? `${cooldownDays} ${unitLabel}` : 'Disabled';
    const embed = new EmbedBuilder()
        .setTitle('🕐 Signing Cooldowns')
        .setColor(0x5BADFF)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Cooldown duration: ${cooldownLabel}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
