import { SlashCommandBuilder, EmbedBuilder, ChannelType, } from 'discord.js';
import { getSetting } from './database.js';
import { createOrg, signMember, setOrgFounded } from './siteapi.js';
const GUILD_LEADER_ROLE_ID_DEFAULT = '1470554671944040605';
const ALLOWED_GUILD_CREATOR_ROLE_IDS_DEFAULT = [
    '1470554652264108204', // Head Moderator
    '1470554645364478016', // Founder
    '1470554648568926219', // Developer
];
const GUILD_FORUM_CHANNEL_ID_DEFAULT = '1470554848683364403';
export const data = new SlashCommandBuilder()
    .setName('guildregister')
    .setDescription('Registers a new competitive guild')
    .addStringOption(option => option
    .setName('tag')
    .setDescription('Guild tag (e.g. VVS) — max 5 chars')
    .setRequired(true))
    .addStringOption(option => option
    .setName('name')
    .setDescription('Guild name')
    .setRequired(true))
    .addUserOption(option => option
    .setName('leader')
    .setDescription('Guild leader')
    .setRequired(true))
    .addStringOption(option => option
    .setName('region')
    .setDescription('Guild region')
    .setRequired(true)
    .addChoices({ name: 'NA', value: 'NA' }, { name: 'EU', value: 'EU' }, { name: 'SA', value: 'SA' }, { name: 'ASIA', value: 'ASIA' }))
    .addStringOption(option => option
    .setName('season')
    .setDescription('Season the guild was founded in (e.g. S1, S2, S3)')
    .setRequired(false))
    .addStringOption(option => option
    .setName('color')
    .setDescription('Guild role color in HEX (e.g. #FF5733)')
    .setRequired(false));
export async function execute(interaction, db) {
    try {
        const guildId = interaction.guildId;
        if (!guildId) {
            await interaction.editReply({
                content: 'This command can only be used in a server.',
            });
            return;
        }
        const actorMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const isAdmin = !!actorMember?.permissions.has('Administrator');
        const configuredRegisterRole = getSetting(db, `${guildId}_guild_register_role_id`);
        const canCreateGuild = isAdmin || (!!actorMember && (configuredRegisterRole
            ? actorMember.roles.cache.has(configuredRegisterRole)
            : ALLOWED_GUILD_CREATOR_ROLE_IDS_DEFAULT.some(roleId => actorMember.roles.cache.has(roleId))));
        if (!canCreateGuild) {
            await interaction.editReply({
                content: '❌ You do not have permission to register a guild. Configure the role with `/setup guild_register_role`.',
            });
            return;
        }
        const tag = interaction.options.getString('tag', true).toUpperCase().slice(0, 5);
        const name = interaction.options.getString('name', true);
        const leader = interaction.options.getUser('leader', true);
        const region = interaction.options.getString('region', true);
        const season = interaction.options.getString('season')?.trim() || null;
        const colorInput = interaction.options.getString('color') ?? null;
        const hexColor = colorInput ? colorInput.trim().toUpperCase() : null;
        if (hexColor && !/^#[0-9A-F]{6}$/.test(hexColor)) {
            await interaction.editReply({ content: '❌ Invalid color. Use HEX format, e.g. `#FF5733`.' });
            return;
        }
        // Check whether guild name or tag is already registered
        const existingGuild = db.prepare('SELECT id FROM Guilds WHERE name = ? OR tag = ?').get(name, tag);
        if (existingGuild) {
            await interaction.editReply({
                content: `⚠️ A guild with name **${name}** or tag **[${tag}]** is already registered.`,
            });
            return;
        }
        // Register guild on site first to catch duplicate tags before Discord role creation
        let siteOrgId = null;
        try {
            const orgResult = await createOrg(tag, name, region, null, season);
            siteOrgId = orgResult?.id ?? null;
            if (season && tag) {
                await setOrgFounded(tag, season).catch(e => console.warn('Failed to set org founded:', e?.message));
            }
        }
        catch (e) {
            if (e?.message === 'Tag already exists') {
                await interaction.editReply({ content: `❌ A guild with tag **[${tag}]** already exists on the site.` });
                return;
            }
            console.warn('Failed to register guild on site (continuing):', e?.message);
        }
        // Generate unique guild ID
        const guildUid = `${guildId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Insert guild in database
        db.prepare(`INSERT INTO Guilds (id, name, leaderId, coLeaderId, imageUrl, region, tag, site_org_id, elo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(guildUid, name, leader.id, null, null, region, tag, siteOrgId);
        // Add guild leader to site as member
        if (siteOrgId) {
            try {
                await signMember(siteOrgId, leader.id, leader.username, 'Leader');
            }
            catch (e) {
                console.warn('Failed to add guild leader to site:', e?.message);
            }
        }
        // Assign Guild Leader role and guild name role to leader
        if (interaction.guild) {
            try {
                const leaderRoleId = getSetting(db, `${guildId}_guild_leader_role_id`) || GUILD_LEADER_ROLE_ID_DEFAULT;
                const fixedLeaderRole = interaction.guild.roles.cache.get(leaderRoleId)
                    || (await interaction.guild.roles.fetch(leaderRoleId).catch(() => null));
                const member = await interaction.guild.members.fetch(leader.id);
                if (fixedLeaderRole) {
                    await member.roles.add(fixedLeaderRole);
                }
                else {
                    console.warn(`Guild Leader role not found in guild ${interaction.guild.id}. Configure with /setup guild_leader_role.`);
                }
            }
            catch (e) {
                console.error('Failed to assign fixed Guild Leader role:', e);
            }
            // Assign guild name role (create if it doesn't exist, apply color if provided)
            try {
                const roleColor = hexColor ? parseInt(hexColor.slice(1), 16) : undefined;
                let nameRole = interaction.guild.roles.cache.find(r => r.name === name);
                if (!nameRole) {
                    nameRole = await interaction.guild.roles.create({
                        name,
                        color: roleColor,
                        reason: `VVLeague: role for guild ${name}`,
                    }).catch(() => null);
                }
                else if (roleColor !== undefined) {
                    await nameRole.edit({ color: roleColor }).catch(() => null);
                }
                if (nameRole) {
                    const leaderMember = await interaction.guild.members.fetch(leader.id).catch(() => null);
                    if (leaderMember) await leaderMember.roles.add(nameRole).catch(() => null);
                }
            }
            catch (e) {
                console.warn('Failed to assign guild name role:', e?.message);
            }
        }
        // Fetch members from database
        const managersFromDb = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildUid);
        const mainsFromDb = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildUid);
        const subsFromDb = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildUid);
        // Build embed description
        let description = `# ${name}\n\n`;
        description += `### 👑 Leader\n<@${leader.id}>\n`;
        description += `### ⭐ Co-Leader\nNone\n`;
        if (managersFromDb.length > 0) {
            description += `**Managers**\n`;
            description += managersFromDb.map((m) => `<@${m.userId}>`).join(' ') + '\n\n';
        }
        else {
            description += `**Managers**\nNone\n\n`;
        }
        description += `:globe_with_meridians: **Region Stats: ${region}**\n`;
        description += `**Regions:** ${region}\n`;
        description += `:signal_strength: **W/L:** 0/0\n`;
        description += `:bar_chart: **ELO:** 0\n`;
        description += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        description += `:crossed_swords: **Main Roster (${region})**\n`;
        if (mainsFromDb.length > 0) {
            description += mainsFromDb.map((m) => `<@${m.userId}>`).join('\n') + '\n\n';
        }
        else {
            description += 'None\n\n';
        }
        description += `:dagger: **Sub Roster (${region})**\n`;
        if (subsFromDb.length > 0) {
            description += subsFromDb.map((s) => `<@${s.userId}>`).join('\n');
        }
        else {
            description += 'None';
        }
        // Build panel embed for public channel
        const embed = new EmbedBuilder()
            .setDescription(description)
            .setColor(0x5BADFF)
            .setThumbnail(interaction.guild?.iconURL() || null);
        // Send panel embed in specific channel (Forum or Text)
        const channelId = getSetting(db, `${guildId}_guild_forum_channel_id`) || GUILD_FORUM_CHANNEL_ID_DEFAULT;
        const channel = (await interaction.client.channels.fetch(channelId).catch(() => null));
        console.log('Channel found:', !!channel, channel?.name, channel?.type);
        console.log('Has threads?', !!channel?.threads);
        if (channel && channel.type === ChannelType.GuildForum) {
            try {
                console.log('Creating forum thread for guild:', name);
                const thread = await channel.threads.create({
                    name: `🏰 ${name}`,
                    message: {
                        embeds: [embed],
                    },
                    autoArchiveDuration: 10080, // 7 days
                });
                console.log('Thread created:', thread.id, thread.name);
                db.prepare('UPDATE Guilds SET panelMessageId = ?, panelChannelId = ? WHERE id = ?').run(thread.id, channel.id, guildUid);
            }
            catch (e) {
                console.error('Error creating forum thread or sending message:', e);
            }
        }
        else if (channel && channel.threads && typeof channel.threads.create === 'function') {
            try {
                console.log('Creating text-channel thread for guild:', name);
                const thread = await channel.threads.create({
                    name: `🏰 ${name}`,
                    autoArchiveDuration: 10080, // 7 days
                });
                const panelMessage = await thread.send({ embeds: [embed] });
                db.prepare('UPDATE Guilds SET panelMessageId = ?, panelChannelId = ? WHERE id = ?').run(panelMessage.id, thread.id, guildUid);
            }
            catch (e) {
                console.error('Error creating text-channel thread or sending message:', e);
            }
        }
        else {
            console.error('Channel not found or does not support threads');
        }
        await interaction.editReply({
            content: `✅ Guild **${name}** registered successfully!`,
        });
    }
    catch (error) {
        console.error('Error registering guild:', error);
        await interaction.editReply({
            content: '❌ An unexpected error occurred while processing your request.',
        });
    }
}
//# sourceMappingURL=guildregister.js.map