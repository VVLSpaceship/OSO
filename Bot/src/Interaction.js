import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder, EmbedBuilder, ModalBuilder, MessageFlags, OverwriteType, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextInputBuilder, TextInputStyle, TextDisplayBuilder, UserSelectMenuBuilder, } from 'discord.js';
import { loadCommands } from './commands.js';
import { addMemberToRole, addGuildLoss, addGuildWin, acceptWar, canAddUserToRole, createWar, createInvite, dodgeWar, finishWar, getGuildById, getInviteById, getMembersByRole, getPendingInviteForTarget, getRoleLabel, isUserInRole, refreshGuildPanel, removeMemberFromRole, setInviteStatus, setInviteAdminProcessed, validateInviteForAction, getWarById, createWager, getWagerById, getActiveWagerForUser, recordWagerAcceptance, markWagerAccepted, dodgeWager, closeWager, getSetting, applyGuildElo, applyPlayerElo, setCooldown, isOnCooldown, getCooldown, getCooldownMultiplier, initPlayerCollection, getPlayerCollection, setCollectionPlayers, setPlayerCollectionMsgId, initWagerAmountCollection, getWagerAmountCollection, getWagerAmountCollectionByChannel, setWagerAmount, resetWagerAmount, confirmWagerTeam, setWagerRules, getWagerCollectionByChannelForBan, setWagerBan, resetWagerBan, startWagerBanCollection, confirmWagerBanTeam, recordRulesVote, recordGuildDodge, getGuildActiveDodge, setInviteTempChannel, isUserInGuildAnyRole, } from './database.js';
const ADD_ACTION_MAP = {
    ADD_CO_LEADER: 'CO_LEADER',
    ADD_MANAGER: 'MANAGER',
    ADD_MAIN: 'MAIN',
    ADD_SUB: 'SUB',
};
const FIXED_ROLE_IDS = {
    GUILD_LEADER: '1470554671944040605',
    GUILD_CO_LEADER: '1470554673038496018',
    MANAGER_GUILD: '1470554674435326146',
};
const PANEL_ADMIN_ROLE_IDS = [
    '1470554645364478016',
    '1470554652264108204',
    '1470554648568926219',
];
const WAR_ROLE_IDS = {
    GUILD_LEADER: '1470554671944040605',
    GUILD_CO_LEADER: '1470554673038496018',
    MANAGER_GUILD: '1470554674435326146',
    HOSTER: '1470554662687215741',
    JUNIOR_HOSTER: '1470554664238845962',
    EVENT_HOSTER: '1471561698556121122',
};
const WAR_LOGS_CHANNEL_ID = '1470554839447638088';
const WAR_DODGE_LOGS_CHANNEL_ID = '1473408078358642759';
const WAR_TICKET_PANEL_CHANNEL_ID = '1473103963112083466';
const WAR_TICKETS_CATEGORY_ID = '1485410543824277656';
const WAGER_TICKET_PANEL_CHANNEL_ID = '1470554825501704345';
const WAGER_LOGS_CHANNEL_ID = '1470554840814977247';
const WAGER_DODGE_LOGS_CHANNEL_ID = '1473407994535346177';
const WAGER_TICKETS_CATEGORY_ID = '1473059718250631420';
function getGuildForWarStarter(db, userId) {
    let guild = db
        .prepare('SELECT * FROM Guilds WHERE leaderId = ? OR coLeaderId = ? ORDER BY createdAt ASC LIMIT 1')
        .get(userId, userId);
    if (!guild) {
        guild = db
            .prepare(`SELECT g.*
         FROM Guilds g
         INNER JOIN Managers m ON m.guildId = g.id
         WHERE m.userId = ?
         ORDER BY g.createdAt ASC
         LIMIT 1`)
            .get(userId);
    }
    return guild || null;
}
function getGuildRoleInWar(guild, userId) {
    if (!guild)
        return null;
    if (guild.leaderId === userId)
        return 'LEADER';
    if (guild.coLeaderId === userId)
        return 'CO_LEADER';
    return null;
}
function getGuildRosterAndStaffIds(db, guildId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return [];
    const ids = new Set();
    if (guild.leaderId)
        ids.add(guild.leaderId);
    if (guild.coLeaderId)
        ids.add(guild.coLeaderId);
    const managers = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId);
    const mains = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId);
    const subs = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId);
    for (const row of managers)
        if (row?.userId)
            ids.add(row.userId);
    for (const row of mains)
        if (row?.userId)
            ids.add(row.userId);
    for (const row of subs)
        if (row?.userId)
            ids.add(row.userId);
    return Array.from(ids);
}
function sanitizeWarChannelName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
}
async function createWarTicketChannel(interaction, db, guildA, guildB) {
    const discordGuild = interaction.guild;
    if (!discordGuild)
        return null;
    const warCategoryId = getSetting(db, `${interaction.guildId}_war_category_id`) || WAR_TICKETS_CATEGORY_ID;
    const warCategory = await interaction.client.channels.fetch(warCategoryId).catch(() => null);
    if (!warCategory || warCategory.type !== ChannelType.GuildCategory) {
        console.error(`War category ${warCategoryId} not found or invalid.`);
        return null;
    }
    const memberIds = new Set([
        ...getGuildRosterAndStaffIds(db, guildA.id),
        ...getGuildRosterAndStaffIds(db, guildB.id),
    ]);
    const permissionOverwrites = [
        {
            id: discordGuild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionFlagsBits.ViewChannel],
        },
    ];
    for (const hosterRoleId of getHosterRoleIds(db, interaction.guildId)) {
        const hosterRole = discordGuild.roles.cache.get(hosterRoleId)
            || (await discordGuild.roles.fetch(hosterRoleId).catch(() => null));
        if (hosterRole) {
            permissionOverwrites.push({
                id: hosterRole.id,
                type: OverwriteType.Role,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            });
        }
    }
    for (const memberId of memberIds) {
        const member = await discordGuild.members.fetch(memberId).catch(() => null);
        if (!member)
            continue;
        permissionOverwrites.push({
            id: member.id,
            type: OverwriteType.Member,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
    }
    const channelName = sanitizeWarChannelName(`${guildA.name} vs ${guildB.name}`);
    const channel = await discordGuild.channels
        .create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: warCategoryId,
        permissionOverwrites,
    })
        .catch((error) => {
        console.error('Failed to create war ticket channel:', error);
        return null;
    });
    if (!channel)
        return null;
    const warConfirmationContainer = new ContainerBuilder()
        .setAccentColor(0x5BADFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚔️ War Confirmation\nWar between: **${guildA.name}** vs **${guildB.name}**`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('\nℹ️ Waiting for confirmation from the opponent team (Leader/Co-leader).\n\nUse the buttons below:\n• **Accept War** — confirm the war\n• **Dodge** — cancel the war'));
    const initialMessage = await channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: [warConfirmationContainer],
    }).catch((error) => {
        console.error('Failed to send war ticket message:', error);
        return null;
    });
    if (!initialMessage) {
        await channel.delete('Failed to initialize war ticket message').catch(() => null);
        return null;
    }
    const warId = createWar(db, guildA.id, guildB.id, channel.id, interaction.user.id, initialMessage.id);
    const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`wt_accept|${warId}`)
        .setLabel('Accept War')
        .setStyle(ButtonStyle.Success), new ButtonBuilder()
        .setCustomId(`wt_dodge|${warId}`)
        .setLabel('Dodge')
        .setStyle(ButtonStyle.Danger));
    await initialMessage.edit({
        components: [warConfirmationContainer, actionRow],
    }).catch((error) => {
        console.error('Failed to add war ticket buttons:', error);
    });
    return channel;
}
function getDiscordRoleIdForRoleType(roleType, db, discordGuildId) {
    if (roleType === 'CO_LEADER') {
        return (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_co_leader_role_id`) : null) || FIXED_ROLE_IDS.GUILD_CO_LEADER;
    }
    if (roleType === 'MANAGER') {
        return (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_manager_role_id`) : null) || FIXED_ROLE_IDS.MANAGER_GUILD;
    }
    return null;
}
function getDiscordGuildIdFromInternalGuildId(guildId) {
    const directSnowflake = /^\d{17,20}$/;
    if (directSnowflake.test(guildId))
        return guildId;
    const prefixedSnowflake = /^(\d{17,20})-/;
    const match = guildId.match(prefixedSnowflake);
    if (match?.[1])
        return match[1];
    return guildId;
}
async function assignDiscordRoleById(client, guildId, targetUserId, roleId) {
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
        console.warn(`Guild ${guildId} not found while assigning role ${roleId}.`);
        return false;
    }
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
        console.warn(`Role ${roleId} not found in guild ${guild.id}.`);
        return false;
    }
    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member) {
        console.warn(`Member ${targetUserId} not found in guild ${guild.id}.`);
        return false;
    }
    const added = await member.roles.add(role).catch((error) => {
        console.warn(`Failed to add role ${roleId} to ${targetUserId}:`, error);
        return null;
    });
    return !!added;
}
function shouldKeepRoleForUser(db, userId, roleType) {
    if (roleType === 'CO_LEADER') {
        const row = db.prepare('SELECT COUNT(*) as count FROM Guilds WHERE coLeaderId = ?').get(userId);
        return (row?.count || 0) > 0;
    }
    if (roleType === 'MANAGER') {
        const row = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE userId = ?').get(userId);
        return (row?.count || 0) > 0;
    }
    return true;
}
async function maybeRemoveDiscordRoleByType(interaction, db, targetUserId, roleType) {
    const guild = interaction.guild;
    if (!guild)
        return;
    const roleId = getDiscordRoleIdForRoleType(roleType, db, interaction.guildId ?? undefined);
    if (!roleId)
        return;
    if (shouldKeepRoleForUser(db, targetUserId, roleType))
        return;
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role)
        return;
    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member)
        return;
    await member.roles.remove(role).catch((error) => {
        console.warn(`Failed to remove role ${roleId} from ${targetUserId}:`, error);
    });
}
async function removeGuildNameRole(client, discordGuildId, dbGuild, targetUserId) {
    if (!discordGuildId || !dbGuild?.name)
        return;
    try {
        const discordGuild = client.guilds.cache.get(discordGuildId) || await client.guilds.fetch(discordGuildId).catch(() => null);
        if (!discordGuild)
            return;
        const nameRole = discordGuild.roles.cache.find(r => r.name === dbGuild.name);
        if (!nameRole)
            return;
        const member = await discordGuild.members.fetch(targetUserId).catch(() => null);
        if (member)
            await member.roles.remove(nameRole).catch(() => null);
    }
    catch (e) {
        console.warn(`Failed to remove guild name role "${dbGuild.name}" from ${targetUserId}:`, e?.message);
    }
}
function parseCustomId(customId) {
    return customId.split('|');
}
function parseWarScore(value) {
    if (value === '2-1')
        return { winnerScore: 2, loserScore: 1 };
    if (value === '3-0')
        return { winnerScore: 3, loserScore: 0 };
    const m = value?.trim().match(/^(\d+)\s*[-—]\s*(\d+)$/);
    if (m)
        return { winnerScore: parseInt(m[1]), loserScore: parseInt(m[2]) };
    return null;
}
function parseRoundDowns(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const normalized = trimmed
        .replace(/[xX:,/|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    const match = normalized.match(/^(\d+)-(\d+)$/);
    if (!match)
        return null;
    const winnerDowns = Number(match[1]);
    const loserDowns = Number(match[2]);
    if (!Number.isFinite(winnerDowns) || !Number.isFinite(loserDowns))
        return null;
    if (winnerDowns < 0 || loserDowns < 0)
        return null;
    return { winnerDowns, loserDowns };
}
function formatMvpValue(rawValue) {
    const value = (rawValue || '').trim();
    if (!value)
        return 'not provided';
    const mentionMatch = value.match(/^<@!?(\d{17,20})>$/);
    if (mentionMatch)
        return `<@${mentionMatch[1]}>`;
    const idMatch = value.match(/^(\d{17,20})$/);
    if (idMatch)
        return `<@${idMatch[1]}>`;
    return value;
}
function buildWarLogsContainer(winnerDisplay, loserDisplay, winnerScore, loserScore, clipsLink, roundDowns = null, mvpValue = null, roundSummary = null) {
    const details = roundSummary && roundSummary.trim()
        ? roundSummary.trim()
        : '*This is where the stats of the game go, and extra details.*';
    return new ContainerBuilder()
        .setAccentColor(0x5BADFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# ⚔️ War Logs\n${winnerDisplay} vs ${loserDisplay}\n-# Final Score: ${winnerScore} — ${loserScore}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📋 Round Details\n${details}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `🏆 ${winnerDisplay} **WINS**\n-# 👑 MVP: ${formatMvpValue(mvpValue)}`
        ));
}
function buildWagerLogsContainer(title, teamA, teamB, details, footer) {
    return new ContainerBuilder()
        .setAccentColor(0x5BADFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 💰 Wager Logs\n\n## ${teamA} VS ${teamB}\n${title}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(details))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));
}
function formatWagerTeam(teamIds) {
    return teamIds
        .filter((v) => !!v)
        .map((id) => `<@${id}>`)
        .join(' + ');
}
function isValidClipLink(value) {
    return /^https?:\/\/\S+$/i.test(value);
}
function getHosterRoleIds(db, guildId) {
    if (db && guildId) {
        const configured = getSetting(db, `${guildId}_hoster_role_id`);
        if (configured)
            return [configured];
    }
    return [WAR_ROLE_IDS.HOSTER, WAR_ROLE_IDS.JUNIOR_HOSTER, WAR_ROLE_IDS.EVENT_HOSTER];
}
function canMemberFinalizeTicket(member, db, guildId) {
    if (!member)
        return false;
    const hosterIds = getHosterRoleIds(db, guildId);
    return hosterIds.some(id => member.roles.cache.has(id));
}
async function resolveMvpToUsername(client, raw) {
    if (!raw) return null;
    const mentionMatch = raw.match(/^<@!?(\d+)>$/);
    const userId = mentionMatch ? mentionMatch[1] : /^\d{15,20}$/.test(raw) ? raw : null;
    if (userId) {
        const user = await client.users.fetch(userId).catch(() => null);
        return user ? user.username : raw;
    }
    return raw;
}
async function finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, clipsLink, roundDowns = null, mvpValue = null, roundSummary = null) {
    const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
    addGuildWin(db, winnerGuildId);
    addGuildLoss(db, loserGuildId);
    finishWar(db, war.id, winnerGuildId, winnerScore, loserScore, clipsLink);
    await refreshGuildPanel(client, db, winnerGuildId).catch(() => { });
    await refreshGuildPanel(client, db, loserGuildId).catch(() => { });
    const winnerGuild = getGuildById(db, winnerGuildId);
    const loserGuild = getGuildById(db, loserGuildId);
    const warLogId = getSetting(db, `${interaction.guildId}_war_log_channel_id`) || WAR_LOGS_CHANNEL_ID;
    const warLogsChannel = await interaction.client.channels.fetch(warLogId).catch(() => null);
    if (warLogsChannel && warLogsChannel.isTextBased() && 'send' in warLogsChannel) {
        const winnerRole = interaction.guild?.roles.cache.find(r => r.name === winnerGuild?.name);
        const loserRole = interaction.guild?.roles.cache.find(r => r.name === loserGuild?.name);
        const winnerDisplay = winnerRole ? `<@&${winnerRole.id}>` : `**${winnerGuild?.name || 'Guild A'}**`;
        const loserDisplay = loserRole ? `<@&${loserRole.id}>` : `**${loserGuild?.name || 'Guild B'}**`;
        const allowedRoles = [winnerRole?.id, loserRole?.id].filter(Boolean);
        const resultContainer = buildWarLogsContainer(winnerDisplay, loserDisplay, winnerScore, loserScore, clipsLink, roundDowns, mvpValue, roundSummary);
        await warLogsChannel.send({
            flags: MessageFlags.IsComponentsV2,
            components: [resultContainer],
            allowedMentions: allowedRoles.length ? { roles: allowedRoles } : { parse: [] },
        });
    }
    return { winnerGuild, loserGuild };
}
function getGuildActorRole(db, guildId, userId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return null;
    if (guild.leaderId === userId)
        return 'LEADER';
    if (guild.coLeaderId === userId)
        return 'CO_LEADER';
    const isManager = !!db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (isManager)
        return 'MANAGER';
    return null;
}
function getGuildActorRoleFromDiscordRoles(member, db, discordGuildId) {
    if (!member)
        return null;
    const leaderRoleId = (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_leader_role_id`) : null) || FIXED_ROLE_IDS.GUILD_LEADER;
    const coLeaderRoleId = (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_co_leader_role_id`) : null) || FIXED_ROLE_IDS.GUILD_CO_LEADER;
    const managerRoleId = (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_manager_role_id`) : null) || FIXED_ROLE_IDS.MANAGER_GUILD;
    if (member.roles.cache.has(WAR_ROLE_IDS.GUILD_LEADER) || member.roles.cache.has(leaderRoleId))
        return 'LEADER';
    if (member.roles.cache.has(WAR_ROLE_IDS.GUILD_CO_LEADER) || member.roles.cache.has(coLeaderRoleId))
        return 'CO_LEADER';
    if (member.roles.cache.has(WAR_ROLE_IDS.MANAGER_GUILD) || member.roles.cache.has(managerRoleId))
        return 'MANAGER';
    return null;
}
async function getGuildActorRoleWithPanelAdmin(interaction, db, guildId, userId) {
    const actorRole = getGuildActorRole(db, guildId, userId);
    if (actorRole)
        return actorRole;
    const member = await interaction.guild?.members.fetch(userId).catch(() => null);
    const outerRole = getGuildActorRoleFromDiscordRoles(member, db, interaction.guildId ?? undefined);
    if (outerRole)
        return outerRole;
    const panelAdminRoleId = getSetting(db, `${interaction.guildId}_staff_role_id`);
    const isPanelAdmin = !!member && (panelAdminRoleId
        ? member.roles.cache.has(panelAdminRoleId)
        : PANEL_ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId)));
    if (isPanelAdmin)
        return 'LEADER';
    return null;
}
function canManageRoleType(actorRole, targetRoleType) {
    if (actorRole === 'LEADER')
        return true;
    if (actorRole === 'CO_LEADER')
        return true;
    if (actorRole === 'MANAGER') {
        return targetRoleType === 'MANAGER' || targetRoleType === 'MAIN' || targetRoleType === 'SUB';
    }
    return false;
}
function getManageableRoleTypes(actorRole) {
    if (actorRole === 'MANAGER')
        return ['MANAGER', 'MAIN', 'SUB'];
    return ['CO_LEADER', 'MANAGER', 'MAIN', 'SUB'];
}
function getRegisteredGuildMemberIds(db, guildId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return [];
    const ids = new Set();
    if (guild.leaderId)
        ids.add(guild.leaderId);
    if (guild.coLeaderId)
        ids.add(guild.coLeaderId);
    const managers = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId);
    const mains = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId);
    const subs = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId);
    for (const row of managers)
        if (row?.userId)
            ids.add(row.userId);
    for (const row of mains)
        if (row?.userId)
            ids.add(row.userId);
    for (const row of subs)
        if (row?.userId)
            ids.add(row.userId);
    return Array.from(ids);
}
function shouldKeepGuildLeaderRole(db, userId) {
    const row = db.prepare('SELECT COUNT(*) as count FROM Guilds WHERE leaderId = ?').get(userId);
    return (row?.count || 0) > 0;
}
async function maybeRemoveGuildLeaderDiscordRole(interaction, db, targetUserId) {
    const guild = interaction.guild;
    if (!guild)
        return;
    if (shouldKeepGuildLeaderRole(db, targetUserId))
        return;
    const roleId = getSetting(db, `${interaction.guildId}_guild_leader_role_id`) || FIXED_ROLE_IDS.GUILD_LEADER;
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role)
        return;
    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member)
        return;
    await member.roles.remove(role).catch((error) => {
        console.warn(`Failed to remove role ${roleId} from ${targetUserId}:`, error);
    });
}
async function canUseOwnershipTransfer(interaction, db, guildId, userId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return false;
    if (guild.leaderId === userId)
        return true;
    const member = await interaction.guild?.members.fetch(userId).catch(() => null);
    const panelAdminRoleId2 = getSetting(db, `${interaction.guildId}_staff_role_id`);
    return !!member && (panelAdminRoleId2
        ? member.roles.cache.has(panelAdminRoleId2)
        : PANEL_ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId)));
}
async function replyPermissionError(interaction, message = '❌ You do not have permission to use this panel action.') {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
            content: message,
            components: [],
            embeds: [],
        });
        return;
    }
    await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral,
    });
}
function buildInviteDecisionRow(inviteId, roleType, discordGuildId = '') {
    const isRosterInvite = roleType === 'MAIN' || roleType === 'SUB';
    const acceptLabel = isRosterInvite ? 'Join Guild' : 'Accept';
    const declineLabel = isRosterInvite ? "Don't Join" : 'Decline';
    const guildSuffix = discordGuildId ? `|${discordGuildId}` : '';
    return new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_invite_accept|${inviteId}${guildSuffix}`)
        .setLabel(acceptLabel)
        .setStyle(ButtonStyle.Success), new ButtonBuilder()
        .setCustomId(`gp_invite_decline|${inviteId}${guildSuffix}`)
        .setLabel(declineLabel)
        .setStyle(ButtonStyle.Danger));
}
function getRoleInviteTitle(roleType) {
    if (roleType === 'CO_LEADER')
        return ':star: Co-Leader Invitation';
    if (roleType === 'MANAGER')
        return ':open_file_folder: Manager Invitation';
    return ':busts_in_silhouette: Guild Roster Invitation';
}
function buildInviteEmbed(roleType, guildName, inviterNick) {
    const embed = new EmbedBuilder().setColor(0x5BADFF).setTitle(getRoleInviteTitle(roleType));
    if (roleType === 'CO_LEADER') {
        return embed.setDescription(`You have been invited to become Co-Leader of the guild **"${guildName}"**.\n\n` +
            `As a co-leader, you will have access to manage rosters and help lead the guild.\n\n` +
            `**Guild:** ${guildName}\n` +
            `**Invited by:** ${inviterNick}\n\n` +
            `**Would you like to accept this invitation?**\n\n` +
            `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`);
    }
    if (roleType === 'MANAGER') {
        return embed.setDescription(`You have been invited to be a Manager of the guild **"${guildName}"**.\n\n` +
            `As a manager, you will be able to access and manage the guild panel.\n\n` +
            `**Guild:** ${guildName}\n` +
            `**Invited by:** ${inviterNick}\n\n` +
            `**Would you like to accept this invitation?**\n\n` +
            `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`);
    }
    const rosterLabel = roleType === 'MAIN' ? 'Main Roster' : 'Sub Roster';
    return embed.setDescription(`You have been invited to join the ${rosterLabel} of the guild **"${guildName}"**.\n\n` +
        `**Guild:** ${guildName}\n` +
        `**Roster:** ${rosterLabel}\n` +
        `**Invited by:** ${inviterNick}\n\n` +
        `**Would you like to accept this invitation?**\n\n` +
        `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`);
}
function buildRemovalEmbed(roleType, guildName) {
    return new EmbedBuilder()
        .setColor(0x5BADFF)
        .setTitle('❌ Role removed')
        .setDescription(`You are no longer part of **${getRoleLabel(roleType)}** in guild **${guildName}**.`);
}
function buildBackToPanelRow(guildId) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_back_panel|${guildId}`)
        .setLabel('Back to Panel')
        .setStyle(ButtonStyle.Secondary));
}
function buildGuildPanelButtons(guildId) {
    const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_open_add|${guildId}|CO_LEADER`)
        .setLabel('Add Co-Leader')
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(`gp_open_add|${guildId}|MANAGER`)
        .setLabel('Add Manager Guild')
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(`gp_open_add|${guildId}|MAIN`)
        .setLabel('Add Main Roster')
        .setStyle(ButtonStyle.Success));
    const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_open_add|${guildId}|SUB`)
        .setLabel('Add Sub Roster')
        .setStyle(ButtonStyle.Success), new ButtonBuilder()
        .setCustomId(`gp_open_remove|${guildId}`)
        .setLabel('Remove Member')
        .setStyle(ButtonStyle.Danger), new ButtonBuilder()
        .setCustomId(`gp_open_rotate|${guildId}`)
        .setLabel('Rotate Member')
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(`gp_open_transfer|${guildId}`)
        .setLabel('Ownership Transfer')
        .setStyle(ButtonStyle.Secondary));
    const rowLeave = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_leave_guild|${guildId}`)
        .setLabel('Leave Guild')
        .setStyle(ButtonStyle.Danger));
    return [row1, row2, rowLeave];
}
function buildGuildPanelEmbedForInteraction(db, guildId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return null;
    const coLeader = guild.coLeaderId;
    const managersCount = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(guild.id)?.count || 0;
    const mainsCount = db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(guild.id)?.count || 0;
    const subsCount = db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(guild.id)?.count || 0;
    return new EmbedBuilder()
        .setTitle(`🏰 ${guild.name}`)
        .setColor(0x5BADFF)
        .addFields({ name: 'Leader', value: `<@${guild.leaderId}>`, inline: true }, { name: 'Co-Leader', value: coLeader ? `<@${coLeader}>` : 'None', inline: true }, { name: 'Region', value: guild.region, inline: true }, { name: 'Managers', value: `${managersCount}/2`, inline: true }, { name: 'Main Roster', value: `${mainsCount}/5`, inline: true }, { name: 'Sub Roster', value: `${subsCount}/5`, inline: true })
        .setThumbnail(guild.imageUrl || null);
}
async function handleAdminWinModal(interaction, db) {
    const customId = interaction.customId;
    // Legacy handler for old admin_win_modal
    if (customId.startsWith('admin_win_modal|')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const [, guildId] = parseCustomId(customId);
        if (!guildId) {
            await interaction.editReply({
                content: '❌ Invalid guild ID.',
            });
            return;
        }
        const winsValue = interaction.fields.getTextInputValue('wins')?.trim();
        const lossesValue = interaction.fields.getTextInputValue('losses')?.trim();
        const reason = interaction.fields.getTextInputValue('reason')?.trim();
        if (!reason) {
            await interaction.editReply({
                content: '❌ Reason is required.',
            });
            return;
        }
        const guild = getGuildById(db, guildId);
        if (!guild) {
            await interaction.editReply({
                content: '❌ Guild not found.',
            });
            return;
        }
        const currentWins = guild.wins || 0;
        const currentLosses = guild.losses || 0;
        let newWins = currentWins;
        let newLosses = currentLosses;
        if (winsValue) {
            const parsedWins = parseInt(winsValue, 10);
            if (isNaN(parsedWins) || parsedWins < 0) {
                await interaction.editReply({
                    content: '❌ Wins must be a non-negative number.',
                });
                return;
            }
            newWins = parsedWins;
        }
        if (lossesValue) {
            const parsedLosses = parseInt(lossesValue, 10);
            if (isNaN(parsedLosses) || parsedLosses < 0) {
                await interaction.editReply({
                    content: '❌ Losses must be a non-negative number.',
                });
                return;
            }
            newLosses = parsedLosses;
        }
        // Update the guild
        db.prepare('UPDATE Guilds SET wins = ?, losses = ? WHERE id = ?').run(newWins, newLosses, guildId);
        // Log the action
        const logChannel = await interaction.client.channels.fetch('1470554772678512794').catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(`📊 Admin W/L Change: Guild "${guild.name}" W/L changed from ${currentWins}/${currentLosses} to ${newWins}/${newLosses} by <@${interaction.user.id}>. Reason: ${reason}`);
        }
        // Refresh guild panel
        await refreshGuildPanel(interaction.client, db, guildId);
        await interaction.editReply({
            content: `✅ Updated ${guild.name}: W/L changed from ${currentWins}/${currentLosses} to ${newWins}/${newLosses}.`,
        });
        return;
    }
}
export async function handleInteractions(interaction, client, db, commands) {
    try {
        // Defer reply only for chat input commands
        if (interaction.isChatInputCommand()) {
            if (typeof interaction.deferReply === 'function' && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.deferReply({ flags: 64 });
                }
                catch (e) {
                    if (e?.code !== 40060)
                        throw e;
                    // 40060: already acknowledged — mark as deferred so editReply works
                    Object.defineProperty(interaction, 'deferred', { value: true, writable: true });
                }
            }
        }
        // For components (buttons/select menus), let the handler manage it
        if (interaction.isChatInputCommand()) {
            if (!commands) {
                console.error('[handleInteractions] commands Map is undefined — bot still loading');
                await interaction.editReply({ content: '⚠️ O bot ainda está inicializando. Tente novamente em instantes.' });
                return;
            }
            console.log(`[CMD] /${interaction.commandName} | map:${commands.size} | found:${commands.has(interaction.commandName)}`);
            const command = commands.get(interaction.commandName);
            if (!command) {
                console.error(`Command not found: ${interaction.commandName}`);
                console.error('Available commands:', Array.from(commands.keys()).sort().join(', '));
                // Safe auto-reload: only clear+update the map if the reload actually has the command.
                try {
                    const newCommands = await loadCommands();
                    const retry = newCommands.get(interaction.commandName);
                    if (retry) {
                        commands.clear();
                        for (const [k, v] of newCommands.entries())
                            commands.set(k, v);
                        await retry.execute(interaction, db);
                        return;
                    }
                    else {
                        console.error(`Reload also could not find: ${interaction.commandName}`);
                        console.error('Reloaded set:', Array.from(newCommands.keys()).sort().join(', '));
                    }
                }
                catch (reloadErr) {
                    console.error(`[auto-reload] /${interaction.commandName} threw:`, reloadErr?.message ?? reloadErr);
                    await interaction.editReply({ content: `❌ Erro ao executar o comando: ${reloadErr?.message ?? reloadErr}` });
                    return;
                }
                await interaction.editReply({
                    content: '❌ Comando não encontrado. Tente novamente.',
                });
                return;
            }
            await command.execute(interaction, db);
        }
        if (interaction.isButton()) {
            const customId = interaction.customId;
            if (customId === 'wt_start_open') {
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const actorGuild = getGuildForWarStarter(db, interaction.user.id);
                const hasWarPermissionFromRole = !!member &&
                    (member.roles.cache.has(WAR_ROLE_IDS.GUILD_LEADER) ||
                        member.roles.cache.has(WAR_ROLE_IDS.GUILD_CO_LEADER) ||
                        member.roles.cache.has(WAR_ROLE_IDS.MANAGER_GUILD));
                const canOpenWar = hasWarPermissionFromRole || !!actorGuild;
                if (!canOpenWar) {
                    await interaction.reply({
                        content: '❌ Only Guild Leader, Guild Co-Leader, or Manager Guild can open a War Ticket.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                if (!actorGuild) {
                    await interaction.reply({
                        content: '❌ You are not registered as Leader, Co-Leader, or Manager in any guild.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                // Guild in dodge grace period cannot open tickets
                const actorGraceOpen = getGuildActiveDodge(db, actorGuild.id);
                if (actorGraceOpen) {
                    const actorGraceEnd = new Date(actorGraceOpen.grace_until);
                    await interaction.reply({
                        content: `⛔ **${actorGuild.name}** is currently in a **dodge grace period** and cannot open war tickets.\n\nThis grace period expires <t:${Math.floor(actorGraceEnd.getTime() / 1000)}:R>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const guilds = db.prepare('SELECT * FROM Guilds WHERE id != ? ORDER BY name ASC').all(actorGuild.id);
                if (!guilds || guilds.length === 0) {
                    await interaction.reply({
                        content: '❌ No opponent guilds are available right now.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
                const currentPage = 1;
                const menuGuilds = guilds.slice((currentPage - 1) * 25, currentPage * 25);
                const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
                    .setLabel((guild.name || 'Unknown').slice(0, 100))
                    .setDescription(`Region: ${guild.region || 'Unknown'}`)
                    .setValue(guild.id));
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`wt_select_opponent|${actorGuild.id}`)
                    .setPlaceholder('Select an opponent guild')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const components = [row];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`wt_select_opponent_page|${actorGuild.id}|${currentPage - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1), new ButtonBuilder()
                        .setCustomId(`wt_select_opponent_page|${actorGuild.id}|${currentPage + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage >= totalPages));
                    components.push(pageRow);
                }
                const embed = new EmbedBuilder()
                    .setColor(0x5BADFF)
                    .setTitle('Start War')
                    .setDescription(`Select an opponent guild from the list below to start the war ticket. Page ${currentPage}/${totalPages}.${totalPages > 1 ? ' Use the buttons to change pages.' : ''}`);
                await interaction.reply({
                    embeds: [embed],
                    components,
                    ephemeral: true,
                });
                return;
            }
            if (customId.startsWith('wt_select_opponent_page|')) {
                const [, actorGuildId, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                if (!actorGuildId || page < 1) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const guilds = db.prepare('SELECT * FROM Guilds WHERE id != ? ORDER BY name ASC').all(actorGuildId);
                if (!guilds || guilds.length === 0) {
                    await interaction.update({
                        content: '❌ No opponent guilds are available right now.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
                if (page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
                const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
                    .setLabel((guild.name || 'Unknown').slice(0, 100))
                    .setDescription(`Region: ${guild.region || 'Unknown'}`)
                    .setValue(guild.id));
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`wt_select_opponent|${actorGuildId}`)
                    .setPlaceholder('Select an opponent guild')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const components = [row];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`wt_select_opponent_page|${actorGuildId}|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`wt_select_opponent_page|${actorGuildId}|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                const embed = new EmbedBuilder()
                    .setColor(0x5BADFF)
                    .setTitle('Start War')
                    .setDescription(`Select an opponent guild from the list below to start the war ticket. Page ${page}/${totalPages}. Use the buttons to change pages.`);
                await interaction.update({
                    embeds: [embed],
                    components,
                    content: '',
                });
                return;
            }
            if (customId.startsWith('guild_list_page|')) {
                const [, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                const guilds = db.prepare('SELECT * FROM Guilds ORDER BY name ASC').all();
                const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
                if (page < 1 || page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
                const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
                    .setLabel(guild.name)
                    .setDescription(`Region: ${guild.region} | Leader: ${guild.leaderId}`)
                    .setValue(guild.id)
                    .setEmoji('🏰'));
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('guild_select')
                    .setPlaceholder('Select a guild to open panel')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const components = [row];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`guild_list_page|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`guild_list_page|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                const pageEmbed = new EmbedBuilder()
                    .setTitle('🏰 Registered Guilds')
                    .setDescription(`📊 Total guilds: **${guilds.length}**\n\nSelect a guild from the menu below to open its management panel.\nPage ${page}/${totalPages}.`)
                    .setColor(0x5BADFF);
                await interaction.update({
                    embeds: [pageEmbed],
                    components,
                    content: '',
                });
                return;
            }
            if (customId.startsWith('guild_delete_page|')) {
                const [, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                const guilds = db.prepare('SELECT * FROM Guilds ORDER BY name ASC').all();
                const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
                if (page < 1 || page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
                const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
                    .setLabel(guild.name)
                    .setDescription(`Leader: ${guild.leaderId} | Region: ${guild.region}`)
                    .setValue(guild.id)
                    .setEmoji('🏰'));
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('guild_delete_select')
                    .setPlaceholder('Select a guild to delete')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const components = [row];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`guild_delete_page|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`guild_delete_page|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                await interaction.update({
                    content: '🗑️ **Select a guild to delete:**',
                    components,
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('gp_transfer_target_page|')) {
                const [, guildId, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                if (!guildId) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const guild = getGuildById(db, guildId);
                const allCandidates = getRegisteredGuildMemberIds(db, guildId).filter(userId => userId !== guild?.leaderId);
                const totalPages = Math.max(1, Math.ceil(allCandidates.length / 25));
                if (page < 1 || page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const pageCandidates = allCandidates.slice((page - 1) * 25, page * 25);
                const candidateOptions = await Promise.all(pageCandidates.map(async (userId) => {
                    const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel((guildMember?.displayName || userId).slice(0, 100))
                        .setDescription(`ID: ${userId}`)
                        .setValue(userId);
                }));
                const transferSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_transfer_target_select|${guildId}`)
                    .setPlaceholder('Select the new guild leader')
                    .addOptions(candidateOptions);
                const components = [
                    new ActionRowBuilder().addComponents(transferSelect),
                ];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`gp_transfer_target_page|${guildId}|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`gp_transfer_target_page|${guildId}|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                components.push(buildBackToPanelRow(guildId));
                await interaction.update({
                    content: `Select the new leader for **${getGuildById(db, guildId)?.name || 'guild'}**. Page ${page}/${totalPages}.`,
                    embeds: [],
                    components,
                });
                return;
            }
            if (customId.startsWith('gp_remove_member_page|')) {
                const [, guildId, roleType, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                if (!guildId || !roleType) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const members = getMembersByRole(db, guildId, roleType);
                if (!members.length) {
                    await interaction.update({
                        content: ` No members found for **${getRoleLabel(roleType)}**.`,
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(members.length / 25));
                if (page < 1 || page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const pageMembers = members.slice((page - 1) * 25, page * 25);
                const memberOptions = await Promise.all(pageMembers.map(async (userId) => {
                    const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel((guildMember?.displayName || userId).slice(0, 100))
                        .setDescription(`ID: ${userId}`)
                        .setValue(userId);
                }));
                const memberSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_remove_member_select|${guildId}|${roleType}`)
                    .setPlaceholder(`Select who to remove from ${getRoleLabel(roleType)}`)
                    .addOptions(memberOptions);
                const components = [
                    new ActionRowBuilder().addComponents(memberSelect),
                ];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                components.push(buildBackToPanelRow(guildId));
                await interaction.update({
                    content: `Select the member to remove from **${getRoleLabel(roleType)}**. Page ${page}/${totalPages}.`,
                    components,
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('wt_accept|')) {
                await interaction.deferUpdate();
                const [, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                if (!war || war.status !== 'PENDING') {
                    await interaction.followUp({
                        content: '❌ This war is no longer pending.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const opponentGuild = getGuildById(db, war.opponentGuildId);
                const openerGuild = getGuildById(db, war.openerGuildId);
                const actorRole = getGuildRoleInWar(opponentGuild, interaction.user.id);
                if (!actorRole) {
                    await interaction.followUp({
                        content: '❌ Only the Leader or Co-Leader of the opponent guild can accept this war.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                acceptWar(db, war.id, interaction.user.id, war.opponentGuildId);
                const acceptedContainer = new ContainerBuilder()
                    .setAccentColor(0x5BADFF)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚔️ War Confirmation\nWar between: ${openerGuild?.name || 'Unknown'} vs ${opponentGuild?.name || 'Unknown'}`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ War accepted by <@${interaction.user.id}>.\n\nHoster team can proceed with the match details.`));
                await interaction.editReply({
                    components: [acceptedContainer],
                });
                {
                    const warMentionSetting = getSetting(db, `${interaction.guildId}_war_mention_roles`);
                    const warMentionRoles = warMentionSetting
                        ? warMentionSetting.split(',').filter(Boolean)
                        : (() => {
                            const hosterRoleId = getSetting(db, `${interaction.guildId}_hoster_role_id`);
                            return hosterRoleId
                                ? [hosterRoleId]
                                : [WAR_ROLE_IDS.HOSTER, WAR_ROLE_IDS.JUNIOR_HOSTER, WAR_ROLE_IDS.EVENT_HOSTER];
                        })();
                    const mentionContent = warMentionRoles.map(r => `<@&${r}>`).join(' ');
                    await interaction.channel?.send({
                        content: `${mentionContent} war accepted. Please proceed with hosting.`,
                        allowedMentions: { roles: warMentionRoles },
                    });
                }
                const finalizeRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`wt_open_finalize|${war.id}`)
                    .setLabel('Finalize War')
                    .setStyle(ButtonStyle.Primary));
                const finalizeContainer = new ContainerBuilder()
                    .setAccentColor(0x5BADFF)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⚔️ Finalize War'))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('ℹ️ The Hoster team can finalize the war.\n\nUse the button below to start finalization and choose the winning guild.'))
                    .addActionRowComponents(finalizeRow);
                await interaction.channel?.send({
                    flags: MessageFlags.IsComponentsV2,
                    components: [finalizeContainer],
                });
                // Start player collection — ping opener guild first
                initPlayerCollection(db, war.id, war.openerGuildId, war.opponentGuildId);
                const openerRole = interaction.guild?.roles.cache.find(r => r.name === openerGuild?.name);
                const openerMention = openerRole ? `<@&${openerRole.id}>` : `**${openerGuild?.name || 'Opener Guild'}**`;
                const collectBtn1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`wt_collect_players|${war.id}|1`)
                        .setLabel('Submit Players')
                        .setStyle(ButtonStyle.Secondary)
                );
                await interaction.channel?.send({
                    content: `${openerMention} Please submit your team's Discord **usernames** (not display names) for the war stats.`,
                    components: [collectBtn1],
                    allowedMentions: openerRole ? { roles: [openerRole.id] } : {},
                });
                return;
            }
            if (customId.startsWith('wt_dodge|')) {
                await interaction.deferUpdate();
                const [, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.followUp({
                        content: '❌ This war can no longer be dodged.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const isHosterTeam = canMemberFinalizeTicket(member, db, interaction.guildId);
                // Check if user is leader or co-leader of either guild
                const openerGuild = getGuildById(db, war.openerGuildId);
                const opponentGuild = getGuildById(db, war.opponentGuildId);
                const isGuildLeader = (openerGuild && (openerGuild.leaderId === interaction.user.id || openerGuild.coLeaderId === interaction.user.id))
                    || (opponentGuild && (opponentGuild.leaderId === interaction.user.id || opponentGuild.coLeaderId === interaction.user.id));
                if (!isHosterTeam && !isGuildLeader) {
                    await interaction.followUp({
                        content: '❌ Only guild leaders, co-leaders, Hoster, Junior Hoster, or Event Hoster can use Dodge.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                dodgeWar(db, war.id);
                // Determine which guild is dodging (the guild the user belongs to)
                const userInOpener = openerGuild && (openerGuild.leaderId === interaction.user.id || openerGuild.coLeaderId === interaction.user.id || db.prepare('SELECT 1 FROM Managers WHERE guildId=? AND userId=?').get(openerGuild.id, interaction.user.id));
                const dodgingGuild = userInOpener ? openerGuild : (opponentGuild ?? openerGuild);
                // Apply grace period + ELO penalty logic
                let dodgeExtra = '';
                if (dodgingGuild) {
                    const opponentGuildInfo = userInOpener ? opponentGuild : openerGuild;
                    const graceMinutes = parseInt(getSetting(db, `${interaction.guildId}_dodge_grace_minutes`) || '5', 10) || 5;
                    const { eloPenaltyApplied, graceUntil } = recordGuildDodge(db, dodgingGuild.id, dodgingGuild.name, graceMinutes, {
                        leaderId: dodgingGuild.leaderId ?? null,
                        guildId: opponentGuildInfo?.id ?? null,
                        guildName: opponentGuildInfo?.name ?? null,
                    });
                    const graceEnd = new Date(graceUntil);
                    const graceTs = Math.floor(graceEnd.getTime() / 1000);
                    const graceLabel = graceMinutes >= 60 ? `${Math.round(graceMinutes / 60)}-hour` : `${graceMinutes}-minute`;
                    dodgeExtra = `\n⏳ **${dodgingGuild.name}** has a **${graceLabel} grace period** and cannot be challenged until <t:${graceTs}:F>.`;
                    if (eloPenaltyApplied) {
                        dodgeExtra += `\n⚠️ **-25 ELO** penalty applied to **${dodgingGuild.name}** for repeat dodge within 3 days — war log created (3-0 loss).`;
                        const opponentGuildForPenalty = userInOpener ? opponentGuild : openerGuild;
                        // Track win/loss records
                        addGuildLoss(db, dodgingGuild.id);
                        if (opponentGuildForPenalty) addGuildWin(db, opponentGuildForPenalty.id);
                        // Refresh Discord guild panels
                        await refreshGuildPanel(client, db, dodgingGuild.id).catch(() => {});
                        if (opponentGuildForPenalty) await refreshGuildPanel(client, db, opponentGuildForPenalty.id).catch(() => {});
                        // Create site war log: dodger loses 3-0
                        try {
                            const { createWarLog } = await import('./siteapi.js');
                            const dodgerTag = dodgingGuild.tag || dodgingGuild.name;
                            const opponentTag = opponentGuildForPenalty?.tag || opponentGuildForPenalty?.name || 'Unknown';
                            const penaltyNote = `"${dodgingGuild.name}" Dodged before the 3 day grace period ended`;
                            await createWarLog(
                                opponentTag, dodgerTag,
                                3, 0,
                                opponentTag,
                                opponentGuildForPenalty?.region || dodgingGuild?.region || 'NA',
                                0, -25,
                                null, '', '', penaltyNote,
                            );
                        } catch (e) {
                            console.error('Failed to create dodge penalty war log on site:', e?.message);
                        }
                    }
                }
                const dodgeSummary = `# WAR DODGE\n<@${interaction.user.id}> used Dodge and closed the war ticket (${openerGuild?.name || 'Unknown'} vs ${opponentGuild?.name || 'Unknown'}).${dodgeExtra}`;
                const warDodgeId = getSetting(db, `${interaction.guildId}_war_dodge_channel_id`) || WAR_DODGE_LOGS_CHANNEL_ID;
                const warDodgeLogsChannel = await interaction.client.channels.fetch(warDodgeId).catch(() => null);
                if (warDodgeLogsChannel && warDodgeLogsChannel.isTextBased() && 'send' in warDodgeLogsChannel) {
                    await warDodgeLogsChannel.send({ content: dodgeSummary });
                }
                const warChannel = interaction.channel
                    ?? (war.channelId ? (interaction.guild?.channels.cache.get(war.channelId) ?? await interaction.guild?.channels.fetch(war.channelId).catch(() => null)) : null);
                if (warChannel && 'send' in warChannel) {
                    await warChannel.send({
                        content: `${dodgeSummary}\n\n⏳ Channel will be deleted in 5 seconds...`,
                        allowedMentions: { users: [interaction.user.id] },
                    }).catch(() => null);
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
                if (warChannel && 'delete' in warChannel) {
                    await warChannel.delete('War ticket closed after dodge').catch((err) => {
                        console.error('Failed to delete war ticket channel after dodge:', err);
                    });
                }
                return;
            }
            if (customId.startsWith('wt_collect_players|')) {
                const [, warIdRaw, stepRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const step = Number(stepRaw);
                const collection = getPlayerCollection(db, warId);
                if (!collection) {
                    await interaction.reply({ content: '❌ Player collection not found for this war.', flags: MessageFlags.Ephemeral });
                    return;
                }
                // Save this message ID so we can disable the button after submission
                if (interaction.message?.id) {
                    setPlayerCollectionMsgId(db, warId, step, interaction.message.id);
                }
                const targetGuildId = step === 1 ? collection.guild1_id : collection.guild2_id;
                const targetGuild = getGuildById(db, targetGuildId);
                // Permission: must be in the target guild's roster OR have its Discord role
                const inRoster = db.prepare('SELECT 1 FROM MainRosters WHERE guildId=? AND userId=? UNION SELECT 1 FROM SubRosters WHERE guildId=? AND userId=? UNION SELECT 1 FROM Managers WHERE guildId=? AND userId=?')
                    .get(targetGuildId, interaction.user.id, targetGuildId, interaction.user.id, targetGuildId, interaction.user.id);
                const hasRole = targetGuild?.name && interaction.member?.roles?.cache?.some(r => r.name === targetGuild.name);
                const isLeader = targetGuild?.leaderId === interaction.user.id || targetGuild?.coLeaderId === interaction.user.id;
                if (!inRoster && !hasRole && !isLeader) {
                    await interaction.reply({ content: `❌ Only members of **${targetGuild?.name || 'the target guild'}** can submit their player list.`, flags: MessageFlags.Ephemeral });
                    return;
                }
                const modal = new ModalBuilder()
                    .setCustomId(`wt_collect_players_modal|${warId}|${step}`)
                    .setTitle(`Submit ${targetGuild?.name || 'Team'} Players`)
                    .addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('players')
                            .setLabel('Usernames — one per line (not display names)')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('player1\nplayer2\nplayer3\nplayer4')
                            .setRequired(true)
                            .setMaxLength(500)
                    ));
                await interaction.showModal(modal);
                return;
            }
            if (customId === 'wt_close_ticket') {
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                if (!canMemberFinalizeTicket(member, db, interaction.guildId)) {
                    await interaction.reply({ content: '❌ You do not have permission to close this ticket.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.update({ content: '🔒 Closing ticket...', components: [] });
                await interaction.channel?.delete('War ticket closed by host').catch(() => null);
                return;
            }
            if (customId === 'wg_close_ticket') {
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                if (!canMemberFinalizeTicket(member, db, interaction.guildId)) {
                    await interaction.reply({ content: '❌ You do not have permission to close this ticket.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.update({ content: '🔒 Closing ticket...', components: [] });
                await interaction.channel?.delete('Wager ticket closed by host').catch(() => null);
                return;
            }
            if (customId.startsWith('wt_elo_btn|')) {
                const [, winnerGuildId, loserGuildId, warIdRaw] = parseCustomId(customId);
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                if (!canMemberFinalizeTicket(member, db, interaction.guildId)) {
                    await interaction.reply({ content: '❌ You do not have permission to apply ELO.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const eloModal = new ModalBuilder()
                    .setCustomId(`wt_elo_standalone_modal|${winnerGuildId}|${loserGuildId}|${warIdRaw || ''}`)
                    .setTitle('Apply ELO Points')
                    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId('winner_elo_gain')
                    .setLabel('Winner ELO gain')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('20')
                    .setRequired(true)
                    .setMaxLength(6)), new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId('loser_elo_loss')
                    .setLabel('Loser ELO loss')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('25')
                    .setRequired(true)
                    .setMaxLength(6)));
                await interaction.showModal(eloModal);
                return;
            }
            if (customId.startsWith('wt_open_finalize|')) {
                const [, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.reply({
                        content: '❌ This war is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const openerGuild = getGuildById(db, war.openerGuildId);
                const opponentGuild = getGuildById(db, war.opponentGuildId);
                const winnerSelect = new StringSelectMenuBuilder()
                    .setCustomId(`wt_finalize_winner_select|${war.id}`)
                    .setPlaceholder('Select the winning guild')
                    .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel((openerGuild?.name || 'Guild A').slice(0, 100))
                        .setValue(war.openerGuildId),
                    new StringSelectMenuOptionBuilder()
                        .setLabel((opponentGuild?.name || 'Guild B').slice(0, 100))
                        .setValue(war.opponentGuildId),
                ]);
                await interaction.reply({
                    content: 'Select the winning guild:',
                    components: [new ActionRowBuilder().addComponents(winnerSelect)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            if (customId === 'wg_open_1v1' || customId === 'c41fa0d1f1d14d3db74f8dc6ad590316') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const selectOpponent = new UserSelectMenuBuilder()
                    .setCustomId('wg_select_1v1_opponent')
                    .setPlaceholder('Select the player you want to challenge')
                    .setMinValues(1)
                    .setMaxValues(1);
                const embed = new EmbedBuilder()
                    .setColor(0x5BADFF)
                    .setTitle('Wager 1v1')
                    .setDescription('Select the opponent for this 1v1 wager.');
                await interaction.editReply({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(selectOpponent)],
                });
                return;
            }
            if (customId === 'wg_open_2v2' || customId === '558e24f85ff142e69f7e05320a41c6bf') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const selectPartner = new UserSelectMenuBuilder()
                    .setCustomId('wg_select_2v2_partner')
                    .setPlaceholder('Select your teammate')
                    .setMinValues(1)
                    .setMaxValues(1);
                const embed = new EmbedBuilder()
                    .setColor(0x5BADFF)
                    .setTitle('Wager 2v2')
                    .setDescription('Step 1/2: Select your teammate.');
                await interaction.editReply({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(selectPartner)],
                });
                return;
            }
            if (customId.startsWith('wg_accept|')) {
                await interaction.deferUpdate();
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                if (!wager || wager.status !== 'PENDING') {
                    await interaction.followUp({
                        content: '❌ This wager is no longer pending.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const requiredAcceptors = wager.type === '1V1'
                    ? [wager.challenged1Id]
                    : [wager.challenged1Id, wager.challenged2Id].filter((v) => !!v);
                if (!requiredAcceptors.includes(interaction.user.id)) {
                    await interaction.followUp({
                        content: wager.type === '1V1'
                            ? '❌ Only the challenged player can accept this wager.'
                            : '❌ Only the challenged duo can accept this wager.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const alreadyAccepted = parseAcceptedUsers(wager.acceptedByUserIds);
                if (alreadyAccepted.includes(interaction.user.id)) {
                    await interaction.followUp({
                        content: ' You already accepted this wager.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const acceptedUsers = recordWagerAcceptance(db, wager.id, interaction.user.id);
                const acceptedCount = requiredAcceptors.filter((id) => acceptedUsers.includes(id)).length;
                if (acceptedCount < requiredAcceptors.length) {
                    await interaction.editReply({
                        content: `⏳ Wager pending acceptance: **${acceptedCount}/${requiredAcceptors.length}** challenged players accepted.`,
                        components: interaction.message.components,
                        embeds: [],
                    });
                    return;
                }
                markWagerAccepted(db, wager.id);
                const participantIds = buildWagerParticipantIds(wager);
                const channel = interaction.channel;
                if (channel && 'permissionOverwrites' in channel) {
                    await unlockWagerTicketChat(interaction, channel, participantIds, db);
                }
                const acceptDisabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`wg_accept|${wager.id}`)
                    .setLabel('Accept Wager')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true), new ButtonBuilder()
                    .setCustomId(`wg_finalize_open|${wager.id}`)
                    .setLabel('Finalize Wager')
                    .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                    .setCustomId(`wg_dodge|${wager.id}`)
                    .setLabel('Dodge')
                    .setStyle(ButtonStyle.Danger));
                await interaction.editReply({
                    content: '✅ Wager accepted. Chat unlocked.',
                    embeds: [],
                    components: [acceptDisabledRow],
                });
                // Init wager amount collection and ask for the wager
                if (interaction.channelId) {
                    initWagerAmountCollection(db, wager.id, interaction.channelId, wager.challenger1Id, wager.challenger2Id, wager.challenged1Id, wager.challenged2Id);
                    await interaction.channel?.send({ content: '💰 **What is the wager?** Type it in the chat below.' });
                }
                return;
            }
            if (customId.startsWith('wg_finalize_open|')) {
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                if (!wager || wager.status !== 'ACCEPTED') {
                    await interaction.reply({
                        content: '❌ This wager is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ You do not have permission to finalize this wager. Configure the role with `/setup hoster_role`.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                // Fetch display names so select labels show names, not raw IDs
                async function resolveTeamLabel(ids) {
                    const names = [];
                    for (const id of ids.filter(Boolean)) {
                        const m = await interaction.guild?.members.fetch(id).catch(() => null);
                        names.push(m?.displayName || id);
                    }
                    return names.join(' + ') || 'Team';
                }
                const teamALabel = await resolveTeamLabel([wager.challenger1Id, wager.challenger2Id]);
                const teamBLabel = await resolveTeamLabel([wager.challenged1Id, wager.challenged2Id]);
                const winnerSelect = new StringSelectMenuBuilder()
                    .setCustomId(`wg_finalize_winner_select|${wager.id}`)
                    .setPlaceholder('Select the winning team')
                    .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel(teamALabel.slice(0, 100))
                        .setValue('CHALLENGER'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel(teamBLabel.slice(0, 100))
                        .setValue('CHALLENGED'),
                ]);
                await interaction.reply({
                    content: 'Select the winning team:',
                    components: [new ActionRowBuilder().addComponents(winnerSelect)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            if (customId.startsWith('wg_amount_confirm|')) {
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const col = getWagerAmountCollection(db, wagerId);
                if (!col) { await interaction.reply({ content: '❌ No wager amount pending.', flags: MessageFlags.Ephemeral }); return; }
                const userId = interaction.user.id;
                const isTeam1 = [col.challenger1_id, col.challenger2_id].includes(userId);
                const isTeam2 = [col.challenged1_id, col.challenged2_id].includes(userId);
                if (!isTeam1 && !isTeam2) { await interaction.reply({ content: '❌ You are not a participant in this wager.', flags: MessageFlags.Ephemeral }); return; }
                const result = confirmWagerTeam(db, wagerId, isTeam1 ? 1 : 2);
                if (result.team1_confirmed && result.team2_confirmed) {
                    await interaction.update({ content: `✅ Both teams agreed — the wager is **${col.amount}**.`, embeds: [], components: [] });
                    const rulesEmbed = new EmbedBuilder()
                        .setColor(0x5BADFF)
                        .setTitle('📋 Match Rules')
                        .setDescription('**Default Rules:** No Skeying, No Mode Pops, Aura is allowed.\n\nSelect an option below:');
                    const rulesRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`wg_rules_default|${wagerId}`).setLabel('Default Rules').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`wg_rules_bans|${wagerId}`).setLabel('Mutual Bans').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`wg_rules_default_bans|${wagerId}`).setLabel('Default Rules + Mutual Bans').setStyle(ButtonStyle.Success),
                    );
                    await interaction.channel.send({ embeds: [rulesEmbed], components: [rulesRow] });
                } else {
                    const waiting = isTeam1 ? 'Waiting for the other team to confirm.' : 'Waiting for the challenger team to confirm.';
                    await interaction.reply({ content: `✅ You confirmed the wager. ${waiting}`, flags: MessageFlags.Ephemeral });
                }
                return;
            }
            if (customId.startsWith('wg_amount_reject|')) {
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const col = getWagerAmountCollection(db, wagerId);
                if (!col) { await interaction.reply({ content: '❌ No wager amount pending.', flags: MessageFlags.Ephemeral }); return; }
                const userId = interaction.user.id;
                const isParticipant = [col.challenger1_id, col.challenger2_id, col.challenged1_id, col.challenged2_id].includes(userId);
                if (!isParticipant) { await interaction.reply({ content: '❌ You are not a participant in this wager.', flags: MessageFlags.Ephemeral }); return; }
                resetWagerAmount(db, wagerId);
                await interaction.update({ content: '❌ Wager amount rejected.\n\n💰 **What is the wager?** Type it in the chat below.', embeds: [], components: [] });
                return;
            }
            if (customId.startsWith('wg_rules_default_bans|') || customId.startsWith('wg_rules_default|') || customId.startsWith('wg_rules_bans|')) {
                const wagerIdRaw = customId.split('|')[1];
                const wagerId = Number(wagerIdRaw);
                const col = getWagerAmountCollection(db, wagerId);
                if (!col) { await interaction.reply({ content: '❌ Wager not found.', flags: MessageFlags.Ephemeral }); return; }
                const userId = interaction.user.id;
                const isTeam1 = [col.challenger1_id, col.challenger2_id].includes(userId);
                const isTeam2 = [col.challenged1_id, col.challenged2_id].includes(userId);
                if (!isTeam1 && !isTeam2) { await interaction.reply({ content: '❌ You are not a participant in this wager.', flags: MessageFlags.Ephemeral }); return; }
                const vote = customId.startsWith('wg_rules_default_bans|') ? 'default_bans'
                    : customId.startsWith('wg_rules_default|') ? 'default'
                    : 'bans';
                const votes = recordRulesVote(db, wagerId, isTeam1 ? 1 : 2, vote);
                const voteLabels = { default: 'Default Rules', bans: 'Mutual Bans', default_bans: 'Default Rules + Mutual Bans' };
                const rulesRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`wg_rules_default|${wagerId}`).setLabel('Default Rules').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`wg_rules_bans|${wagerId}`).setLabel('Mutual Bans').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`wg_rules_default_bans|${wagerId}`).setLabel('Default Rules + Mutual Bans').setStyle(ButtonStyle.Success),
                );
                if (votes.rules_vote_team1 && votes.rules_vote_team2) {
                    // Both voted — determine final result
                    const finalVote = votes.rules_vote_team1 === votes.rules_vote_team2 ? votes.rules_vote_team1 : 'default';
                    setWagerRules(db, wagerId, finalVote);
                    if (finalVote === 'default') {
                        const diffNote = votes.rules_vote_team1 !== votes.rules_vote_team2
                            ? '\n-# Teams selected different options — defaulting to Default Rules.'
                            : '';
                        const embed = new EmbedBuilder()
                            .setColor(0x5BADFF)
                            .setTitle('✅ Default Rules Selected')
                            .setDescription(`**Default Rules:** No Skeying, No Mode Pops, Aura is allowed.${diffNote}`);
                        await interaction.update({ embeds: [embed], components: [] });
                    } else if (finalVote === 'bans') {
                        startWagerBanCollection(db, wagerId);
                        await interaction.update({ embeds: [], components: [],
                            content: '🔨 **Mutual Bans selected.**\n\n**What would you like to ban?** Type it in the chat below.' });
                    } else {
                        startWagerBanCollection(db, wagerId);
                        await interaction.update({ embeds: [], components: [],
                            content: '📋 **Default Rules + Mutual Bans selected.**\nDefault Rules: No Skeying, No Mode Pops, Aura is allowed.\n\n**What would you like to ban?** Type it in the chat below.' });
                    }
                } else {
                    // Only one team voted — show status and keep buttons
                    const embed = new EmbedBuilder()
                        .setColor(0x5BADFF)
                        .setTitle('📋 Match Rules')
                        .setDescription(
                            `**Default Rules:** No Skeying, No Mode Pops, Aura is allowed.\n\n` +
                            `**Team 1:** ${votes.rules_vote_team1 ? `✅ ${voteLabels[votes.rules_vote_team1]}` : '⏳ Waiting...'}\n` +
                            `**Team 2:** ${votes.rules_vote_team2 ? `✅ ${voteLabels[votes.rules_vote_team2]}` : '⏳ Waiting...'}`
                        )
                        .setFooter({ text: 'Make sure to agree on rules before clicking an option. If both teams click different options, it will default to Default Rules.' });
                    await interaction.update({ embeds: [embed], components: [rulesRow] });
                }
                return;
            }
            if (customId.startsWith('wg_ban_confirm|')) {
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const col = getWagerAmountCollection(db, wagerId);
                if (!col) { await interaction.reply({ content: '❌ Wager not found.', flags: MessageFlags.Ephemeral }); return; }
                const userId = interaction.user.id;
                const isTeam1 = [col.challenger1_id, col.challenger2_id].includes(userId);
                const isTeam2 = [col.challenged1_id, col.challenged2_id].includes(userId);
                if (!isTeam1 && !isTeam2) { await interaction.reply({ content: '❌ You are not a participant in this wager.', flags: MessageFlags.Ephemeral }); return; }
                const result = confirmWagerBanTeam(db, wagerId, isTeam1 ? 1 : 2);
                if (result.ban_team1_confirmed && result.ban_team2_confirmed) {
                    const rulesLabel = col.rules_type === 'default_bans'
                        ? 'Default Rules + Mutual Bans'
                        : 'Mutual Bans';
                    const embed = new EmbedBuilder()
                        .setColor(0x5BADFF)
                        .setTitle(`✅ ${rulesLabel} Confirmed`)
                        .setDescription(col.rules_type === 'default_bans'
                            ? `**Default Rules:** No Skeying, No Mode Pops, Aura is allowed.\n**Mutual Ban:** ${col.ban_content}`
                            : `**Mutual Ban:** ${col.ban_content}`);
                    await interaction.update({ embeds: [embed], components: [] });
                } else {
                    const waiting = isTeam1 ? 'Waiting for the other team to confirm.' : 'Waiting for the challenger team to confirm.';
                    await interaction.reply({ content: `✅ You confirmed the ban. ${waiting}`, flags: MessageFlags.Ephemeral });
                }
                return;
            }
            if (customId.startsWith('wg_ban_reject|')) {
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const col = getWagerAmountCollection(db, wagerId);
                if (!col) { await interaction.reply({ content: '❌ Wager not found.', flags: MessageFlags.Ephemeral }); return; }
                const isParticipant = [col.challenger1_id, col.challenger2_id, col.challenged1_id, col.challenged2_id].includes(interaction.user.id);
                if (!isParticipant) { await interaction.reply({ content: '❌ You are not a participant in this wager.', flags: MessageFlags.Ephemeral }); return; }
                resetWagerBan(db, wagerId);
                await interaction.update({ content: '❌ Ban rejected.\n\n**What would you like to ban?** Type it in the chat below.', embeds: [], components: [] });
                return;
            }
            if (customId.startsWith('wg_dodge|')) {
                await interaction.deferUpdate();
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                if (!wager || !['PENDING', 'ACCEPTED'].includes(wager.status)) {
                    await interaction.followUp({
                        content: '❌ This wager cannot be dodged now.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const isHosterTeam = canMemberFinalizeTicket(member, db, interaction.guildId);
                const isWagerOpener = wager.challenger1Id === interaction.user.id;
                const isChallenged = wager.challenged1Id === interaction.user.id || wager.challenged2Id === interaction.user.id;
                if (!isWagerOpener && !isChallenged && !isHosterTeam) {
                    await interaction.followUp({
                        content: '❌ Only wager participants, Hoster, Junior Hoster, or Event Hoster can use Dodge.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const participants = buildWagerParticipantIds(wager);
                const mentionUsers = Array.from(new Set([...participants, interaction.user.id]));
                dodgeWager(db, wager.id, interaction.user.id);
                const teamA = formatWagerTeam([wager.challenger1Id, wager.challenger2Id]);
                const teamB = formatWagerTeam([wager.challenged1Id, wager.challenged2Id]);
                const dodgeSummary = `# WAGER DODGE\n<@${interaction.user.id}> used Dodge and closed the wager ticket (${teamA} vs ${teamB}).`;
                const wagerDodgeId = getSetting(db, `${interaction.guildId}_wager_dodge_channel_id`) || WAGER_DODGE_LOGS_CHANNEL_ID;
                const wagerDodgeLogsChannel = await interaction.client.channels.fetch(wagerDodgeId).catch(() => null);
                if (wagerDodgeLogsChannel && wagerDodgeLogsChannel.isTextBased() && 'send' in wagerDodgeLogsChannel) {
                    await wagerDodgeLogsChannel.send({
                        content: dodgeSummary,
                        allowedMentions: { users: mentionUsers },
                    });
                }
                await interaction.editReply({
                    content: dodgeSummary,
                    embeds: [],
                    components: [],
                    allowedMentions: { users: mentionUsers },
                });
                await new Promise(resolve => setTimeout(resolve, 5000));
                const wagerChannelToDelete = interaction.channel
                    ?? (wager.channelId ? (interaction.guild?.channels.cache.get(wager.channelId) ?? await interaction.guild?.channels.fetch(wager.channelId).catch(() => null)) : null);
                if (wagerChannelToDelete && 'delete' in wagerChannelToDelete) {
                    await wagerChannelToDelete.delete('Wager ticket closed after dodge').catch((err) => {
                        console.error('Failed to delete wager ticket channel after dodge:', err);
                    });
                }
                return;
            }
            if (customId.startsWith('wg_close|')) {
                await interaction.deferUpdate();
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                if (!wager || !['PENDING', 'ACCEPTED'].includes(wager.status)) {
                    await interaction.followUp({
                        content: '❌ This wager is already closed.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canClose = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canClose) {
                    await interaction.followUp({
                        content: '❌ Only Hoster can close this ticket.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                closeWager(db, wager.id);
                await interaction.editReply({
                    content: '✅ Ticket closed by hoster.',
                    components: [],
                    embeds: [],
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('Wager ticket closed by hoster').catch(() => null);
                }
                return;
            }
            if (customId.startsWith('wt_finalize_now|')) {
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.reply({
                        content: '❌ This war is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.reply({
                        content: '❌ Invalid winner selected.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const eloModal = new ModalBuilder()
                    .setCustomId(`wt_elo_modal|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setTitle('Set ELO Points')
                    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId('winner_elo_gain')
                    .setLabel('Winner ELO gain')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('20')
                    .setRequired(true)
                    .setMaxLength(6)), new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId('loser_elo_loss')
                    .setLabel('Loser ELO loss')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('25')
                    .setRequired(true)
                    .setMaxLength(6)));
                await interaction.showModal(eloModal);
                return;
            }
            if (customId.startsWith('wt_finalize_with_link|')) {
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.reply({
                        content: '❌ This war is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const linkInput = new TextInputBuilder()
                    .setCustomId('clips_link')
                    .setLabel('Clips link (YouTube, Drive, etc.)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(true)
                    .setMaxLength(400);
                const modal = new ModalBuilder()
                    .setCustomId(`wt_finalize_link_modal|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setTitle('Finalize War')
                    .addComponents(new ActionRowBuilder().addComponents(linkInput), new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId('winner_elo_gain')
                    .setLabel('Winner ELO gain')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('20')
                    .setRequired(true)
                    .setMaxLength(6)), new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId('loser_elo_loss')
                    .setLabel('Loser ELO loss')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('25')
                    .setRequired(true)
                    .setMaxLength(6)));
                await interaction.showModal(modal);
                return;
            }
            if (customId.startsWith('wt_finalize_with_details|')) {
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.reply({
                        content: '❌ This war is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const totalRounds = Math.max(1, winnerScore + loserScore);
                const modalComponents = [];
                if (totalRounds === 1) {
                    const winnerGuildInput = new TextInputBuilder()
                        .setCustomId('round_1_winner_downs')
                        .setLabel('Round 1 Winner Guild downs')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Number of downs')
                        .setRequired(true)
                        .setMaxLength(10);
                    const loserGuildInput = new TextInputBuilder()
                        .setCustomId('round_1_loser_downs')
                        .setLabel('Round 1 Loser Guild downs')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Number of downs')
                        .setRequired(true)
                        .setMaxLength(10);
                    const mvpInput = new TextInputBuilder()
                        .setCustomId('mvp_user')
                        .setLabel('MVP user (@mention, ID, or name)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('@player')
                        .setRequired(false)
                        .setMaxLength(120);
                    const clipsInput1 = new TextInputBuilder()
                        .setCustomId('clips_link_1')
                        .setLabel('Clip Link 1 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    const clipsInput2 = new TextInputBuilder()
                        .setCustomId('clips_link_2')
                        .setLabel('Clip Link 2 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    modalComponents.push(new ActionRowBuilder().addComponents(winnerGuildInput), new ActionRowBuilder().addComponents(loserGuildInput), new ActionRowBuilder().addComponents(mvpInput), new ActionRowBuilder().addComponents(clipsInput1), new ActionRowBuilder().addComponents(clipsInput2));
                }
                else if (totalRounds === 2) {
                    for (let round = 1; round <= 2; round++) {
                        const winnerGuildInput = new TextInputBuilder()
                            .setCustomId(`round_${round}_winner_downs`)
                            .setLabel(`Round ${round} Winner Guild downs`)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Number of downs')
                            .setRequired(true)
                            .setMaxLength(10);
                        const loserGuildInput = new TextInputBuilder()
                            .setCustomId(`round_${round}_loser_downs`)
                            .setLabel(`Round ${round} Loser Guild downs`)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Number of downs')
                            .setRequired(true)
                            .setMaxLength(10);
                        modalComponents.push(new ActionRowBuilder().addComponents(winnerGuildInput), new ActionRowBuilder().addComponents(loserGuildInput));
                    }
                    const mvpInput = new TextInputBuilder()
                        .setCustomId('mvp_user')
                        .setLabel('MVP user (@mention, ID, or name)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('@player')
                        .setRequired(false)
                        .setMaxLength(120);
                    modalComponents.push(new ActionRowBuilder().addComponents(mvpInput));
                }
                else {
                    const roundSummaryInput = new TextInputBuilder()
                        .setCustomId('rounds_summary')
                        .setLabel('Round details summary')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Summarize round results, downs, and any notable moments.')
                        .setRequired(true)
                        .setMaxLength(1000);
                    const mvpInput = new TextInputBuilder()
                        .setCustomId('mvp_user')
                        .setLabel('MVP user (@mention, ID, or name)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('@player')
                        .setRequired(false)
                        .setMaxLength(120);
                    const clipsInput1 = new TextInputBuilder()
                        .setCustomId('clips_link_1')
                        .setLabel('Clip Link 1 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    const clipsInput2 = new TextInputBuilder()
                        .setCustomId('clips_link_2')
                        .setLabel('Clip Link 2 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    const clipsInput3 = new TextInputBuilder()
                        .setCustomId('clips_link_3')
                        .setLabel('Clip Link 3 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    modalComponents.push(new ActionRowBuilder().addComponents(roundSummaryInput), new ActionRowBuilder().addComponents(mvpInput), new ActionRowBuilder().addComponents(clipsInput1), new ActionRowBuilder().addComponents(clipsInput2), new ActionRowBuilder().addComponents(clipsInput3));
                }
                const detailsModal = new ModalBuilder()
                    .setCustomId(`wt_finalize_details_modal|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setTitle('Finalize War With Details')
                    .addComponents(...modalComponents);
                await interaction.showModal(detailsModal);
                return;
            }
            if (customId.startsWith('gp_back_panel|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                const panelEmbed = buildGuildPanelEmbedForInteraction(db, guildId);
                if (!panelEmbed) {
                    await interaction.update({
                        content: '❌ Guild not found.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                await interaction.update({
                    content: '',
                    embeds: [panelEmbed],
                    components: buildGuildPanelButtons(guildId),
                });
                return;
            }
            if (customId.startsWith('gp_open_add|')) {
                const [, guildId, roleType] = parseCustomId(customId);
                if (!guildId || !roleType) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const castRoleType = roleType;
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, castRoleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(castRoleType)}**.`);
                    return;
                }
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`gp_add_user_select|${guildId}|${castRoleType}`)
                    .setPlaceholder(`Select a user for ${getRoleLabel(castRoleType)}`)
                    .setMinValues(1)
                    .setMaxValues(1);
                const embed = new EmbedBuilder()
                    .setTitle('Member Invitation')
                    .setDescription(`Choose a user to invite to **${getRoleLabel(castRoleType)}**.`)
                    .setColor(0x5BADFF);
                await interaction.update({
                    embeds: [embed],
                    components: [
                        new ActionRowBuilder().addComponents(userSelect),
                        buildBackToPanelRow(guildId),
                    ],
                    content: '',
                });
                return;
            }
            if (customId.startsWith('gp_open_remove|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (actorRole !== 'LEADER' && actorRole !== 'CO_LEADER') {
                    await replyPermissionError(interaction, '❌ Only the Guild Leader or Co-Leader can remove members.');
                    return;
                }
                const manageableRoleTypes = getManageableRoleTypes(actorRole);
                const roleOptionsMap = {
                    CO_LEADER: new StringSelectMenuOptionBuilder().setLabel('Co-Leader').setValue('CO_LEADER'),
                    MANAGER: new StringSelectMenuOptionBuilder().setLabel('Manager Guild').setValue('MANAGER'),
                    MAIN: new StringSelectMenuOptionBuilder().setLabel('Main Roster').setValue('MAIN'),
                    SUB: new StringSelectMenuOptionBuilder().setLabel('Sub Roster').setValue('SUB'),
                };
                const roleSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_remove_role_select|${guildId}`)
                    .setPlaceholder('Select the role type to remove')
                    .addOptions(manageableRoleTypes.map(role => roleOptionsMap[role]));
                await interaction.update({
                    content: 'Select a role type to list members available for removal.',
                    embeds: [],
                    components: [
                        new ActionRowBuilder().addComponents(roleSelect),
                        buildBackToPanelRow(guildId),
                    ],
                });
                return;
            }
            if (customId.startsWith('gp_open_transfer|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
                if (!canTransfer) {
                    await replyPermissionError(interaction, '❌ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.update({ content: '❌ Guild not found.', embeds: [], components: [] });
                    return;
                }
                const allCandidates = getRegisteredGuildMemberIds(db, guildId).filter(userId => userId !== guild.leaderId);
                if (!allCandidates.length) {
                    await interaction.update({
                        content: ' There are no eligible members to receive ownership for this guild.',
                        embeds: [],
                        components: [buildBackToPanelRow(guildId)],
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(allCandidates.length / 25));
                const currentPage = 1;
                const pageCandidates = allCandidates.slice((currentPage - 1) * 25, currentPage * 25);
                const candidateOptions = await Promise.all(pageCandidates.map(async (userId) => {
                    const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel((guildMember?.displayName || userId).slice(0, 100))
                        .setDescription(`ID: ${userId}`)
                        .setValue(userId);
                }));
                const transferSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_transfer_target_select|${guildId}`)
                    .setPlaceholder('Select the new guild leader')
                    .addOptions(candidateOptions);
                const components = [
                    new ActionRowBuilder().addComponents(transferSelect),
                    buildBackToPanelRow(guildId),
                ];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`gp_transfer_target_page|${guildId}|${currentPage - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1), new ButtonBuilder()
                        .setCustomId(`gp_transfer_target_page|${guildId}|${currentPage + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage >= totalPages));
                    components.splice(1, 0, pageRow);
                }
                await interaction.update({
                    content: `Select the new leader for **${guild.name}**. Page ${currentPage}/${totalPages}.`,
                    embeds: [],
                    components,
                });
                return;
            }
            if (customId.startsWith('gp_open_rotate|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.update({ content: '❌ Guild not found.', embeds: [], components: [] });
                    return;
                }
                const rotatableMembers = [];
                if (guild.coLeaderId) rotatableMembers.push({ userId: guild.coLeaderId, role: 'CO_LEADER' });
                db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId).forEach(r => rotatableMembers.push({ userId: r.userId, role: 'MANAGER' }));
                db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId).forEach(r => rotatableMembers.push({ userId: r.userId, role: 'MAIN' }));
                db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId).forEach(r => rotatableMembers.push({ userId: r.userId, role: 'SUB' }));
                if (!rotatableMembers.length) {
                    await interaction.update({ content: 'No members available to rotate.', embeds: [], components: [buildBackToPanelRow(guildId)] });
                    return;
                }
                const ROLE_SHORT = { CO_LEADER: 'Co-Leader', MANAGER: 'Manager', MAIN: 'Main', SUB: 'Sub' };
                const rotateOptions = await Promise.all(rotatableMembers.slice(0, 25).map(async ({ userId, role }) => {
                    const m = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`${(m?.displayName || userId).slice(0, 50)} (${ROLE_SHORT[role]})`)
                        .setValue(`${userId}:${role}`);
                }));
                const rotateSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_rotate_member_select|${guildId}`)
                    .setPlaceholder('Select a member to rotate')
                    .addOptions(rotateOptions);
                await interaction.update({
                    content: 'Select a member to move to a different role.',
                    embeds: [],
                    components: [new ActionRowBuilder().addComponents(rotateSelect), buildBackToPanelRow(guildId)],
                });
                return;
            }
            if (customId.startsWith('gp_rotate_to|')) {
                const [, guildId, userId, fromRole, toRole] = parseCustomId(customId);
                if (!guildId || !userId || !fromRole || !toRole) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                await interaction.deferUpdate();
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, fromRole) || !canManageRoleType(actorRole, toRole)) {
                    await replyPermissionError(interaction, `❌ You cannot manage one or both of these role types.`);
                    return;
                }
                if (!canAddUserToRole(db, guildId, toRole)) {
                    await interaction.editReply({ content: `❌ Cannot rotate: **${getRoleLabel(toRole)}** is already full.`, embeds: [], components: [buildBackToPanelRow(guildId)] });
                    return;
                }
                removeMemberFromRole(db, guildId, userId, fromRole);
                const moved = addMemberToRole(db, guildId, userId, toRole);
                if (!moved) {
                    addMemberToRole(db, guildId, userId, fromRole);
                    await interaction.editReply({ content: '❌ Failed to rotate member.', embeds: [], components: [buildBackToPanelRow(guildId)] });
                    return;
                }
                await refreshGuildPanel(client, db, guildId).catch(() => {});
                const movedMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                const displayName = movedMember?.displayName || userId;
                await interaction.editReply({
                    content: `✅ **${displayName}** moved from **${getRoleLabel(fromRole)}** to **${getRoleLabel(toRole)}**.`,
                    embeds: [],
                    components: [buildBackToPanelRow(guildId)],
                });
                return;
            }
            if (customId.startsWith('gp_confirm_invite|')) {
                const [, guildId, roleType, targetUserId] = parseCustomId(customId);
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                await interaction.deferUpdate();
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                if (isUserInGuildAnyRole(db, guildId, targetUserId)) {
                    await interaction.editReply({
                        content: '❌ This player is already apart of this guild.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                if (getPendingInviteForTarget(db, guildId, targetUserId, roleType)) {
                    await interaction.editReply({
                        content: ' This user already has a pending invitation for this role.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                if (isUserInRole(db, guildId, targetUserId, roleType)) {
                    await interaction.editReply({
                        content: ` <@${targetUserId}> already has the role ${getRoleLabel(roleType)}.`,
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                if (!canAddUserToRole(db, guildId, roleType)) {
                    await interaction.editReply({
                        content: `❌ The ${getRoleLabel(roleType)} role has reached its limit.`,
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                // Bug 2: respect signing_closed setting
                const signingClosed = interaction.guildId ? getSetting(db, `${interaction.guildId}_signing_closed`) : null;
                if (signingClosed === '1') {
                    await interaction.editReply({ content: '❌ Signings are currently closed.', embeds: [], components: [] });
                    return;
                }
                // Cooldown check
                const cooldownDaysSetting = interaction.guildId ? parseInt(getSetting(db, `${interaction.guildId}_signing_cooldown_days`) || '0') : 0;
                const cooldownUnitSetting = interaction.guildId ? (getSetting(db, `${interaction.guildId}_signing_cooldown_unit`) || 'days') : 'days';
                if (cooldownDaysSetting > 0 && isOnCooldown(db, targetUserId, cooldownDaysSetting, cooldownUnitSetting)) {
                    const cd = getCooldown(db, targetUserId);
                    const expiresAt = cd ? new Date(cd.releasedAt.getTime() + cooldownDaysSetting * getCooldownMultiplier(cooldownUnitSetting)) : null;
                    const remaining = expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : 'soon';
                    await interaction.editReply({ content: `❌ <@${targetUserId}> is on a signing cooldown and cannot be signed until ${remaining}.`, embeds: [], components: [] });
                    return;
                }
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
                const inviteId = createInvite(db, guildId, targetUserId, roleType, interaction.user.id, expiresAt);
                const inviteRow = buildInviteDecisionRow(inviteId, roleType, interaction.guildId ?? '');
                const guild = getGuildById(db, guildId);
                const inviterMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const inviterNick = inviterMember?.displayName || interaction.user.username;
                const guildName = guild?.name || guildId;
                const inviteEmbed = buildInviteEmbed(roleType, guildName, inviterNick);
                let sentByDm = false;
                let dmFailureReason = 'unknown';
                try {
                    const targetUser = await client.users.fetch(targetUserId);
                    const dmChannel = await targetUser.createDM();
                    await dmChannel.send({
                        embeds: [inviteEmbed],
                        components: [inviteRow],
                    });
                    sentByDm = true;
                }
                catch (dmError) {
                    sentByDm = false;
                    const rawCode = dmError?.code;
                    dmFailureReason = rawCode ? `code ${rawCode}` : 'unknown reason';
                    console.warn(`Failed to send invite DM to ${targetUserId}:`, dmError);
                }
                if (!sentByDm) {
                    // DMs disabled — create a private temporary channel for the invited user
                    let tempChannel = null;
                    try {
                        const targetUser = await client.users.fetch(targetUserId).catch(() => null);
                        const safeName = (targetUser?.username || targetUserId).toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
                        const inviteCategoryId = interaction.guildId ? getSetting(db, `${interaction.guildId}_invite_category_id`) : null;
                        tempChannel = await interaction.guild?.channels.create({
                            name: `invite-${safeName}`,
                            type: ChannelType.GuildText,
                            ...(inviteCategoryId ? { parent: inviteCategoryId } : {}),
                            permissionOverwrites: [
                                { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                                { id: targetUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
                                { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
                            ],
                        });
                        if (tempChannel) {
                            await tempChannel.send({
                                content: `<@${targetUserId}> You have a guild invite (your DMs are disabled, so this private channel was created for you). It will be deleted once you respond or it expires.`,
                                embeds: [inviteEmbed],
                                components: [inviteRow],
                                allowedMentions: { users: [targetUserId] },
                            });
                            setInviteTempChannel(db, inviteId, tempChannel.id);
                        }
                    } catch (chErr) {
                        console.warn('[invite] Failed to create temp channel:', chErr?.message);
                        // Last resort: post in current channel
                        await interaction.channel?.send({
                            content: `<@${targetUserId}>`,
                            embeds: [inviteEmbed],
                            components: [inviteRow],
                            allowedMentions: { users: [targetUserId] },
                        });
                    }
                }
                await interaction.editReply({
                    content: sentByDm
                        ? `✅ Invite sent via DM to <@${targetUserId}>.`
                        : `✅ DMs disabled — a private channel was created for <@${targetUserId}>.`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId.startsWith('gp_invite_accept|') || customId.startsWith('gp_invite_decline|')) {
                const [action, inviteIdRaw, savedDiscordGuildId] = parseCustomId(customId);
                const inviteId = Number(inviteIdRaw);
                const validation = validateInviteForAction(db, inviteId);
                if (!validation.invite) {
                    await interaction.reply({
                        content: `❌ ${validation.reason || 'Invalid invite.'}`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const invite = validation.invite;
                if (invite.targetUserId !== interaction.user.id) {
                    await interaction.reply({
                        content: '❌ Only the invited user can respond to this invitation.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const deleteTempInviteChannel = () => {
                    if (!invite.temp_channel_id) return;
                    setTimeout(() => client.channels.fetch(invite.temp_channel_id).then(ch => { if (ch && 'delete' in ch) ch.delete().catch(() => null); }).catch(() => null), 3000);
                };
                if (action === 'gp_invite_decline') {
                    setInviteStatus(db, inviteId, 'DECLINED');
                    await interaction.update({ content: '❌ Invitation declined.', components: [] });
                    deleteTempInviteChannel();
                    return;
                }
                if (!canAddUserToRole(db, invite.guildId, invite.roleType)) {
                    setInviteStatus(db, inviteId, 'DECLINED');
                    await interaction.update({ content: `❌ Unable to accept: ${getRoleLabel(invite.roleType)} has reached its limit.`, components: [] });
                    deleteTempInviteChannel();
                    return;
                }
                if (isUserInRole(db, invite.guildId, invite.targetUserId, invite.roleType)) {
                    setInviteStatus(db, inviteId, 'DECLINED');
                    await interaction.update({ content: ' You already have this role.', components: [] });
                    deleteTempInviteChannel();
                    return;
                }
                const added = addMemberToRole(db, invite.guildId, invite.targetUserId, invite.roleType);
                if (!added) {
                    setInviteStatus(db, inviteId, 'DECLINED');
                    await interaction.update({ content: '❌ Unable to complete role assignment.', components: [] });
                    deleteTempInviteChannel();
                    return;
                }
                setInviteStatus(db, inviteId, 'ACCEPTED');
                const inviteRoleType = invite.roleType;
                const effectiveDiscordGuildId = savedDiscordGuildId || interaction.guildId || null;
                const dbGuild = getGuildById(db, invite.guildId);
                // Check if there's a signing approval channel configured
                const signingLogChannelId = effectiveDiscordGuildId
                    ? getSetting(db, `${effectiveDiscordGuildId}_signing_log_channel_id`)
                    : null;
                if (signingLogChannelId) {
                    // Send approval request to admin channel — roles assigned only after admin approves
                    try {
                        const discordGuildForSigning = effectiveDiscordGuildId
                            ? (client.guilds.cache.get(effectiveDiscordGuildId) || await client.guilds.fetch(effectiveDiscordGuildId).catch(() => null))
                            : null;
                        const logChannel = discordGuildForSigning
                            ? (discordGuildForSigning.channels.cache.get(signingLogChannelId) || await discordGuildForSigning.channels.fetch(signingLogChannelId).catch(() => null))
                            : await client.channels.fetch(signingLogChannelId).catch(() => null);
                        if (logChannel) {
                            const inviterUser = invite.inviterId ? await client.users.fetch(invite.inviterId).catch(() => null) : null;
                            const approvalEmbed = new EmbedBuilder()
                                .setTitle('📋 Signing Approval Required')
                                .setColor(0x5BADFF)
                                .addFields({ name: 'Player', value: `<@${invite.targetUserId}>`, inline: true }, { name: 'Role', value: getRoleLabel(inviteRoleType), inline: true }, { name: 'Guild', value: dbGuild?.name || invite.guildId, inline: true }, { name: 'Signed by', value: inviterUser ? `<@${inviterUser.id}>` : 'Unknown', inline: true })
                                .setTimestamp();
                            const approvalRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                                .setCustomId(`gp_sign_approve|${inviteId}|${effectiveDiscordGuildId}`)
                                .setLabel('Approve')
                                .setStyle(ButtonStyle.Success), new ButtonBuilder()
                                .setCustomId(`gp_sign_decline|${inviteId}|${effectiveDiscordGuildId}`)
                                .setLabel('Decline')
                                .setStyle(ButtonStyle.Danger));
                            await logChannel.send({ embeds: [approvalEmbed], components: [approvalRow] }).catch(() => null);
                        }
                    }
                    catch (e) {
                        console.warn('Failed to send signing approval request:', e?.message);
                    }
                    await refreshGuildPanel(client, db, invite.guildId).catch(() => { });
                    await interaction.update({
                        content: `✅ Signing accepted! Your request for **${getRoleLabel(inviteRoleType)}** in **${dbGuild?.name || invite.guildId}** is pending admin approval.`,
                        components: [],
                    });
                    deleteTempInviteChannel();
                }
                else {
                    // No approval channel — assign Discord roles immediately
                    const configuredRoleId = effectiveDiscordGuildId
                        ? (inviteRoleType === 'CO_LEADER' ? getSetting(db, `${effectiveDiscordGuildId}_guild_co_leader_role_id`) : null)
                            ?? (inviteRoleType === 'MANAGER' ? getSetting(db, `${effectiveDiscordGuildId}_guild_manager_role_id`) : null)
                        : null;
                    const discordRoleId = getDiscordRoleIdForRoleType(inviteRoleType, db, effectiveDiscordGuildId ?? undefined);
                    if (discordRoleId && effectiveDiscordGuildId) {
                        const roleAssigned = await assignDiscordRoleById(client, effectiveDiscordGuildId, invite.targetUserId, discordRoleId);
                        if (!roleAssigned && configuredRoleId) {
                            removeMemberFromRole(db, invite.guildId, invite.targetUserId, inviteRoleType);
                            setInviteStatus(db, inviteId, 'DECLINED');
                            await interaction.update({
                                content: '❌ Unable to accept invitation: failed to assign Discord role. Contact an admin.',
                                components: [],
                            });
                            deleteTempInviteChannel();
                            return;
                        }
                    }
                    if (effectiveDiscordGuildId && dbGuild?.name) {
                        try {
                            const discordGuild = client.guilds.cache.get(effectiveDiscordGuildId) || await client.guilds.fetch(effectiveDiscordGuildId).catch(() => null);
                            if (discordGuild) {
                                let nameRole = discordGuild.roles.cache.find(r => r.name === dbGuild.name)
                                    || await discordGuild.roles.create({ name: dbGuild.name, reason: `VVLeague: role for guild ${dbGuild.name}` }).catch(() => null);
                                if (nameRole) {
                                    const member = await discordGuild.members.fetch(invite.targetUserId).catch(() => null);
                                    if (member) await member.roles.add(nameRole).catch(() => null);
                                }
                            }
                        }
                        catch (e) {
                            console.warn(`Failed to assign guild name role "${dbGuild.name}":`, e?.message);
                        }
                    }
                    // Sync to site
                    if (dbGuild?.site_org_id) {
                        try {
                            const { signMember } = await import('./siteapi.js');
                            const targetUser = await client.users.fetch(invite.targetUserId).catch(() => null);
                            const siteRole = invite.roleType === 'SUB' ? 'Sub' : 'Player';
                            await signMember(dbGuild.site_org_id, invite.targetUserId, targetUser?.username || invite.targetUserId, siteRole);
                        }
                        catch (e) { console.warn('Failed to sync signing to site:', e?.message); }
                    }
                    // Announce to public signings channel
                    const announceChannelId = effectiveDiscordGuildId ? getSetting(db, `${effectiveDiscordGuildId}_signings_announce_channel_id`) : null;
                    if (announceChannelId && effectiveDiscordGuildId) {
                        try {
                            const announceGuild = client.guilds.cache.get(effectiveDiscordGuildId) || await client.guilds.fetch(effectiveDiscordGuildId).catch(() => null);
                            const announceChannel = announceGuild ? (announceGuild.channels.cache.get(announceChannelId) || await announceGuild.channels.fetch(announceChannelId).catch(() => null)) : null;
                            if (announceChannel && 'send' in announceChannel) {
                                if (announceGuild && announceGuild.roles.cache.size <= 1) await announceGuild.roles.fetch().catch(() => null);
                                const guildNameRole = announceGuild?.roles.cache.find(r => r.name === (dbGuild?.name || ''));
                                const guildMention = guildNameRole ? `<@&${guildNameRole.id}>` : `**${dbGuild?.name || invite.guildId}**`;
                                const announceEmbed = new EmbedBuilder()
                                    .setColor(0x5BADFF)
                                    .setDescription(`<@${invite.targetUserId}> has been signed to ${guildMention} as **${getRoleLabel(invite.roleType)}**`);
                                await announceChannel.send({ embeds: [announceEmbed] }).catch(() => null);
                            }
                        }
                        catch (e) { console.warn('Failed to send signing announcement:', e?.message); }
                    }
                    await refreshGuildPanel(client, db, invite.guildId).catch(() => { });
                    await interaction.update({
                        content: `✅ Invitation accepted for **${getRoleLabel(invite.roleType)}**.`,
                        components: [],
                    });
                    deleteTempInviteChannel();
                }
                return;
            }
            if (customId.startsWith('gp_confirm_remove|')) {
                const [, guildId, roleType, targetUserId] = parseCustomId(customId);
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                await interaction.deferUpdate();
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (actorRole !== 'LEADER' && actorRole !== 'CO_LEADER') {
                    await replyPermissionError(interaction, '❌ Only the Guild Leader or Co-Leader can remove members.');
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (guild?.leaderId === targetUserId) {
                    await interaction.editReply({
                        content: '❌ The guild leader cannot be removed from this panel.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const signingLogChannelId = interaction.guildId
                    ? getSetting(db, `${interaction.guildId}_signing_log_channel_id`)
                    : null;
                if (!signingLogChannelId) {
                    await interaction.editReply({
                        content: '❌ No approval channel configured. Set one with `/setup signing_log_channel:#channel`.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                // Send removal request to admin channel for approval — removal only happens after admin approves
                let logChannel = null;
                try {
                    const discordGuildForRemoval = interaction.guildId
                        ? (client.guilds.cache.get(interaction.guildId) || await client.guilds.fetch(interaction.guildId).catch(() => null))
                        : null;
                    logChannel = discordGuildForRemoval
                        ? (discordGuildForRemoval.channels.cache.get(signingLogChannelId) || await discordGuildForRemoval.channels.fetch(signingLogChannelId).catch(() => null))
                        : await client.channels.fetch(signingLogChannelId).catch(() => null);
                }
                catch (e) { console.warn('Failed to fetch signing log channel:', e?.message); }
                if (!logChannel || !('send' in logChannel)) {
                    await interaction.editReply({
                        content: '❌ Could not reach the approval channel. Please check `/setup signing_log_channel`.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const targetUser = await client.users.fetch(targetUserId).catch(() => null);
                const approvalEmbed = new EmbedBuilder()
                    .setTitle('🗑️ Removal Approval Required')
                    .setColor(0xE74C3C)
                    .addFields(
                        { name: 'Player', value: `<@${targetUserId}>${targetUser ? ` (${targetUser.username})` : ''}`, inline: true },
                        { name: 'Role', value: getRoleLabel(roleType), inline: true },
                        { name: 'Guild', value: guild?.name || guildId, inline: true },
                        { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setTimestamp();
                const approvalRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gp_remove_approve|${guildId}|${roleType}|${targetUserId}`)
                        .setLabel('Approve Removal')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`gp_remove_decline|${guildId}|${roleType}|${targetUserId}`)
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Secondary)
                );
                const sent = await logChannel.send({ embeds: [approvalEmbed], components: [approvalRow] }).catch(() => null);
                if (!sent) {
                    await interaction.editReply({
                        content: '❌ Failed to send the removal request. Please try again.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                await interaction.editReply({
                    content: `⏳ Removal request for <@${targetUserId}> sent for admin approval.`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            // Admin approves a signing request
            if (customId.startsWith('gp_sign_approve|')) {
                const [, inviteIdRaw, discordGuildId] = parseCustomId(customId);
                const inviteId = Number(inviteIdRaw);
                // Defer immediately — all async work below would exceed Discord's 3-second window
                await interaction.deferUpdate();
                const invite = getInviteById(db, inviteId);
                if (!invite) {
                    await interaction.editReply({ content: '❌ Invite not found or already processed.', components: [], embeds: [] });
                    return;
                }
                // Idempotency guard — prevent duplicate announcements if button is clicked twice
                if (invite.admin_processed) {
                    await interaction.editReply({ content: '⚠️ This signing request has already been processed.', components: [], embeds: [] });
                    return;
                }
                // Mark as processed synchronously before any async work to prevent races
                setInviteAdminProcessed(db, inviteId);
                const dbGuild = getGuildById(db, invite.guildId);
                const discordGuild = discordGuildId
                    ? (client.guilds.cache.get(discordGuildId) || await client.guilds.fetch(discordGuildId).catch(() => null))
                    : null;
                // Assign type-specific role (CO_LEADER / MANAGER)
                const discordRoleId = discordGuildId ? getDiscordRoleIdForRoleType(invite.roleType, db, discordGuildId) : null;
                if (discordRoleId && discordGuildId) {
                    await assignDiscordRoleById(client, discordGuildId, invite.targetUserId, discordRoleId);
                }
                // Assign guild name role
                if (discordGuild && dbGuild?.name) {
                    try {
                        let nameRole = discordGuild.roles.cache.find(r => r.name === dbGuild.name)
                            || await discordGuild.roles.create({ name: dbGuild.name, reason: `VVLeague: role for guild ${dbGuild.name}` }).catch(() => null);
                        if (nameRole) {
                            const member = await discordGuild.members.fetch(invite.targetUserId).catch(() => null);
                            if (member) await member.roles.add(nameRole).catch(() => null);
                        }
                    }
                    catch (e) {
                        console.warn(`[sign_approve] Failed to assign guild name role:`, e?.message);
                    }
                }
                // Sync to site
                if (dbGuild?.site_org_id) {
                    try {
                        const { signMember } = await import('./siteapi.js');
                        const siteRole = invite.roleType === 'SUB' ? 'Sub' : 'Player';
                        const targetUserForSite = await client.users.fetch(invite.targetUserId).catch(() => null);
                        await signMember(dbGuild.site_org_id, invite.targetUserId, targetUserForSite?.username || invite.targetUserId, siteRole);
                    }
                    catch (e) { console.warn('Failed to sync signing approval to site:', e?.message); }
                }
                // Notify player
                const targetUser = await client.users.fetch(invite.targetUserId).catch(() => null);
                if (targetUser) {
                    await targetUser.send({ content: `✅ Your signing for **${getRoleLabel(invite.roleType)}** in **${dbGuild?.name || invite.guildId}** has been approved! You now have the guild role.` }).catch(() => null);
                }
                // Announce to public signings channel
                const announceChannelId = discordGuildId ? getSetting(db, `${discordGuildId}_signings_announce_channel_id`) : null;
                if (announceChannelId && discordGuild) {
                    try {
                        const announceChannel = discordGuild.channels.cache.get(announceChannelId) || await discordGuild.channels.fetch(announceChannelId).catch(() => null);
                        if (announceChannel && 'send' in announceChannel) {
                            if (discordGuild.roles.cache.size <= 1) await discordGuild.roles.fetch().catch(() => null);
                            const guildNameRole = discordGuild.roles.cache.find(r => r.name === (dbGuild?.name || ''));
                            const guildMention = guildNameRole ? `<@&${guildNameRole.id}>` : `**${dbGuild?.name || invite.guildId}**`;
                            const announceEmbed = new EmbedBuilder()
                                .setTitle('🖊️ Player Signed')
                                .setColor(0x5BADFF)
                                .setDescription(`<@${invite.targetUserId}> has been signed to ${guildMention} as **${getRoleLabel(invite.roleType)}**`);
                            await announceChannel.send({ embeds: [announceEmbed] }).catch(() => null);
                        }
                    }
                    catch (e) { console.warn('Failed to send signing announcement:', e?.message); }
                }
                await refreshGuildPanel(client, db, invite.guildId).catch(() => { });
                await interaction.editReply({
                    content: `✅ Signing approved by <@${interaction.user.id}> — <@${invite.targetUserId}> received the **${getRoleLabel(invite.roleType)}** role in **${dbGuild?.name || invite.guildId}**.`,
                    components: [],
                    embeds: [],
                });
                return;
            }
            // Admin declines a signing request
            if (customId.startsWith('gp_sign_decline|')) {
                const [, inviteIdRaw] = parseCustomId(customId);
                const inviteId = Number(inviteIdRaw);
                // Defer immediately — async work below would exceed Discord's 3-second window
                await interaction.deferUpdate();
                const invite = getInviteById(db, inviteId);
                if (!invite) {
                    await interaction.editReply({ content: '❌ Invite not found.', components: [], embeds: [] });
                    return;
                }
                // Idempotency guard
                if (invite.admin_processed) {
                    await interaction.editReply({ content: '⚠️ This signing request has already been processed.', components: [], embeds: [] });
                    return;
                }
                // Mark as processed synchronously before any async work
                setInviteAdminProcessed(db, inviteId);
                const dbGuild = getGuildById(db, invite.guildId);
                // Reverse the DB signing
                removeMemberFromRole(db, invite.guildId, invite.targetUserId, invite.roleType);
                setInviteStatus(db, inviteId, 'DECLINED');
                // Notify player
                const targetUser = await client.users.fetch(invite.targetUserId).catch(() => null);
                if (targetUser) {
                    await targetUser.send({ content: `❌ Your signing request for **${getRoleLabel(invite.roleType)}** in **${dbGuild?.name || invite.guildId}** was declined by an admin.` }).catch(() => null);
                }
                await refreshGuildPanel(client, db, invite.guildId).catch(() => { });
                await interaction.editReply({
                    content: `❌ Signing declined — <@${invite.targetUserId}> was not added to **${dbGuild?.name || invite.guildId}**.`,
                    components: [],
                    embeds: [],
                });
                return;
            }
            // Admin approves a removal request
            if (customId.startsWith('gp_remove_approve|')) {
                const [, guildId, roleType, targetUserId] = parseCustomId(customId);
                const discordGuildId = interaction.guildId;
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid data.', components: [] });
                    return;
                }
                // Defer immediately — multiple async steps below would exceed Discord's 3-second window
                await interaction.deferUpdate();
                const guild = getGuildById(db, guildId);
                // removeMemberFromRole is synchronous SQLite — acts as the idempotency guard
                const removed = removeMemberFromRole(db, guildId, targetUserId, roleType);
                if (!removed) {
                    await interaction.editReply({ content: '⚠️ Member was already removed.', components: [], embeds: [] });
                    return;
                }
                const _cdServerId = discordGuildId || interaction.guildId;
                const _cdDays2 = parseInt(getSetting(db, `${_cdServerId}_signing_cooldown_days`) || '0');
                const _cdUnit2 = getSetting(db, `${_cdServerId}_signing_cooldown_unit`) || 'days';
                const _cdNotifyAt2 = _cdDays2 > 0 ? new Date(Date.now() + _cdDays2 * getCooldownMultiplier(_cdUnit2)).toISOString() : null;
                setCooldown(db, targetUserId, guild?.name || '', _cdNotifyAt2);
                // Remove type-specific role (CO_LEADER / MANAGER)
                if (discordGuildId) {
                    const roleId = getDiscordRoleIdForRoleType(roleType, db, discordGuildId);
                    if (roleId && !shouldKeepRoleForUser(db, targetUserId, roleType)) {
                        const discordGuild = client.guilds.cache.get(discordGuildId) || await client.guilds.fetch(discordGuildId).catch(() => null);
                        if (discordGuild) {
                            const role = discordGuild.roles.cache.get(roleId) || await discordGuild.roles.fetch(roleId).catch(() => null);
                            const member = await discordGuild.members.fetch(targetUserId).catch(() => null);
                            if (role && member) await member.roles.remove(role).catch(() => null);
                        }
                    }
                    // Remove guild name role
                    await removeGuildNameRole(client, discordGuildId, guild, targetUserId);
                }
                // Sync removal to site
                try {
                    const { releaseMember } = await import('./siteapi.js');
                    await releaseMember(targetUserId);
                }
                catch (e) { console.warn('Failed to sync removal approval to site:', e?.message); }
                // Notify player
                const targetUser = await client.users.fetch(targetUserId).catch(() => null);
                if (targetUser) {
                    await targetUser.send({ embeds: [buildRemovalEmbed(roleType, guild?.name || guildId)] }).catch(() => null);
                }
                await refreshGuildPanel(client, db, guildId).catch(() => { });
                // Post to release log channel
                const _releaseLogChId2 = discordGuildId ? getSetting(db, `${discordGuildId}_release_log_channel_id`) : null;
                if (_releaseLogChId2) {
                    const _releaseLogCh2 = await client.channels.fetch(_releaseLogChId2).catch(() => null);
                    if (_releaseLogCh2 && 'send' in _releaseLogCh2) {
                        await _releaseLogCh2.send({ embeds: [new EmbedBuilder()
                            .setTitle('🚫 Player Kicked')
                            .setColor(0xE74C3C)
                            .addFields(
                                { name: 'Player', value: `<@${targetUserId}>${targetUser ? ` (${targetUser.username})` : ''}`, inline: true },
                                { name: 'Guild', value: guild?.name || guildId, inline: true },
                                { name: 'Role', value: getRoleLabel(roleType), inline: true },
                                { name: 'Approved by', value: `<@${interaction.user.id}>`, inline: true }
                            )
                            .setTimestamp()] }).catch(() => null);
                    }
                }
                await interaction.editReply({
                    content: `✅ Removal approved — <@${targetUserId}> removed from **${getRoleLabel(roleType)}** in **${guild?.name || guildId}**.`,
                    components: [],
                    embeds: [],
                });
                return;
            }
            // Admin declines a removal request
            if (customId.startsWith('gp_remove_decline|')) {
                const [, , roleTypeDec, targetUserIdDec] = parseCustomId(customId);
                await interaction.deferUpdate();
                if (targetUserIdDec) {
                    const targetUserDec = await client.users.fetch(targetUserIdDec).catch(() => null);
                    if (targetUserDec) {
                        await targetUserDec.send({ content: `ℹ️ Your removal request${roleTypeDec ? ` from **${getRoleLabel(roleTypeDec)}**` : ''} was declined by an admin — no changes were made.` }).catch(() => null);
                    }
                }
                await interaction.editReply({
                    content: '❌ Removal request declined — no changes made.',
                    components: [],
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('gp_confirm_transfer|')) {
                const [, guildId, targetUserId] = parseCustomId(customId);
                if (!guildId || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                await interaction.deferUpdate();
                const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
                if (!canTransfer) {
                    await replyPermissionError(interaction, '❌ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.editReply({ content: '❌ Guild not found.', embeds: [], components: [] });
                    return;
                }
                if (targetUserId === guild.leaderId) {
                    await interaction.editReply({
                        content: ' This user is already the current guild leader.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const registeredMemberIds = getRegisteredGuildMemberIds(db, guildId);
                if (!registeredMemberIds.includes(targetUserId)) {
                    await interaction.editReply({
                        content: '❌ The selected user is not a registered member of this guild.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const previousLeaderId = guild.leaderId;
                const previousCoLeaderId = guild.coLeaderId;
                db.prepare('UPDATE Guilds SET leaderId = ?, coLeaderId = CASE WHEN coLeaderId = ? THEN NULL ELSE coLeaderId END WHERE id = ?')
                    .run(targetUserId, targetUserId, guildId);
                // Previous leader moves to MainRosters so they still appear in the guild panel
                db.prepare('INSERT OR IGNORE INTO MainRosters (guildId, userId) VALUES (?, ?)').run(guildId, previousLeaderId);
                // New leader is now tracked in Guilds.leaderId — remove from roster tables to avoid duplicates
                db.prepare('DELETE FROM MainRosters WHERE guildId = ? AND userId = ?').run(guildId, targetUserId);
                db.prepare('DELETE FROM SubRosters WHERE guildId = ? AND userId = ?').run(guildId, targetUserId);
                db.prepare('DELETE FROM Managers WHERE guildId = ? AND userId = ?').run(guildId, targetUserId);
                const discordGuildId = getDiscordGuildIdFromInternalGuildId(guildId);
                const leaderRoleId = getSetting(db, `${interaction.guildId}_guild_leader_role_id`) || FIXED_ROLE_IDS.GUILD_LEADER;
                const assigned = await assignDiscordRoleById(client, discordGuildId, targetUserId, leaderRoleId);
                if (!assigned) {
                    db.prepare('UPDATE Guilds SET leaderId = ?, coLeaderId = ? WHERE id = ?')
                        .run(previousLeaderId, previousCoLeaderId, guildId);
                    db.prepare('DELETE FROM MainRosters WHERE guildId = ? AND userId = ?').run(guildId, previousLeaderId);
                    await interaction.editReply({
                        content: '❌ Failed to assign the Guild Leader role on Discord. Ownership transfer canceled.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                await maybeRemoveGuildLeaderDiscordRole(interaction, db, previousLeaderId);
                // Sync new leader's role to site and demote previous leader from Leader to Player.
                // /sign is insert-only (409 if exists), so release + re-sign to update roles.
                if (guild.site_org_id) {
                    try {
                        const { signMember: _signMember, releaseMember: _releaseMember } = await import('./siteapi.js');
                        const newLeaderUser = await client.users.fetch(targetUserId).catch(() => null);
                        await _releaseMember(targetUserId).catch(() => null);
                        await _signMember(guild.site_org_id, targetUserId, newLeaderUser?.username || targetUserId, 'Leader').catch(() => null);
                        const prevLeaderUser = await client.users.fetch(previousLeaderId).catch(() => null);
                        await _releaseMember(previousLeaderId).catch(() => null);
                        await _signMember(guild.site_org_id, previousLeaderId, prevLeaderUser?.username || previousLeaderId, 'Player').catch(() => null);
                    } catch {
                        // site sync failure is non-fatal
                    }
                }
                await refreshGuildPanel(client, db, guildId).catch(() => { });
                await interaction.editReply({
                    content: `✅ Ownership transferred successfully to <@${targetUserId}>.`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId.startsWith('gp_leave_guild|')) {
                await interaction.deferUpdate();
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.followUp({ content: '❌ Invalid action.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.followUp({ content: '❌ Guild not found.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const userId = interaction.user.id;
                if (guild.leaderId === userId) {
                    if (!guild.coLeaderId) {
                        await interaction.followUp({
                            content: '❌ You are the guild leader and must transfer ownership before leaving. Use Ownership Transfer first.',
                            flags: MessageFlags.Ephemeral,
                        });
                        return;
                    }
                    db.prepare('UPDATE Guilds SET leaderId = ?, coLeaderId = NULL WHERE id = ?')
                        .run(guild.coLeaderId, guildId);
                    await maybeRemoveGuildLeaderDiscordRole(interaction, db, userId);
                    const leaderRoleId2 = getSetting(db, `${interaction.guildId}_guild_leader_role_id`) || FIXED_ROLE_IDS.GUILD_LEADER;
                    await assignDiscordRoleById(client, getDiscordGuildIdFromInternalGuildId(guildId), guild.coLeaderId, leaderRoleId2).catch(() => null);
                    // co-leader role remains as null; if coLeader role should be removed, we skip for simplicity
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({
                        content: '✅ You left the guild. Ownership transferred to the former co-leader.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                if (guild.coLeaderId === userId) {
                    removeMemberFromRole(db, guildId, userId, 'CO_LEADER');
                    await maybeRemoveDiscordRoleByType(interaction, db, userId, 'CO_LEADER');
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({ content: '✅ You left co-leader role.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
                    removeMemberFromRole(db, guildId, userId, 'MANAGER');
                    await maybeRemoveDiscordRoleByType(interaction, db, userId, 'MANAGER');
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({ content: '✅ You were removed from Manager and left the guild.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (db.prepare('SELECT 1 FROM MainRosters WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
                    removeMemberFromRole(db, guildId, userId, 'MAIN');
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({ content: '✅ You left the main roster.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (db.prepare('SELECT 1 FROM SubRosters WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
                    removeMemberFromRole(db, guildId, userId, 'SUB');
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({ content: '✅ You left the sub roster.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.followUp({ content: '❌ You are not a member of this guild (or already left).', flags: MessageFlags.Ephemeral });
                return;
            }
            if (customId.startsWith('gp_cancel_action|')) {
                await interaction.update({
                    content: '❎ Action canceled.',
                    components: [],
                    embeds: [],
                });
                return;
            }
        }
        // ── Signing flow buttons ──────────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('sign_')) {
            // Defer immediately — all action paths have async work before responding
            await interaction.deferUpdate();
            const parts = interaction.customId.split('_');
            const action = parts[1]; // accept | decline | approve | reject
            const signingId = parseInt(parts[2] ?? '0');
            const { getSigningRequest, updateSigningStatus, getSetting } = await import('./database.js');
            const { signMember, getAllOrgs } = await import('./siteapi.js');
            const req = getSigningRequest(db, signingId);
            if (!req) {
                await interaction.followUp({ content: '❌ Signing request not found or expired.', ephemeral: true });
                return;
            }
            if (action === 'accept') {
                if (interaction.user.id !== req.target_discord_id) {
                    await interaction.followUp({ content: '❌ This signing offer is not for you.', ephemeral: true });
                    return;
                }
                if (req.status !== 'PENDING_PLAYER') {
                    await interaction.followUp({ content: '❌ This offer has already been responded to.', ephemeral: true });
                    return;
                }
                // Send to log channel
                const logChannelId = getSetting(db, 'log_channel_id');
                if (!logChannelId) {
                    await interaction.followUp({ content: '❌ No log channel set. Ask staff to use /setlogchannel.', ephemeral: true });
                    return;
                }
                const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
                if (!logChannel || !logChannel.isTextBased() || !('send' in logChannel)) {
                    await interaction.followUp({ content: '❌ Log channel not accessible.', ephemeral: true });
                    return;
                }
                const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
                const embed = new EmbedBuilder()
                    .setTitle('⏳ Signing Request — Pending Staff Approval')
                    .setColor(0x5BADFF)
                    .addFields({ name: 'Guild', value: `${req.org_tag}`, inline: true }, { name: 'Player', value: `<@${req.target_discord_id}> (${req.target_name})`, inline: true }, { name: 'Role', value: req.role, inline: true }, { name: 'Invited by', value: `<@${req.inviter_discord_id}>`, inline: true });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sign_approve_${signingId}`).setLabel('Approve').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`sign_reject_${signingId}`).setLabel('Reject').setStyle(ButtonStyle.Danger));
                const logMsg = await logChannel.send({ embeds: [embed], components: [row] });
                updateSigningStatus(db, signingId, 'PENDING_STAFF', logMsg.id);
                await interaction.editReply({ content: '✅ You accepted the signing offer. A staff member will review it.', components: [], embeds: [] });
            }
            else if (action === 'decline') {
                if (interaction.user.id !== req.target_discord_id) {
                    await interaction.followUp({ content: '❌ This signing offer is not for you.', ephemeral: true });
                    return;
                }
                updateSigningStatus(db, signingId, 'DECLINED');
                await interaction.editReply({ content: '❌ You declined the signing offer.', components: [], embeds: [] });
            }
            else if (action === 'approve') {
                // Staff approving
                const staffRoleId = interaction.guildId
                    ? getSetting(db, `${interaction.guildId}_staff_role_id`)
                    : null;
                if (staffRoleId && interaction.guild) {
                    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                    if (!member?.roles.cache.has(staffRoleId)) {
                        await interaction.followUp({ content: '❌ You are not staff.', ephemeral: true });
                        return;
                    }
                }
                if (req.status !== 'PENDING_STAFF') {
                    await interaction.followUp({ content: '❌ Already handled.', ephemeral: true });
                    return;
                }
                // Mark APPROVED before site API call — idempotency guard prevents duplicate processing
                updateSigningStatus(db, signingId, 'APPROVED');
                try {
                    await signMember(req.org_id, req.target_discord_id, req.target_name, req.role);
                }
                catch (e) {
                    await interaction.followUp({ content: `❌ Could not add to site: ${e.message}`, ephemeral: true });
                    return;
                }
                // Give guild role
                const orgs = await getAllOrgs().catch(() => []);
                const org = orgs.find((o) => o.tag === req.org_tag);
                if (org?.discord_role_id && interaction.guild) {
                    const gm = await interaction.guild.members.fetch(req.target_discord_id).catch(() => null);
                    if (gm)
                        await gm.roles.add(org.discord_role_id).catch(() => null);
                }
                // Public announcement
                const { EmbedBuilder } = await import('discord.js');
                const pubChannelId = getSetting(db, 'public_channel_id');
                if (pubChannelId) {
                    const pubChannel = await client.channels.fetch(pubChannelId).catch(() => null);
                    if (pubChannel && pubChannel.isTextBased() && 'send' in pubChannel) {
                        const pubEmbed = new EmbedBuilder()
                            .setTitle('📝 New Signing')
                            .setColor(0x5BADFF)
                            .setDescription(`<@${req.target_discord_id}> has been signed to **${req.org_tag}** as **${req.role}**!`);
                        await pubChannel.send({ embeds: [pubEmbed] });
                    }
                }
                await interaction.editReply({ content: `✅ Signing approved. ${req.target_name} added to ${req.org_tag}.`, components: [], embeds: [] });
            }
            else if (action === 'reject') {
                const staffRoleId = interaction.guildId
                    ? getSetting(db, `${interaction.guildId}_staff_role_id`)
                    : null;
                if (staffRoleId && interaction.guild) {
                    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                    if (!member?.roles.cache.has(staffRoleId)) {
                        await interaction.followUp({ content: '❌ You are not staff.', ephemeral: true });
                        return;
                    }
                }
                if (req.status !== 'PENDING_STAFF') {
                    await interaction.followUp({ content: '❌ Already handled.', ephemeral: true });
                    return;
                }
                updateSigningStatus(db, signingId, 'REJECTED');
                // DM the player
                try {
                    const user = await client.users.fetch(req.target_discord_id);
                    await user.send(`❌ Your signing to **${req.org_tag}** was rejected by staff.`);
                }
                catch { /* ignore */ }
                await interaction.editReply({ content: `❌ Signing rejected.`, components: [], embeds: [] });
            }
            return;
        }
        // ── End signing flow ──────────────────────────────────────────
        if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            if (customId.startsWith('wt_select_opponent|')) {
                const [, actorGuildId] = parseCustomId(customId);
                const opponentGuildId = interaction.values[0];
                const actorGuild = actorGuildId ? getGuildById(db, actorGuildId) : null;
                const opponentGuild = getGuildById(db, opponentGuildId);
                if (!actorGuild || !opponentGuild) {
                    await interaction.update({
                        content: '❌ Invalid guild selection.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const starterRole = getGuildRoleInWar(actorGuild, interaction.user.id);
                const isManager = !!db
                    .prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?')
                    .get(actorGuild.id, interaction.user.id);
                if (!starterRole && !isManager) {
                    await interaction.update({
                        content: '❌ You no longer have permission to open this war ticket.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                // Guild in dodge grace period cannot open tickets (double-check at selection time)
                const actorGraceSel = getGuildActiveDodge(db, actorGuild.id);
                if (actorGraceSel) {
                    const actorGraceEndSel = new Date(actorGraceSel.grace_until);
                    await interaction.update({
                        content: `⛔ **${actorGuild.name}** is currently in a **dodge grace period** and cannot open war tickets.\n\nThis grace period expires <t:${Math.floor(actorGraceEndSel.getTime() / 1000)}:R>.`,
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                // Check if opponent guild has an active dodge grace period
                const opponentGrace = getGuildActiveDodge(db, opponentGuild.id);
                if (opponentGrace) {
                    const graceEnd = new Date(opponentGrace.grace_until);
                    const timeLeft = graceEnd.getTime() - Date.now();
                    const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));
                    const minsLeft = Math.ceil(timeLeft / (1000 * 60));
                    const timeStr = hoursLeft >= 1 ? `${hoursLeft}h` : `${minsLeft}m`;
                    await interaction.update({
                        content: `⛔ **${opponentGuild.name}** is currently in a **dodge grace period** and cannot be challenged for another **${timeStr}**.\n\nThis grace period expires <t:${Math.floor(graceEnd.getTime() / 1000)}:R>.`,
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const warChannel = await createWarTicketChannel(interaction, db, actorGuild, opponentGuild);
                if (!warChannel) {
                    await interaction.update({
                        content: '❌ Failed to create war ticket channel. Check bot permissions and category setup.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                await interaction.update({
                    content: `✅ War ticket created successfully! Check <#${warChannel.id}>`,
                    components: [],
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('wt_finalize_winner_select|')) {
                const [, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const winnerGuildId = interaction.values[0];
                const war = getWarById(db, warId);
                if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.update({
                        content: '❌ This war is not available for finalization.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.update({
                        content: '❌ Invalid winner selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.update({
                        content: '❌ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const quickModal = new ModalBuilder()
                    .setCustomId(`wt_quick_modal|${war.id}|${winnerGuildId}`)
                    .setTitle('Finalize War')
                    .addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('score')
                            .setLabel('Final Score (Winner-Loser, e.g. 3-0)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('3-0')
                            .setRequired(true)
                            .setMaxLength(10)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('winner_elo_gain')
                            .setLabel('Winner ELO gain')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('20')
                            .setRequired(true)
                            .setMaxLength(6)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('loser_elo_loss')
                            .setLabel('Loser ELO loss')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('25')
                            .setRequired(true)
                            .setMaxLength(6)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('mvp_user')
                            .setLabel('MVP (name, @mention, or ID)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Player name (optional)')
                            .setRequired(false)
                            .setMaxLength(100)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('round_details')
                            .setLabel('Round Details (optional)')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Summarize the match, notable moments, etc.')
                            .setRequired(false)
                            .setMaxLength(500))
                    );
                await interaction.showModal(quickModal);
                return;
            }
            if (customId.startsWith('wt_finalize_score_select|')) {
                const [, warIdRaw, winnerGuildId] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const scoreValue = interaction.values[0];
                const parsedScore = parseWarScore(scoreValue);
                const war = getWarById(db, warId);
                if (!winnerGuildId) {
                    await interaction.update({
                        content: '❌ Invalid winner selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.update({
                        content: '❌ This war is not available for finalization.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.update({
                        content: '❌ Invalid winner selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (!parsedScore) {
                    await interaction.update({
                        content: '❌ Invalid score selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.update({
                        content: '❌ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const decisionRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`wt_finalize_now|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setLabel('Finalize Without Link')
                    .setStyle(ButtonStyle.Success), new ButtonBuilder()
                    .setCustomId(`wt_finalize_with_link|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setLabel('Send Clips Link')
                    .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                    .setCustomId(`wt_finalize_with_details|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setLabel('Finalize With Details')
                    .setStyle(ButtonStyle.Secondary));
                await interaction.update({
                    content: `Winner selected and score set to **${winnerScore}-${loserScore}**. Choose how you want to finalize:`,
                    components: [decisionRow],
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('wg_finalize_winner_select|')) {
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const winnerSide = interaction.values[0];
                const wager = getWagerById(db, wagerId);
                if (!wager || wager.status !== 'ACCEPTED') {
                    await interaction.update({
                        content: '❌ This wager is not available for finalization.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (!['CHALLENGER', 'CHALLENGED'].includes(winnerSide)) {
                    await interaction.update({
                        content: '❌ Invalid winner selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.update({
                        content: '❌ You do not have permission to finalize this wager. Configure the role with `/setup hoster_role`.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const modal = new ModalBuilder()
                    .setCustomId(`wg_finalize_elo_modal|${wager.id}|${winnerSide}`)
                    .setTitle('Finalize Wager')
                    .addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('winner_elo_gain')
                            .setLabel('Winner ELO gain')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('20')
                            .setRequired(true)
                            .setMaxLength(6)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('loser_elo_loss')
                            .setLabel('Loser ELO loss')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('25')
                            .setRequired(true)
                            .setMaxLength(6)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('season')
                            .setLabel('Season (e.g. S3)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('S3')
                            .setRequired(false)
                            .setMaxLength(10)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder()
                            .setCustomId('round_details')
                            .setLabel('Round Details (optional)')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Summarize the match, notable moments, etc.')
                            .setRequired(false)
                            .setMaxLength(500))
                    );
                await interaction.showModal(modal);
                return;
            }
            if (customId.startsWith('gp_action_select|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                const selectedAction = interaction.values[0];
                if (selectedAction === 'MANAGE_REMOVE') {
                    const manageableRoleTypes = getManageableRoleTypes(actorRole);
                    const roleOptionsMap = {
                        CO_LEADER: new StringSelectMenuOptionBuilder().setLabel('Co-Leader').setValue('CO_LEADER'),
                        MANAGER: new StringSelectMenuOptionBuilder().setLabel('Manager Guild').setValue('MANAGER'),
                        MAIN: new StringSelectMenuOptionBuilder().setLabel('Main Roster').setValue('MAIN'),
                        SUB: new StringSelectMenuOptionBuilder().setLabel('Sub Roster').setValue('SUB'),
                    };
                    const roleSelect = new StringSelectMenuBuilder()
                        .setCustomId(`gp_remove_role_select|${guildId}`)
                        .setPlaceholder('Select the role type to remove')
                        .addOptions(manageableRoleTypes.map(role => roleOptionsMap[role]));
                    await interaction.update({
                        content: 'Select a role type to list members available for removal.',
                        embeds: [],
                        components: [new ActionRowBuilder().addComponents(roleSelect)],
                    });
                    return;
                }
                const roleType = ADD_ACTION_MAP[selectedAction];
                if (!roleType) {
                    await interaction.update({
                        content: 'Invalid action.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`gp_add_user_select|${guildId}|${roleType}`)
                    .setPlaceholder(`Select a user for ${getRoleLabel(roleType)}`)
                    .setMinValues(1)
                    .setMaxValues(1);
                const embed = new EmbedBuilder()
                    .setTitle('Member Invitation')
                    .setDescription(`Choose a user to invite to **${getRoleLabel(roleType)}**.`)
                    .setColor(0x5BADFF);
                await interaction.update({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(userSelect)],
                    content: '',
                });
                return;
            }
            if (customId.startsWith('gp_remove_role_select|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const roleType = interaction.values[0];
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                const members = getMembersByRole(db, guildId, roleType);
                if (!members.length) {
                    await interaction.update({
                        content: ` No members found for **${getRoleLabel(roleType)}**.`,
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(members.length / 25));
                const currentPage = 1;
                const pageMembers = members.slice((currentPage - 1) * 25, currentPage * 25);
                const memberOptions = await Promise.all(pageMembers.map(async (userId) => {
                    const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel((guildMember?.displayName || userId).slice(0, 100))
                        .setDescription(`ID: ${userId}`)
                        .setValue(userId);
                }));
                const memberSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_remove_member_select|${guildId}|${roleType}`)
                    .setPlaceholder(`Select who to remove from ${getRoleLabel(roleType)}`)
                    .addOptions(memberOptions);
                const components = [
                    new ActionRowBuilder().addComponents(memberSelect),
                    buildBackToPanelRow(guildId),
                ];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${currentPage - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1), new ButtonBuilder()
                        .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${currentPage + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage >= totalPages));
                    components.splice(1, 0, pageRow);
                }
                await interaction.update({
                    content: `Select the member to remove from **${getRoleLabel(roleType)}**. Page ${currentPage}/${totalPages}.`,
                    components,
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('gp_remove_member_select|')) {
                const [, guildId, roleType] = parseCustomId(customId);
                const targetUserId = interaction.values[0];
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                const confirmRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`gp_confirm_remove|${guildId}|${roleType}|${targetUserId}`)
                    .setLabel('Confirm Removal')
                    .setStyle(ButtonStyle.Danger), new ButtonBuilder()
                    .setCustomId(`gp_cancel_action|${guildId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary));
                await interaction.update({
                    content: `Do you want to remove <@${targetUserId}> from **${getRoleLabel(roleType)}**?`,
                    embeds: [],
                    components: [confirmRow, buildBackToPanelRow(guildId)],
                });
                return;
            }
            if (customId.startsWith('gp_transfer_target_select|')) {
                const [, guildId] = parseCustomId(customId);
                const targetUserId = interaction.values[0];
                if (!guildId || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
                if (!canTransfer) {
                    await replyPermissionError(interaction, '❌ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.update({ content: '❌ Guild not found.', embeds: [], components: [] });
                    return;
                }
                if (targetUserId === guild.leaderId) {
                    await interaction.update({
                        content: ' This user is already the current guild leader.',
                        components: [buildBackToPanelRow(guildId)],
                        embeds: [],
                    });
                    return;
                }
                const registeredMemberIds = getRegisteredGuildMemberIds(db, guildId);
                if (!registeredMemberIds.includes(targetUserId)) {
                    await interaction.update({
                        content: '❌ The selected user is not a registered member of this guild.',
                        components: [buildBackToPanelRow(guildId)],
                        embeds: [],
                    });
                    return;
                }
                const confirmRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`gp_confirm_transfer|${guildId}|${targetUserId}`)
                    .setLabel('Confirm Transfer')
                    .setStyle(ButtonStyle.Danger), new ButtonBuilder()
                    .setCustomId(`gp_cancel_action|${guildId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary));
                await interaction.update({
                    content: `Do you want to transfer guild ownership to <@${targetUserId}>?`,
                    embeds: [],
                    components: [confirmRow, buildBackToPanelRow(guildId)],
                });
                return;
            }
            if (customId.startsWith('gp_rotate_member_select|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const value = interaction.values[0];
                const colonIdx = value.lastIndexOf(':');
                const userId = value.slice(0, colonIdx);
                const fromRole = value.slice(colonIdx + 1);
                const ROLE_LABELS_SHORT = { CO_LEADER: 'Co-Leader', MANAGER: 'Manager Guild', MAIN: 'Main Roster', SUB: 'Sub Roster' };
                const ALL_ROLES = ['CO_LEADER', 'MANAGER', 'MAIN', 'SUB'];
                const targetButtons = ALL_ROLES.filter(r => r !== fromRole).map(targetRole => {
                    const hasSpace = canAddUserToRole(db, guildId, targetRole);
                    return new ButtonBuilder()
                        .setCustomId(`gp_rotate_to|${guildId}|${userId}|${fromRole}|${targetRole}`)
                        .setLabel(`→ ${ROLE_LABELS_SHORT[targetRole]}`)
                        .setStyle(hasSpace ? ButtonStyle.Primary : ButtonStyle.Secondary)
                        .setDisabled(!hasSpace);
                });
                const m = await interaction.guild?.members.fetch(userId).catch(() => null);
                const displayName = m?.displayName || userId;
                await interaction.update({
                    content: `Moving **${displayName}** (currently **${ROLE_LABELS_SHORT[fromRole]}**). Select their new role:`,
                    embeds: [],
                    components: [new ActionRowBuilder().addComponents(...targetButtons), buildBackToPanelRow(guildId)],
                });
                return;
            }
        }
        if (interaction.isUserSelectMenu()) {
            const customId = interaction.customId;
            if (customId === 'wg_select_1v1_opponent') {
                await interaction.deferUpdate();
                const challengerId = interaction.user.id;
                const challengedId = interaction.values[0];
                if (!challengedId || challengedId === challengerId) {
                    await interaction.editReply({
                        content: '❌ Invalid opponent selection.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const challengedMember = await interaction.guild?.members.fetch(challengedId).catch(() => null);
                if (!challengedMember || challengedMember.user.bot) {
                    await interaction.editReply({
                        content: '❌ You must select a valid member (not a bot).',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                // Block if either player already has an active wager (auto-close stale tickets whose channel was deleted)
                const challengerActiveWager = getActiveWagerForUser(db, challengerId);
                if (challengerActiveWager) {
                    const staleChannel = challengerActiveWager.channelId
                        ? await interaction.guild?.channels.fetch(challengerActiveWager.channelId).catch(() => null)
                        : null;
                    if (staleChannel) {
                        await interaction.editReply({ content: '❌ You already have an active wager ticket. Close or finish it before creating a new one.', embeds: [], components: [] });
                        return;
                    }
                    closeWager(db, challengerActiveWager.id);
                }
                const challengedActiveWager = getActiveWagerForUser(db, challengedId);
                if (challengedActiveWager) {
                    const staleChannel = challengedActiveWager.channelId
                        ? await interaction.guild?.channels.fetch(challengedActiveWager.channelId).catch(() => null)
                        : null;
                    if (staleChannel) {
                        await interaction.editReply({ content: `❌ <@${challengedId}> already has an active wager ticket.`, embeds: [], components: [] });
                        return;
                    }
                    closeWager(db, challengedActiveWager.id);
                }
                const challengerMember = await interaction.guild?.members.fetch(challengerId).catch(() => null);
                const challengerName = challengerMember?.displayName || interaction.user.username;
                const challengedName = challengedMember.displayName || challengedId;
                const ticketName = `${challengerName} vs ${challengedName}`;
                const ticketChannel = await createWagerTicketChannel(interaction, ticketName, [challengerId, challengedId], db);
                if (!ticketChannel) {
                    await interaction.editReply({
                        content: '❌ Failed to create wager ticket channel. Check bot permissions and category setup.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const wagerEmbed = new EmbedBuilder()
                    .setColor(0x5BADFF)
                    .setTitle('Wager Ticket')
                    .setDescription(' Chat is locked until the wager is accepted.\n\n' +
                    'Use the buttons below to accept, dodge, or close the ticket.');
                const tempRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('wg_accept|temp').setLabel('Accept Wager').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('wg_dodge|temp').setLabel('Dodge').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('wg_close|temp').setLabel('Close Ticket').setStyle(ButtonStyle.Secondary));
                const panelMessage = await ticketChannel.send({
                    content: `<@${challengerId}> vs <@${challengedId}>`,
                    embeds: [wagerEmbed],
                    components: [tempRow],
                    allowedMentions: { users: [challengerId, challengedId] },
                });
                const wagerId = createWager(db, '1V1', ticketChannel.id, challengerId, null, challengedId, null, panelMessage.id);
                const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wg_accept|${wagerId}`).setLabel('Accept Wager').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`wg_dodge|${wagerId}`).setLabel('Dodge').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`wg_finalize_open|${wagerId}`).setLabel('Finalize Wager').setStyle(ButtonStyle.Primary));
                await panelMessage.edit({ components: [actionRow] });
                await interaction.editReply({
                    content: `✅ 1v1 wager ticket created: <#${ticketChannel.id}>`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId === 'wg_select_2v2_partner') {
                const challengerId = interaction.user.id;
                const partnerId = interaction.values[0];
                if (!partnerId || partnerId === challengerId) {
                    await interaction.update({
                        content: '❌ Invalid teammate selection.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const partnerMember = await interaction.guild?.members.fetch(partnerId).catch(() => null);
                if (!partnerMember || partnerMember.user.bot) {
                    await interaction.update({
                        content: '❌ You must select a valid teammate (not a bot).',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const selectOpponents = new UserSelectMenuBuilder()
                    .setCustomId(`wg_select_2v2_opponents|${challengerId}|${partnerId}`)
                    .setPlaceholder('Select the 2 opposing players')
                    .setMinValues(2)
                    .setMaxValues(2);
                const embed = new EmbedBuilder()
                    .setColor(0x5BADFF)
                    .setTitle('Wager 2v2')
                    .setDescription('Step 2/2: Select the two opposing players.');
                await interaction.update({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(selectOpponents)],
                    content: '',
                });
                return;
            }
            if (customId.startsWith('wg_select_2v2_opponents|')) {
                await interaction.deferUpdate();
                const [, challenger1Id, challenger2Id] = parseCustomId(customId);
                const [challenged1Id, challenged2Id] = interaction.values;
                if (!challenger1Id || !challenger2Id || !challenged1Id || !challenged2Id) {
                    await interaction.editReply({
                        content: '❌ Invalid 2v2 selection data.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const uniqueIds = new Set([challenger1Id, challenger2Id, challenged1Id, challenged2Id]);
                if (uniqueIds.size !== 4) {
                    await interaction.editReply({
                        content: '❌ The four players must be different users.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const members = await Promise.all([challenger1Id, challenger2Id, challenged1Id, challenged2Id].map(id => interaction.guild?.members.fetch(id).catch(() => null)));
                if (members.some(member => !member || member.user.bot)) {
                    await interaction.editReply({
                        content: '❌ All selected players must be valid members (not bots).',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                // Block if any player already has an active wager (auto-close stale tickets whose channel was deleted)
                const allPlayerIds = [challenger1Id, challenger2Id, challenged1Id, challenged2Id];
                for (const pid of allPlayerIds) {
                    const activeWager = getActiveWagerForUser(db, pid);
                    if (activeWager) {
                        const staleChannel = activeWager.channelId
                            ? await interaction.guild?.channels.fetch(activeWager.channelId).catch(() => null)
                            : null;
                        if (staleChannel) {
                            await interaction.editReply({ content: `❌ <@${pid}> already has an active wager ticket. It must be closed before a new one can be created.`, embeds: [], components: [] });
                            return;
                        }
                        closeWager(db, activeWager.id);
                    }
                }
                const ticketName = `${members[0]?.displayName || challenger1Id}-${members[1]?.displayName || challenger2Id} vs ${members[2]?.displayName || challenged1Id}-${members[3]?.displayName || challenged2Id}`;
                const ticketChannel = await createWagerTicketChannel(interaction, ticketName, [challenger1Id, challenger2Id, challenged1Id, challenged2Id], db);
                if (!ticketChannel) {
                    await interaction.editReply({
                        content: '❌ Failed to create wager ticket channel. Check bot permissions and category setup.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const wagerEmbed = new EmbedBuilder()
                    .setColor(0x5BADFF)
                    .setTitle('Wager Ticket')
                    .setDescription(' Chat is locked until the wager is accepted by both challenged players.\n\n' +
                    'Use the buttons below to accept, dodge, or close the ticket.');
                const tempRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('wg_accept|temp').setLabel('Accept Wager').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('wg_dodge|temp').setLabel('Dodge').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('wg_close|temp').setLabel('Close Ticket').setStyle(ButtonStyle.Secondary));
                const panelMessage = await ticketChannel.send({
                    content: `<@${challenger1Id}> + <@${challenger2Id}> vs <@${challenged1Id}> + <@${challenged2Id}>`,
                    embeds: [wagerEmbed],
                    components: [tempRow],
                    allowedMentions: { users: [challenger1Id, challenger2Id, challenged1Id, challenged2Id] },
                });
                const wagerId = createWager(db, '2V2', ticketChannel.id, challenger1Id, challenger2Id, challenged1Id, challenged2Id, panelMessage.id);
                const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wg_accept|${wagerId}`).setLabel('Accept Wager').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`wg_dodge|${wagerId}`).setLabel('Dodge').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`wg_finalize_open|${wagerId}`).setLabel('Finalize Wager').setStyle(ButtonStyle.Primary));
                await panelMessage.edit({ components: [actionRow] });
                await interaction.editReply({
                    content: `✅ 2v2 wager ticket created: <#${ticketChannel.id}>`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId.startsWith('gp_add_user_select|')) {
                const [, guildId, roleType] = parseCustomId(customId);
                const targetUserId = interaction.values[0];
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                if (targetUserId === interaction.user.id) {
                    await interaction.update({
                        content: '❌ You cannot invite yourself through this flow.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const confirmRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`gp_confirm_invite|${guildId}|${roleType}|${targetUserId}`)
                    .setLabel('Confirm Invite')
                    .setStyle(ButtonStyle.Success), new ButtonBuilder()
                    .setCustomId(`gp_cancel_action|${guildId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary));
                await interaction.update({
                    content: `Do you want to invite <@${targetUserId}> to **${getRoleLabel(roleType)}**?`,
                    embeds: [],
                    components: [confirmRow, buildBackToPanelRow(guildId)],
                });
                return;
            }
        }
        if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            // Player collection modal
            if (customId.startsWith('wt_collect_players_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, warIdRaw, stepRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const step = Number(stepRaw);
                const raw = interaction.fields.getTextInputValue('players');
                const players = raw.split('\n').map(s => s.trim()).filter(Boolean);
                if (players.length === 0) {
                    await interaction.editReply({ content: '❌ No usernames provided.' });
                    return;
                }
                setCollectionPlayers(db, warId, step, players);
                const collection = getPlayerCollection(db, warId);
                // Disable the Submit Players button for this step
                const submitMsgId = step === 1 ? collection?.step1_msg_id : collection?.step2_msg_id;
                if (submitMsgId && interaction.channel && 'messages' in interaction.channel) {
                    const submitMsg = await interaction.channel.messages.fetch(submitMsgId).catch(() => null);
                    if (submitMsg) await submitMsg.edit({ components: [] }).catch(() => null);
                }
                if (step === 1) {
                    // Ping guild 2 now
                    const guild2 = getGuildById(db, collection?.guild2_id);
                    const guild2Role = interaction.guild?.roles.cache.find(r => r.name === guild2?.name);
                    const guild2Mention = guild2Role ? `<@&${guild2Role.id}>` : `**${guild2?.name || 'Opponent Guild'}**`;
                    const collectBtn2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`wt_collect_players|${warId}|2`)
                            .setLabel('Submit Players')
                            .setStyle(ButtonStyle.Secondary)
                    );
                    await interaction.channel?.send({
                        content: `✅ **${getGuildById(db, collection?.guild1_id)?.name || 'Team 1'}** players noted.\n\n${guild2Mention} Please submit your team's Discord **usernames** (not display names) for the war stats.`,
                        components: [collectBtn2],
                        allowedMentions: guild2Role ? { roles: [guild2Role.id] } : {},
                    });
                    await interaction.editReply({ content: `✅ Players submitted: ${players.map(p => `\`${p}\``).join(', ')}` });
                } else {
                    const guild1 = getGuildById(db, collection?.guild1_id);
                    const guild2 = getGuildById(db, collection?.guild2_id);
                    await interaction.channel?.send({
                        content: `✅ **${guild2?.name || 'Team 2'}** players noted. Both teams are ready — the hoster can now finalize the war.`,
                    });
                    await interaction.editReply({ content: `✅ Players submitted: ${players.map(p => `\`${p}\``).join(', ')}` });
                }
                return;
            }
            // Register team modal
            if (customId === 'registerteam_modal') {
                await interaction.deferReply({ ephemeral: true });
                const tag = interaction.fields.getTextInputValue('rt_tag').trim().toUpperCase();
                const name = interaction.fields.getTextInputValue('rt_name').trim();
                const region = interaction.fields.getTextInputValue('rt_region').trim().toUpperCase();
                const logo = interaction.fields.getTextInputValue('rt_logo').trim();
                try {
                    const { createOrg } = await import('./siteapi.js');
                    await createOrg(tag, name, region, logo || undefined);
                    await interaction.editReply(`✅ Guild **${name}** [${tag}] registered on the site!`);
                }
                catch (e) {
                    await interaction.editReply(`❌ ${e.message}`);
                }
                return;
            }
            // Handle admin win modal
            await handleAdminWinModal(interaction, db);
            if (customId.startsWith('wt_select_opponent_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, actorGuildId] = parseCustomId(customId);
                const opponentGuildName = interaction.fields.getTextInputValue('opponent_guild_name')?.trim();
                if (!actorGuildId || !opponentGuildName) {
                    await interaction.editReply({
                        content: '❌ Invalid input.',
                    });
                    return;
                }
                const actorGuild = getGuildById(db, actorGuildId);
                const opponentGuild = db.prepare('SELECT * FROM Guilds WHERE name = ? AND id != ?').get(opponentGuildName, actorGuildId);
                if (!actorGuild) {
                    await interaction.editReply({
                        content: '❌ Your guild data could not be found.',
                    });
                    return;
                }
                if (!opponentGuild) {
                    await interaction.editReply({
                        content: `❌ Guild "${opponentGuildName}" not found or is your own guild.`,
                    });
                    return;
                }
                const starterRole = getGuildRoleInWar(actorGuild, interaction.user.id);
                const isManager = !!db
                    .prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?')
                    .get(actorGuild.id, interaction.user.id);
                if (!starterRole && !isManager) {
                    await interaction.editReply({
                        content: '❌ You no longer have permission to open this war ticket.',
                    });
                    return;
                }
                const warChannel = await createWarTicketChannel(interaction, db, actorGuild, opponentGuild);
                if (!warChannel) {
                    await interaction.editReply({
                        content: '❌ Failed to create war ticket channel. Check bot permissions and category setup.',
                    });
                    return;
                }
                await interaction.editReply({
                    content: `✅ War ticket created successfully! Check <#${warChannel.id}>`,
                });
                return;
            }
            if (customId.startsWith('wg_finalize_clip_modal|') || customId.startsWith('wg_finalize_elo_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, wagerIdRaw, winnerSide] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                const winnerEloGainRaw = interaction.fields.getTextInputValue('winner_elo_gain')?.trim();
                const loserEloLossRaw = interaction.fields.getTextInputValue('loser_elo_loss')?.trim();
                if (!wager || wager.status !== 'ACCEPTED') {
                    await interaction.editReply({
                        content: '❌ This wager is not available for finalization.',
                    });
                    return;
                }
                if (!['CHALLENGER', 'CHALLENGED'].includes(winnerSide || '')) {
                    await interaction.editReply({
                        content: '❌ Invalid winner selected.',
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.editReply({
                        content: '❌ You do not have permission to finalize this wager. Configure the role with `/setup hoster_role`.',
                    });
                    return;
                }
                const winnerEloGain = parseInt(winnerEloGainRaw || '', 10);
                const loserEloLoss = parseInt(loserEloLossRaw || '', 10);
                if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
                    await interaction.editReply({ content: '❌ Invalid ELO values. Use positive integers.' });
                    return;
                }
                const seasonRaw = interaction.fields.getTextInputValue('season')?.trim() || '';
                const roundDetailsRaw = interaction.fields.getTextInputValue('round_details')?.trim() || '';
                closeWager(db, wager.id);
                const teamA = formatWagerTeam([wager.challenger1Id, wager.challenger2Id]);
                const teamB = formatWagerTeam([wager.challenged1Id, wager.challenged2Id]);
                const winnerTeam = winnerSide === 'CHALLENGER' ? teamA : teamB;
                const winnerIds = winnerSide === 'CHALLENGER'
                    ? [wager.challenger1Id, wager.challenger2Id].filter(Boolean)
                    : [wager.challenged1Id, wager.challenged2Id].filter(Boolean);
                const loserIds = winnerSide === 'CHALLENGER'
                    ? [wager.challenged1Id, wager.challenged2Id].filter(Boolean)
                    : [wager.challenger1Id, wager.challenger2Id].filter(Boolean);
                applyPlayerElo(db, winnerIds, winnerEloGain, loserIds, loserEloLoss, wager.id);
                // Sync wager results to site Player-LB
                (async () => {
                    try {
                        const { upsertWagerResult } = await import('./siteapi.js');
                        const discordGuild = interaction.guild || (interaction.guildId ? client.guilds.cache.get(interaction.guildId) : null);
                        async function getPlayerOrgTag(userId) {
                            // 1. Check bot local DB roster
                            const row = db.prepare('SELECT g.tag FROM Guilds g WHERE g.id = (SELECT guildId FROM MainRosters WHERE userId = ? LIMIT 1) OR g.id = (SELECT guildId FROM SubRosters WHERE userId = ? LIMIT 1) OR g.id = (SELECT guildId FROM Managers WHERE userId = ? LIMIT 1) LIMIT 1').get(userId, userId, userId);
                            if (row?.tag) return row.tag;
                            // 2. Fall back: match Discord roles against guild name roles
                            try {
                                if (discordGuild) {
                                    const member = await discordGuild.members.fetch(userId).catch(() => null);
                                    if (member) {
                                        const allGuilds = db.prepare('SELECT name, tag FROM Guilds').all();
                                        for (const g of allGuilds) {
                                            if (member.roles.cache.some(r => r.name === g.name)) return g.tag;
                                        }
                                    }
                                }
                            } catch { /* ignore */ }
                            return '';
                        }
                        for (const uid of winnerIds) {
                            const user = await client.users.fetch(uid).catch(() => null);
                            await upsertWagerResult(uid, user?.username || uid, await getPlayerOrgTag(uid), winnerEloGain, true)
                                .catch(e => console.warn('Player-LB sync (winner) failed:', e?.message));
                        }
                        for (const uid of loserIds) {
                            const user = await client.users.fetch(uid).catch(() => null);
                            await upsertWagerResult(uid, user?.username || uid, await getPlayerOrgTag(uid), -loserEloLoss, false)
                                .catch(e => console.warn('Player-LB sync (loser) failed:', e?.message));
                        }
                    }
                    catch (e) { console.warn('Player-LB sync failed:', e?.message); }
                })();
                const wagerLogId = getSetting(db, `${interaction.guildId}_wager_log_channel_id`) || WAGER_LOGS_CHANNEL_ID;
                const wagerLogsChannel = await interaction.client.channels.fetch(wagerLogId).catch(() => null);
                if (wagerLogsChannel && wagerLogsChannel.isTextBased() && 'send' in wagerLogsChannel) {
                    await wagerLogsChannel.send({
                        flags: MessageFlags.IsComponentsV2,
                        components: [
                            buildWagerLogsContainer(`WAGER FINALIZED (${wager.type})`, teamA, teamB, `\nWinner: ${winnerTeam}\nELO: +${winnerEloGain} / -${loserEloLoss}\nClosed by: <@${interaction.user.id}>${roundDetailsRaw ? `\n\n### 📋 Round Details\n${roundDetailsRaw}` : ''}`, '## WAGER CLOSED'),
                        ],
                    });
                }
                // Build player stats for site log (challenger team first, then challenged)
                const allParticipants = [
                    ...[wager.challenger1Id, wager.challenger2Id].filter(Boolean).map(id => ({ id, team: 1 })),
                    ...[wager.challenged1Id, wager.challenged2Id].filter(Boolean).map(id => ({ id, team: 2 })),
                ];
                const wagerStats = [];
                for (const { id, team } of allParticipants) {
                    const user = await client.users.fetch(id).catch(() => null);
                    wagerStats.push({ player: user?.username || id, kills: null, deaths: null, notes: '', team });
                }
                // Get agreed wager amount
                const wagerCol = getWagerAmountCollection(db, wager.id);
                const wagerAmount = wagerCol?.amount || '';
                // Build username-based team strings for site log (teamA/teamB use <@ID> for Discord only)
                const siteTeamA = wagerStats.filter(s => s.team === 1).map(s => s.player).join(' + ');
                const siteTeamB = wagerStats.filter(s => s.team === 2).map(s => s.player).join(' + ');
                const siteWinnerTeam = winnerSide === 'CHALLENGER' ? siteTeamA : siteTeamB;
                // Create site wager log (fire-and-forget)
                let siteWagerErr = null;
                try {
                    const { createWagerLog } = await import('./siteapi.js');
                    await createWagerLog(siteTeamA, siteTeamB, wagerAmount, siteWinnerTeam, seasonRaw, wagerStats);
                } catch (e) {
                    siteWagerErr = e?.message || 'Unknown error';
                    console.error('[wager finalize] site log failed:', siteWagerErr);
                }
                await interaction.followUp({
                    content: `✅ Wager finalized! Winner: **${winnerTeam}** | ELO: +${winnerEloGain} / -${loserEloLoss}.`,
                    flags: MessageFlags.Ephemeral,
                });
                // Ping hoster with close button
                const hosterRoleId = interaction.guildId ? getSetting(db, `${interaction.guildId}_hoster_role_id`) : null;
                const hosterMention = hosterRoleId ? `<@&${hosterRoleId}>` : '';
                const closeWagerRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('wg_close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
                );
                const siteNote = siteWagerErr
                    ? `⚠️ Site log error: ${siteWagerErr}`
                    : `✅ Wager log created on site. Please fill out the player stats to complete the log.`;
                await interaction.channel?.send({
                    content: `${hosterMention} ${siteNote}`.trim(),
                    components: [closeWagerRow],
                }).catch(() => null);
                return;
            }
            if (customId.startsWith('wt_quick_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, warIdRaw, winnerGuildId] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const scoreRaw = interaction.fields.getTextInputValue('score')?.trim();
                const parsedScore = parseWarScore(scoreRaw || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.editReply({ content: '❌ This war is not available for finalization.' });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.editReply({ content: '❌ Invalid winner.' });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                if (!canMemberFinalizeTicket(member, db, interaction.guildId)) {
                    await interaction.editReply({ content: '❌ You do not have permission to finalize this war.' });
                    return;
                }
                const winnerEloGain = parseInt(interaction.fields.getTextInputValue('winner_elo_gain')?.trim() || '', 10);
                const loserEloLoss = parseInt(interaction.fields.getTextInputValue('loser_elo_loss')?.trim() || '', 10);
                if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
                    await interaction.editReply({ content: '❌ Invalid ELO values. Use positive integers.' });
                    return;
                }
                const roundDetailsQuick = interaction.fields.getTextInputValue('round_details')?.trim() || null;
                const mvpQuick = await resolveMvpToUsername(client, interaction.fields.getTextInputValue('mvp_user')?.trim() || null);
                const { winnerScore, loserScore } = parsedScore;
                const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
                const winnerGuildData = getGuildById(db, winnerGuildId);
                const loserGuildData = getGuildById(db, loserGuildId);
                const { winnerGuild } = await finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, null, null, mvpQuick, roundDetailsQuick);
                applyGuildElo(db, winnerGuildId, winnerEloGain, loserGuildId, loserEloLoss, war.id);
                await refreshGuildPanel(client, db, winnerGuildId).catch(() => { });
                await refreshGuildPanel(client, db, loserGuildId).catch(() => { });
                // Build stats from collected player lists
                const collection = getPlayerCollection(db, war.id);
                const warStats = [];
                if (collection) {
                    const g1Raw = collection.guild1_players ? JSON.parse(collection.guild1_players) : [];
                    const g2Raw = collection.guild2_players ? JSON.parse(collection.guild2_players) : [];
                    // Winner players first, then loser players
                    const winnerIsGuild1 = winnerGuildId === collection.guild1_id;
                    const winnerPlayers = winnerIsGuild1 ? g1Raw : g2Raw;
                    const loserPlayers = winnerIsGuild1 ? g2Raw : g1Raw;
                    winnerPlayers.forEach(username => warStats.push({ player: username, kills: null, deaths: null, notes: '', team: 1 }));
                    loserPlayers.forEach(username  => warStats.push({ player: username, kills: null, deaths: null, notes: '', team: 2 }));
                }
                console.log(`[wt_quick_modal] war=${war.id} collection=${collection ? 'found' : 'NULL'} warStats=${warStats.length} players:`, JSON.stringify(warStats));
                // Create war log on site
                let siteLogError = null;
                try {
                    const { createWarLog } = await import('./siteapi.js');
                    const siteResult = await createWarLog(
                        winnerGuildData?.tag || winnerGuildId,
                        loserGuildData?.tag || loserGuildId,
                        winnerScore,
                        loserScore,
                        winnerGuildData?.tag || winnerGuildId,
                        winnerGuildData?.region || loserGuildData?.region || 'NA',
                        winnerEloGain,
                        -loserEloLoss,
                        warStats.length > 0 ? warStats : null,
                        '',
                        mvpQuick || '',
                    );
                    console.log(`[createWarLog] site response:`, JSON.stringify(siteResult));
                } catch (e) {
                    siteLogError = e?.message || 'Unknown error';
                    console.error('Failed to create site war log:', siteLogError);
                }
                await interaction.editReply({
                    content: `✅ War finalized! **${winnerGuild?.name || 'Unknown'}** wins **${winnerScore}-${loserScore}** | ELO: +${winnerEloGain} / -${loserEloLoss}.`,
                });
                // Ping hoster role with close button
                const hosterRoleId = interaction.guildId ? getSetting(db, `${interaction.guildId}_hoster_role_id`) : null;
                const hosterMention = hosterRoleId ? `<@&${hosterRoleId}>` : '';
                const winnerName = winnerGuild?.name || winnerGuildData?.name || 'Team A';
                const loserName = loserGuildData?.name || 'Team B';
                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('wt_close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                );
                const statsNote = siteLogError
                    ? `⚠️ **Site log error:** ${siteLogError}`
                    : warStats.length > 0
                        ? `📊 **${warStats.length} player(s)** added to stats.`
                        : `ℹ️ No player names were collected — open the log on site to add stats manually.`;
                await interaction.channel?.send({
                    content: `${hosterMention} War Log for **(${winnerName} VS ${loserName})** created. ${statsNote}`.trim(),
                    components: [closeRow],
                }).catch(() => null);
                return;
            }
            if (customId.startsWith('wt_finalize_details_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.editReply({
                        content: '❌ This war is not available for finalization.',
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.editReply({
                        content: '❌ Invalid winner selected.',
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.editReply({
                        content: '❌ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
                    });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const totalRounds = Math.max(1, winnerScore + loserScore);
                const roundSummary = interaction.fields.getTextInputValue('rounds_summary')?.trim() || null;
                const roundDowns = [];
                if (roundSummary) {
                    if (totalRounds <= 2) {
                        await interaction.editReply({
                            content: '❌ Round summary is only used for wars with more than 2 total rounds.',
                        });
                        return;
                    }
                }
                else {
                    if (totalRounds > 2) {
                        await interaction.editReply({
                            content: '❌ Please provide a round details summary for wars longer than 2 rounds.',
                        });
                        return;
                    }
                    for (let round = 1; round <= totalRounds; round++) {
                        const winnerDownsRaw = interaction.fields.getTextInputValue(`round_${round}_winner_downs`);
                        const loserDownsRaw = interaction.fields.getTextInputValue(`round_${round}_loser_downs`);
                        const winnerDowns = Number(winnerDownsRaw) || 0;
                        const loserDowns = Number(loserDownsRaw) || 0;
                        if (winnerDowns < 0 || loserDowns < 0) {
                            await interaction.editReply({
                                content: `❌ Invalid downs value for round ${round}. Must be non-negative numbers.`,
                            });
                            return;
                        }
                        roundDowns.push({ winnerDowns, loserDowns });
                    }
                }
                const mvpRaw = await resolveMvpToUsername(client, interaction.fields.getTextInputValue('mvp_user')?.trim() || null);
                // Collect all clip links
                const clipLinks = [];
                for (let i = 1; i <= 3; i++) {
                    const clipLink = interaction.fields.getTextInputValue(`clips_link_${i}`)?.trim();
                    if (clipLink) {
                        if (!isValidClipLink(clipLink)) {
                            await interaction.editReply({
                                content: `❌ Invalid clip link ${i}. Please provide a valid URL starting with http:// or https://`,
                            });
                            return;
                        }
                        clipLinks.push(clipLink);
                    }
                }
                // Combine all clip links into a single string for storage
                const clipsCombined = clipLinks.length > 0 ? clipLinks.join('\n') : null;
                const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
                const { winnerGuild } = await finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, clipsCombined, roundDowns, mvpRaw, roundSummary);
                const clipsText = clipLinks.length > 0 ? ` | Clips: ${clipLinks.length} link(s) provided` : '';
                const eloRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`wt_elo_btn|${winnerGuildId}|${loserGuildId}|${war.id}`)
                    .setLabel('Apply ELO')
                    .setStyle(ButtonStyle.Primary));
                await interaction.editReply({
                    content: `✅ War finalized! **${winnerGuild?.name || 'Unknown'}** wins **${winnerScore}-${loserScore}**. Click **Apply ELO** to set points.`,
                    components: [eloRow],
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('War finished and recorded').catch(() => null);
                }
                return;
            }
            if (customId.startsWith('wt_finalize_link_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                const clipsLinkRaw = interaction.fields.getTextInputValue('clips_link')?.trim();
                const winnerEloGainRaw = interaction.fields.getTextInputValue('winner_elo_gain')?.trim();
                const loserEloLossRaw = interaction.fields.getTextInputValue('loser_elo_loss')?.trim();
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.editReply({
                        content: '❌ This war is not available for finalization.',
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.editReply({
                        content: '❌ Invalid winner selected.',
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);
                if (!canFinalize) {
                    await interaction.editReply({
                        content: '❌ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
                    });
                    return;
                }
                if (!clipsLinkRaw || !isValidClipLink(clipsLinkRaw)) {
                    await interaction.editReply({
                        content: '❌ Invalid link. Please provide a valid URL starting with http:// or https://',
                    });
                    return;
                }
                const winnerEloGain = parseInt(winnerEloGainRaw || '', 10);
                const loserEloLoss = parseInt(loserEloLossRaw || '', 10);
                if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
                    await interaction.editReply({ content: '❌ Invalid ELO values. Use positive integers.' });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
                const { winnerGuild } = await finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, clipsLinkRaw);
                applyGuildElo(db, winnerGuildId, winnerEloGain, loserGuildId, loserEloLoss, war.id);
                await refreshGuildPanel(client, db, winnerGuildId).catch(() => { });
                await refreshGuildPanel(client, db, loserGuildId).catch(() => { });
                await interaction.editReply({
                    content: `✅ War finalized! **${winnerGuild?.name || 'Unknown'}** wins **${winnerScore}-${loserScore}** | ELO: +${winnerEloGain} / -${loserEloLoss}. Closing ticket...`,
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('War finished and recorded').catch(() => null);
                }
                return;
            }
            // ELO modal for "Finalize Without Link" path
            if (customId.startsWith('wt_elo_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.editReply({ content: '❌ This war is not available for finalization.' });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.editReply({ content: '❌ Invalid winner.' });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                if (!canMemberFinalizeTicket(member, db, interaction.guildId)) {
                    await interaction.editReply({ content: '❌ You do not have permission to finalize this war.' });
                    return;
                }
                const winnerEloGain = parseInt(interaction.fields.getTextInputValue('winner_elo_gain')?.trim() || '', 10);
                const loserEloLoss = parseInt(interaction.fields.getTextInputValue('loser_elo_loss')?.trim() || '', 10);
                if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
                    await interaction.editReply({ content: '❌ Invalid ELO values. Use positive integers.' });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
                const { winnerGuild } = await finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, null);
                applyGuildElo(db, winnerGuildId, winnerEloGain, loserGuildId, loserEloLoss, war.id);
                await refreshGuildPanel(client, db, winnerGuildId).catch(() => { });
                await refreshGuildPanel(client, db, loserGuildId).catch(() => { });
                await interaction.editReply({
                    content: `✅ War finalized! **${winnerGuild?.name || 'Unknown'}** wins **${winnerScore}-${loserScore}** | ELO: +${winnerEloGain} / -${loserEloLoss}. Closing ticket...`,
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('War finished and recorded').catch(() => null);
                }
                return;
            }
            // Standalone ELO modal after "Finalize With Details" path
            if (customId.startsWith('wt_elo_standalone_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, winnerGuildId, loserGuildId, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                if (!winnerGuildId || !loserGuildId) {
                    await interaction.editReply({ content: '❌ Invalid data.' });
                    return;
                }
                const winnerEloGain = parseInt(interaction.fields.getTextInputValue('winner_elo_gain')?.trim() || '', 10);
                const loserEloLoss = parseInt(interaction.fields.getTextInputValue('loser_elo_loss')?.trim() || '', 10);
                if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
                    await interaction.editReply({ content: '❌ Invalid ELO values. Use positive integers.' });
                    return;
                }
                applyGuildElo(db, winnerGuildId, winnerEloGain, loserGuildId, loserEloLoss, isNaN(warId) ? undefined : warId);
                await refreshGuildPanel(client, db, winnerGuildId).catch(() => { });
                await refreshGuildPanel(client, db, loserGuildId).catch(() => { });
                await interaction.editReply({
                    content: `✅ ELO applied! Winner: +${winnerEloGain} | Loser: -${loserEloLoss}`,
                });
                return;
            }
        }
    }
    catch (error) {
        const discordCode = error?.code;
        if (discordCode === 10062 || discordCode === 'InteractionAlreadyReplied') {
            return;
        }
        // 40060: another bot instance already acknowledged this interaction — nothing to do
        if (discordCode === 40060) {
            console.warn(`[40060] Interaction ${interaction?.id} already acked by another instance — skipping.`);
            return;
        }
        console.error('Error while handling interaction:', error);
        if (error && error.stack)
            console.error(error.stack);
        try {
            const info = {
                id: interaction?.id,
                type: interaction?.type,
                userId: interaction?.user?.id,
                guildId: interaction?.guildId,
                commandName: interaction?.commandName,
                customId: interaction?.customId,
            };
            console.error('Interaction info:', JSON.stringify(info));
        }
        catch (e) {
            console.error('Failed to serialize interaction info:', e);
        }
        if (interaction && typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content: '❌ An unexpected error occurred while processing your request.',
                    });
                }
                else {
                    await interaction.reply({
                        content: '❌ An unexpected error occurred while processing your request.',
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            catch (replyErr) {
                console.error('Failed to send error reply:', replyErr);
            }
        }
    }
}
async function isWagerStaffOrParticipant(message, db, participants) {
    if (participants.includes(message.author.id)) return true;
    const member = await message.guild?.members.fetch(message.author.id).catch(() => null);
    if (!member) return false;
    if (member.permissions.has('Administrator')) return true;
    const hosterRoleId = getSetting(db, `${message.guildId}_hoster_role_id`);
    if (hosterRoleId && member.roles.cache.has(hosterRoleId)) return true;
    const HOSTER_ROLE_IDS_DEFAULT = ['1470554662687215741', '1470554664238845962'];
    return HOSTER_ROLE_IDS_DEFAULT.some(id => member.roles.cache.has(id));
}
export async function handleWagerAmountMessage(message, db) {
    if (!message.channelId || message.author.bot) return;

    // Check ban collection first (higher priority if both awaiting somehow, ban_awaiting wins)
    const banCol = getWagerCollectionByChannelForBan(db, message.channelId);
    if (banCol) {
        const participants = [banCol.challenger1_id, banCol.challenger2_id, banCol.challenged1_id, banCol.challenged2_id].filter(Boolean);
        if (!await isWagerStaffOrParticipant(message, db, participants)) return;
        const rulesLabel = banCol.rules_type === 'default_bans' ? 'Default Rules + Mutual Bans' : 'Mutual Bans';
        const description = banCol.rules_type === 'default_bans'
            ? `**Default Rules:** No Skeying, No Mode Pops, Aura is allowed.\n**Mutual Ban:** ${message.content}`
            : `🔨 **Mutual Ban:** ${message.content}`;
        const embed = new EmbedBuilder()
            .setColor(0x5BADFF)
            .setTitle(`📋 ${rulesLabel}`)
            .setDescription(description)
            .setFooter({ text: "If this isn't the right ban, please click ❌ and answer the question correctly." });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wg_ban_confirm|${banCol.wager_id}`).setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`wg_ban_reject|${banCol.wager_id}`).setEmoji('❌').setStyle(ButtonStyle.Danger),
        );
        const sent = await message.channel.send({ embeds: [embed], components: [row] });
        setWagerBan(db, banCol.wager_id, message.content, sent.id);
        await message.delete().catch(() => {});
        return;
    }

    // Check wager amount collection
    const col = getWagerAmountCollectionByChannel(db, message.channelId);
    if (!col) return;
    const participants = [col.challenger1_id, col.challenger2_id, col.challenged1_id, col.challenged2_id].filter(Boolean);
    if (!await isWagerStaffOrParticipant(message, db, participants)) return;
    const embed = new EmbedBuilder()
        .setColor(0x5BADFF)
        .setDescription(`💰 **Wager:** ${message.content}`)
        .setFooter({ text: "If this isn't the wager, please click ❌ and answer the question correctly." });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wg_amount_confirm|${col.wager_id}`).setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`wg_amount_reject|${col.wager_id}`).setEmoji('❌').setStyle(ButtonStyle.Danger),
    );
    const sent = await message.channel.send({ embeds: [embed], components: [row] });
    setWagerAmount(db, col.wager_id, message.content, sent.id);
    await message.delete().catch(() => {});
}
function sanitizeWagerChannelName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 90);
}
function parseAcceptedUsers(rawValue) {
    try {
        const value = JSON.parse(String(rawValue || '[]'));
        if (!Array.isArray(value))
            return [];
        return value.filter(v => typeof v === 'string');
    }
    catch {
        return [];
    }
}
function buildWagerParticipantIds(wager) {
    return [wager.challenger1Id, wager.challenger2Id, wager.challenged1Id, wager.challenged2Id]
        .filter((value) => !!value);
}
async function createWagerTicketChannel(interaction, channelName, participantIds, db) {
    const discordGuild = interaction.guild;
    if (!discordGuild)
        return null;
    const categoryId = getSetting(db, `${interaction.guildId}_wager_category_id`) || WAGER_TICKETS_CATEGORY_ID;
    const wagerCategory = await interaction.client.channels.fetch(categoryId).catch(() => null);
    if (!wagerCategory || wagerCategory.type !== ChannelType.GuildCategory) {
        console.error(`Wager category ${categoryId} not found or invalid.`);
        return null;
    }
    const permissionOverwrites = [
        {
            id: discordGuild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionFlagsBits.ViewChannel],
        },
    ];
    for (const hosterRoleId of getHosterRoleIds(db, interaction.guildId)) {
        const hosterRole = discordGuild.roles.cache.get(hosterRoleId)
            || (await discordGuild.roles.fetch(hosterRoleId).catch(() => null));
        if (hosterRole) {
            permissionOverwrites.push({
                id: hosterRole.id,
                type: OverwriteType.Role,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages],
            });
        }
    }
    for (const memberId of participantIds) {
        const member = await discordGuild.members.fetch(memberId).catch(() => null);
        if (!member)
            continue;
        permissionOverwrites.push({
            id: member.id,
            type: OverwriteType.Member,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
        });
    }
    const channel = await discordGuild.channels
        .create({
        name: sanitizeWagerChannelName(channelName),
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites,
    })
        .catch((error) => {
        console.error('Failed to create wager ticket channel:', error);
        return null;
    });
    return channel;
}
async function unlockWagerTicketChat(interaction, channel, participantIds, db) {
    for (const userId of participantIds) {
        await channel.permissionOverwrites
            .edit(userId, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: true,
        })
            .catch(() => null);
    }
    for (const hosterRoleId of getHosterRoleIds(db, channel.guildId)) {
        await channel.permissionOverwrites
            .edit(hosterRoleId, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: true,
        })
            .catch(() => null);
    }
    const mentionKey = `${channel.guildId}_wager_mention_roles`;
    const mentionSetting = getSetting(db, mentionKey);
    const mentionRoles = mentionSetting ? mentionSetting.split(',').filter(Boolean) : getHosterRoleIds(db, channel.guildId);
    const mentionStr = mentionRoles.map((r) => `<@&${r}>`).join(' ');
    await channel.send({
        content: `✅ Wager accepted. Chat unlocked. ${mentionStr}`,
        allowedMentions: { roles: mentionRoles },
    }).catch(() => null);
}
//# sourceMappingURL=Interaction.js.map