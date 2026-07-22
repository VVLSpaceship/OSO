import { SlashCommandBuilder, ChannelType, EmbedBuilder, } from 'discord.js';
import { setSetting } from '../database.js';
export const data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure all bot settings for this server in one command')
    // Roles
    .addRoleOption(o => o.setName('staff_role')
    .setDescription('Role with full power (administration)')
    .setRequired(false))
    .addRoleOption(o => o.setName('hoster_role')
    .setDescription('Hoster role')
    .setRequired(false))
    .addRoleOption(o => o.setName('guild_leader_role')
    .setDescription('Guild Leader role')
    .setRequired(false))
    .addRoleOption(o => o.setName('guild_co_leader_role')
    .setDescription('Guild Co-Leader role')
    .setRequired(false))
    .addRoleOption(o => o.setName('guild_manager_role')
    .setDescription('Guild Manager role')
    .setRequired(false))
    .addRoleOption(o => o.setName('guild_register_role')
    .setDescription('Role that can register a Guild')
    .setRequired(false))
    .addRoleOption(o => o.setName('guild_delete_role')
    .setDescription('Role that can delete a Guild')
    .setRequired(false))
    .addRoleOption(o => o.setName('guild_member_role')
    .setDescription('Generic role given to all guild members — allows /release to work even if not in bot DB')
    .setRequired(false))
    // Channels
    .addChannelOption(o => o.setName('ticket_category')
    .setDescription('Category where wager/war tickets will be opened')
    .addChannelTypes(ChannelType.GuildCategory)
    .setRequired(false))
    .addChannelOption(o => o.setName('wager_panel_channel')
    .setDescription('Channel where the Wager panel is posted')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('war_panel_channel')
    .setDescription('Channel where the War panel is posted')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('wager_dodge_channel')
    .setDescription('Wager dodge log channel')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('war_dodge_channel')
    .setDescription('War dodge log channel')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('wager_log_channel')
    .setDescription('Wager results/wins log channel')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('war_log_channel')
    .setDescription('War results/wins log channel')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('guild_forum_channel')
    .setDescription('Forum channel where Guilds are registered')
    .addChannelTypes(ChannelType.GuildForum)
    .setRequired(false))
    .addChannelOption(o => o.setName('signing_log_channel')
    .setDescription('Admin channel where signing/removal requests go for approval')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('signings_announce_channel')
    .setDescription('Public channel where approved signings are announced')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('signing_cooldown_notify_channel')
    .setDescription('Channel where players are pinged when their signing cooldown expires')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('dodge_notify_channel')
    .setDescription('Channel where guilds are pinged when their dodge grace period expires')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addChannelOption(o => o.setName('invite_category')
    .setDescription('Category where private invite channels are created (when DMs are disabled)')
    .addChannelTypes(ChannelType.GuildCategory)
    .setRequired(false))
    .addChannelOption(o => o.setName('release_log_channel')
    .setDescription('Channel where release/kick logs are posted')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false))
    .addIntegerOption(o => o.setName('signing_cooldown_days')
    .setDescription('How long a player must wait before being signed after leaving a guild (0 = disabled)')
    .setMinValue(0)
    .setMaxValue(365)
    .setRequired(false))
    .addStringOption(o => o.setName('signing_cooldown_unit')
    .setDescription('Unit for the signing cooldown duration (default: days)')
    .setRequired(false)
    .addChoices(
        { name: 'Minutes (testing)', value: 'minutes' },
        { name: 'Hours', value: 'hours' },
        { name: 'Days', value: 'days' }
    ))
    .addIntegerOption(o => o.setName('dodge_grace_minutes')
    .setDescription('Dodge grace period duration in minutes (default: 5)')
    .setMinValue(1)
    .setMaxValue(10080)
    .setRequired(false));
export async function execute(interaction, db) {
    if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.editReply({ content: '❌ Only administrators can use this command.', embeds: [] });
        return;
    }
    const guildId = interaction.guildId;
    const saved = [];
    const skipped = [];
    function save(key, value, label, display) {
        if (value) {
            setSetting(db, `${guildId}_${key}`, value);
            saved.push(`✅ **${label}** → ${display}`);
        }
        else {
            skipped.push(`— ${label}`);
        }
    }
    // Roles
    const staffRole = interaction.options.getRole('staff_role');
    save('staff_role_id', staffRole?.id ?? null, 'Staff Role', staffRole ? `<@&${staffRole.id}>` : '');
    const hosterRole = interaction.options.getRole('hoster_role');
    save('hoster_role_id', hosterRole?.id ?? null, 'Hoster Role', hosterRole ? `<@&${hosterRole.id}>` : '');
    const leaderRole = interaction.options.getRole('guild_leader_role');
    save('guild_leader_role_id', leaderRole?.id ?? null, 'Guild Leader', leaderRole ? `<@&${leaderRole.id}>` : '');
    const coLeaderRole = interaction.options.getRole('guild_co_leader_role');
    save('guild_co_leader_role_id', coLeaderRole?.id ?? null, 'Guild Co-Leader', coLeaderRole ? `<@&${coLeaderRole.id}>` : '');
    const managerRole = interaction.options.getRole('guild_manager_role');
    save('guild_manager_role_id', managerRole?.id ?? null, 'Guild Manager', managerRole ? `<@&${managerRole.id}>` : '');
    const registerRole = interaction.options.getRole('guild_register_role');
    save('guild_register_role_id', registerRole?.id ?? null, 'Guild Register Role', registerRole ? `<@&${registerRole.id}>` : '');
    const deleteRole = interaction.options.getRole('guild_delete_role');
    save('guild_delete_role_id', deleteRole?.id ?? null, 'Guild Delete Role', deleteRole ? `<@&${deleteRole.id}>` : '');
    const memberRole = interaction.options.getRole('guild_member_role');
    save('guild_member_role_id', memberRole?.id ?? null, 'Guild Member Role', memberRole ? `<@&${memberRole.id}>` : '');
    // Ticket category (sets both wager and war category)
    const ticketCategory = interaction.options.getChannel('ticket_category');
    if (ticketCategory) {
        setSetting(db, `${guildId}_wager_category_id`, ticketCategory.id);
        setSetting(db, `${guildId}_war_category_id`, ticketCategory.id);
        saved.push(`✅ **Ticket Category** → ${ticketCategory.name}`);
    }
    else {
        skipped.push('— Ticket Category');
    }
    // Panel channels
    const wagerPanel = interaction.options.getChannel('wager_panel_channel');
    save('wager_channel_id', wagerPanel?.id ?? null, 'Wager Panel Channel', wagerPanel ? `<#${wagerPanel.id}>` : '');
    const warPanel = interaction.options.getChannel('war_panel_channel');
    save('war_channel_id', warPanel?.id ?? null, 'War Panel Channel', warPanel ? `<#${warPanel.id}>` : '');
    // Dodge channels
    const wagerDodge = interaction.options.getChannel('wager_dodge_channel');
    save('wager_dodge_channel_id', wagerDodge?.id ?? null, 'Wager Dodge Channel', wagerDodge ? `<#${wagerDodge.id}>` : '');
    const warDodge = interaction.options.getChannel('war_dodge_channel');
    save('war_dodge_channel_id', warDodge?.id ?? null, 'War Dodge Channel', warDodge ? `<#${warDodge.id}>` : '');
    // Log/victory channels
    const wagerLog = interaction.options.getChannel('wager_log_channel');
    save('wager_log_channel_id', wagerLog?.id ?? null, 'Wager Log Channel', wagerLog ? `<#${wagerLog.id}>` : '');
    const warLog = interaction.options.getChannel('war_log_channel');
    save('war_log_channel_id', warLog?.id ?? null, 'War Log Channel', warLog ? `<#${warLog.id}>` : '');
    // Guild forum
    const guildForum = interaction.options.getChannel('guild_forum_channel');
    save('guild_forum_channel_id', guildForum?.id ?? null, 'Guild Forum', guildForum ? `<#${guildForum.id}>` : '');
    // Signing log / approval channel
    const signingLog = interaction.options.getChannel('signing_log_channel');
    save('signing_log_channel_id', signingLog?.id ?? null, 'Signing Log Channel', signingLog ? `<#${signingLog.id}>` : '');
    // Public signings announcement channel
    const signingsAnnounce = interaction.options.getChannel('signings_announce_channel');
    save('signings_announce_channel_id', signingsAnnounce?.id ?? null, 'Signings Announce Channel', signingsAnnounce ? `<#${signingsAnnounce.id}>` : '');
    // Signing cooldown expiry notification channel
    const cooldownNotifyCh = interaction.options.getChannel('signing_cooldown_notify_channel');
    save('signing_cooldown_notify_channel_id', cooldownNotifyCh?.id ?? null, 'Cooldown Notify Channel', cooldownNotifyCh ? `<#${cooldownNotifyCh.id}>` : '');
    // Dodge grace period expiry notification channel
    const dodgeNotifyCh = interaction.options.getChannel('dodge_notify_channel');
    save('dodge_notify_channel_id', dodgeNotifyCh?.id ?? null, 'Dodge Notify Channel', dodgeNotifyCh ? `<#${dodgeNotifyCh.id}>` : '');
    // Invite channels category
    const inviteCategory = interaction.options.getChannel('invite_category');
    save('invite_category_id', inviteCategory?.id ?? null, 'Invite Category', inviteCategory ? inviteCategory.name : '');
    // Release / kick log channel
    const releaseLogCh = interaction.options.getChannel('release_log_channel');
    save('release_log_channel_id', releaseLogCh?.id ?? null, 'Release Log Channel', releaseLogCh ? `<#${releaseLogCh.id}>` : '');
    // Signing cooldown
    const cooldownDays = interaction.options.getInteger('signing_cooldown_days');
    const cooldownUnit = interaction.options.getString('signing_cooldown_unit');
    if (cooldownDays !== null) {
        setSetting(db, `${guildId}_signing_cooldown_days`, String(cooldownDays));
        const unitLabel = cooldownUnit === 'minutes' ? 'minute(s)' : cooldownUnit === 'hours' ? 'hour(s)' : 'day(s)';
        saved.push(`✅ **Signing Cooldown** → ${cooldownDays === 0 ? 'Disabled' : `${cooldownDays} ${unitLabel}`}`);
    } else { skipped.push('— Signing Cooldown'); }
    if (cooldownUnit) {
        setSetting(db, `${guildId}_signing_cooldown_unit`, cooldownUnit);
        if (cooldownDays === null) saved.push(`✅ **Signing Cooldown Unit** → ${cooldownUnit}`);
    } else if (cooldownDays === null) { skipped.push('— Signing Cooldown Unit'); }
    // Dodge grace period duration
    const graceMinutes = interaction.options.getInteger('dodge_grace_minutes');
    if (graceMinutes !== null) {
        setSetting(db, `${guildId}_dodge_grace_minutes`, String(graceMinutes));
        saved.push(`✅ **Dodge Grace Period** → ${graceMinutes >= 60 ? `${Math.round(graceMinutes / 60)} hour(s)` : `${graceMinutes} minute(s)`}`);
    } else { skipped.push('— Dodge Grace Period'); }
    if (saved.length === 0) {
        await interaction.editReply({ content: '⚠️ No settings provided. Use the command options to configure the server.', embeds: [] });
        return;
    }
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Server Configuration')
        .setColor(0x5BADFF)
        .setTimestamp();
    if (saved.length > 0) {
        embed.addFields({ name: '✅ Saved settings', value: saved.join('\n') });
    }
    if (skipped.length > 0) {
        embed.addFields({ name: '— Not configured this call', value: skipped.join('\n') });
    }
    await interaction.editReply({ content: '', embeds: [embed] });
}
//# sourceMappingURL=setup.js.map
