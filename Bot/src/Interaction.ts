import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ContainerBuilder,
  EmbedBuilder,
  ModalBuilder,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { loadCommands } from './commands.js';
import {
  addMemberToRole,
  addGuildLoss,
  addGuildWin,
  acceptWar,
  canAddUserToRole,
  createWar,
  createInvite,
  dodgeWar,
  finishWar,
  getGuildById,
  getMembersByRole,
  getPendingInviteForTarget,
  getRoleLabel,
  GuildRoleType,
  isUserInRole,
  refreshGuildPanel,
  removeMemberFromRole,
  setInviteStatus,
  validateInviteForAction,
  getWarById,
  createWager,
  getWagerById,
  recordWagerAcceptance,
  markWagerAccepted,
  dodgeWager,
  closeWager,
  getSetting,
  applyGuildElo,
  applyPlayerElo,
} from './database.js';

const ADD_ACTION_MAP: Record<string, GuildRoleType> = {
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

function getGuildForWarStarter(db: any, userId: string): any | null {
  let guild = db
    .prepare('SELECT * FROM Guilds WHERE leaderId = ? OR coLeaderId = ? ORDER BY createdAt ASC LIMIT 1')
    .get(userId, userId);

  if (!guild) {
    guild = db
      .prepare(
        `SELECT g.*
         FROM Guilds g
         INNER JOIN Managers m ON m.guildId = g.id
         WHERE m.userId = ?
         ORDER BY g.createdAt ASC
         LIMIT 1`
      )
      .get(userId);
  }

  return guild || null;
}

function getGuildRoleInWar(guild: any, userId: string): 'LEADER' | 'CO_LEADER' | null {
  if (!guild) return null;
  if (guild.leaderId === userId) return 'LEADER';
  if (guild.coLeaderId === userId) return 'CO_LEADER';
  return null;
}

function getGuildRosterAndStaffIds(db: any, guildId: string): string[] {
  const guild = getGuildById(db, guildId);
  if (!guild) return [];

  const ids = new Set<string>();
  if (guild.leaderId) ids.add(guild.leaderId);
  if (guild.coLeaderId) ids.add(guild.coLeaderId);

  const managers = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId) as Array<{ userId: string }>;
  const mains = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId) as Array<{ userId: string }>;
  const subs = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId) as Array<{ userId: string }>;

  for (const row of managers) if (row?.userId) ids.add(row.userId);
  for (const row of mains) if (row?.userId) ids.add(row.userId);
  for (const row of subs) if (row?.userId) ids.add(row.userId);

  return Array.from(ids);
}

function sanitizeWarChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

async function createWarTicketChannel(interaction: any, db: any, guildA: any, guildB: any): Promise<any | null> {
  const discordGuild = interaction.guild;
  if (!discordGuild) return null;

  const warCategoryId = getSetting(db, `${interaction.guildId}_war_category_id`) || WAR_TICKETS_CATEGORY_ID;
  const warCategory = await interaction.client.channels.fetch(warCategoryId).catch(() => null);
  if (!warCategory || warCategory.type !== ChannelType.GuildCategory) {
    console.error(`War category ${warCategoryId} not found or invalid.`);
    return null;
  }

  const memberIds = new Set<string>([
    ...getGuildRosterAndStaffIds(db, guildA.id),
    ...getGuildRosterAndStaffIds(db, guildB.id),
  ]);

  const permissionOverwrites: any[] = [
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
    if (!member) continue;

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
    .catch((error: unknown) => {
      console.error('Failed to create war ticket channel:', error);
      return null;
    });

  if (!channel) return null;

  const warConfirmationContainer = new ContainerBuilder()
    .setAccentColor(40192)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# <:deepwoken:1470975025988501515> War Confirmation\nWar between: **${guildA.name}** vs **${guildB.name}**`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '\nâ„¹ï¸ Waiting for confirmation from the opponent team (Leader/Co-leader).\n\nUse the buttons below:\nâ€¢ **Accept War** â€” confirm the war\nâ€¢ **Dodge** â€” cancel the war'
      )
    );

  const initialMessage = await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [warConfirmationContainer],
  }).catch((error: unknown) => {
    console.error('Failed to send war ticket message:', error);
    return null;
  });

  if (!initialMessage) {
    await channel.delete('Failed to initialize war ticket message').catch(() => null);
    return null;
  }

  const warId = createWar(db, guildA.id, guildB.id, channel.id, interaction.user.id, initialMessage.id);
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`wt_accept|${warId}`)
      .setLabel('Accept War')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`wt_dodge|${warId}`)
      .setLabel('Dodge')
      .setStyle(ButtonStyle.Danger)
  );

  await initialMessage.edit({
    components: [warConfirmationContainer, actionRow],
  }).catch((error: unknown) => {
    console.error('Failed to add war ticket buttons:', error);
  });

  return channel;
}

function getDiscordRoleIdForRoleType(roleType: GuildRoleType, db?: any, discordGuildId?: string): string | null {
  if (roleType === 'CO_LEADER') {
    return (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_co_leader_role_id`) : null) || FIXED_ROLE_IDS.GUILD_CO_LEADER;
  }
  if (roleType === 'MANAGER') {
    return (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_manager_role_id`) : null) || FIXED_ROLE_IDS.MANAGER_GUILD;
  }
  return null;
}

function getDiscordGuildIdFromInternalGuildId(guildId: string): string {
  const directSnowflake = /^\d{17,20}$/;
  if (directSnowflake.test(guildId)) return guildId;

  const prefixedSnowflake = /^(\d{17,20})-/;
  const match = guildId.match(prefixedSnowflake);
  if (match?.[1]) return match[1];

  return guildId;
}

async function assignDiscordRoleById(client: Client, guildId: string, targetUserId: string, roleId: string): Promise<boolean> {
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

  const added = await member.roles.add(role).catch((error: unknown) => {
    console.warn(`Failed to add role ${roleId} to ${targetUserId}:`, error);
    return null;
  });

  return !!added;
}

function shouldKeepRoleForUser(db: any, userId: string, roleType: GuildRoleType): boolean {
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

async function maybeRemoveDiscordRoleByType(interaction: any, db: any, targetUserId: string, roleType: GuildRoleType): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const roleId = getDiscordRoleIdForRoleType(roleType, db, interaction.guildId ?? undefined);
  if (!roleId) return;
  if (shouldKeepRoleForUser(db, targetUserId, roleType)) return;

  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return;

  const member = await guild.members.fetch(targetUserId).catch(() => null);
  if (!member) return;

  await member.roles.remove(role).catch((error: unknown) => {
    console.warn(`Failed to remove role ${roleId} from ${targetUserId}:`, error);
  });
}

function parseCustomId(customId: string): string[] {
  return customId.split('|');
}

function parseWarScore(value: string): { winnerScore: number; loserScore: number } | null {
  if (value === '2-1') return { winnerScore: 2, loserScore: 1 };
  if (value === '3-0') return { winnerScore: 3, loserScore: 0 };
  return null;
}

function parseRoundDowns(value: string): { winnerDowns: number; loserDowns: number } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/[xX:,/|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  const match = normalized.match(/^(\d+)-(\d+)$/);
  if (!match) return null;

  const winnerDowns = Number(match[1]);
  const loserDowns = Number(match[2]);

  if (!Number.isFinite(winnerDowns) || !Number.isFinite(loserDowns)) return null;
  if (winnerDowns < 0 || loserDowns < 0) return null;

  return { winnerDowns, loserDowns };
}

function formatMvpValue(rawValue: string | null): string {
  const value = (rawValue || '').trim();
  if (!value) return 'not provided';

  const mentionMatch = value.match(/^<@!?(\d{17,20})>$/);
  if (mentionMatch) return `<@${mentionMatch[1]}>`;

  const idMatch = value.match(/^(\d{17,20})$/);
  if (idMatch) return `<@${idMatch[1]}>`;

  return value;
}

function buildWarLogsContainer(
  winnerGuildName: string,
  loserGuildName: string,
  winnerScore: number,
  loserScore: number,
  clipsLink: string | null,
  roundDowns: Array<{ winnerDowns: number; loserDowns: number }> | null = null,
  mvpValue: string | null = null,
  roundSummary: string | null = null
): ContainerBuilder {
  const totalRounds = Math.max(1, winnerScore + loserScore);
  const roundWinners: string[] = [];

  for (let i = 0; i < totalRounds; i += 1) {
    roundWinners.push(i < winnerScore ? winnerGuildName : loserGuildName);
  }

  const roundsText = roundSummary && roundSummary.trim()
    ? `### Round Details\n\n${roundSummary.trim()}`
    : roundWinners
      .map(
        (roundWinner, index) => {
          const round = roundDowns?.[index] || { winnerDowns: 0, loserDowns: 0 };
          return (
            `**Round ${index + 1}**\n\n` +
            `${winnerGuildName}: ${round.winnerDowns} downs\n` +
            `${loserGuildName}: ${round.loserDowns} downs\n\n` +
            `## ${roundWinner} WINS`
          );
        }
      )
      .join('\n\n');

  return new ContainerBuilder()
    .setAccentColor(0x2a8900)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# <:deepwoken:1470975025988501515> War Logs\n\n## ${winnerGuildName} VS ${loserGuildName}\n### Final Score: **${winnerScore} x ${loserScore}**`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`\n${roundsText}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${winnerGuildName} WINS\n\n` +
        `-# CLIPE: ${clipsLink ? clipsLink.split('\n').map((link, index) => `[Link ${index + 1}](${link})`).join('\n-# CLIPE: ') : 'not provided'}\n` +
        `-# MVP: ${formatMvpValue(mvpValue)}`
      )
    );
}

function buildWagerLogsContainer(
  title: string,
  teamA: string,
  teamB: string,
  details: string,
  footer: string
): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0x2a8900)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# <:deepwoken:1470975025988501515> Wager Logs\n\n## ${teamA} VS ${teamB}\n${title}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(details)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footer)
    );
}

function formatWagerTeam(teamIds: Array<string | null>): string {
  return teamIds
    .filter((v: string | null): v is string => !!v)
    .map((id: string) => `<@${id}>`)
    .join(' + ');
}

function isValidClipLink(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function getHosterRoleIds(db?: any, guildId?: string | null): string[] {
  if (db && guildId) {
    const configured = getSetting(db, `${guildId}_hoster_role_id`);
    if (configured) return [configured];
  }
  return [WAR_ROLE_IDS.HOSTER, WAR_ROLE_IDS.JUNIOR_HOSTER, WAR_ROLE_IDS.EVENT_HOSTER];
}

function canMemberFinalizeTicket(member: any, db?: any, guildId?: string | null): boolean {
  if (!member) return false;
  const hosterIds = getHosterRoleIds(db, guildId);
  return hosterIds.some(id => member.roles.cache.has(id));
}

async function finalizeWarAndLog(
  interaction: any,
  client: Client,
  db: any,
  war: any,
  winnerGuildId: string,
  winnerScore: number,
  loserScore: number,
  clipsLink: string | null,
  roundDowns: Array<{ winnerDowns: number; loserDowns: number }> | null = null,
  mvpValue: string | null = null,
  roundSummary: string | null = null
): Promise<{ winnerGuild: any; loserGuild: any }> {
  const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;

  addGuildWin(db, winnerGuildId);
  addGuildLoss(db, loserGuildId);
  finishWar(db, war.id, winnerGuildId, winnerScore, loserScore, clipsLink);

  await refreshGuildPanel(client, db, winnerGuildId).catch(() => {});
  await refreshGuildPanel(client, db, loserGuildId).catch(() => {});

  const winnerGuild = getGuildById(db, winnerGuildId);
  const loserGuild = getGuildById(db, loserGuildId);

  const warLogId = getSetting(db, `${interaction.guildId}_war_log_channel_id`) || WAR_LOGS_CHANNEL_ID;
  const warLogsChannel = await interaction.client.channels.fetch(warLogId).catch(() => null);
  if (warLogsChannel && warLogsChannel.isTextBased() && 'send' in warLogsChannel) {
    const resultContainer = buildWarLogsContainer(
      winnerGuild?.name || 'Guild A',
      loserGuild?.name || 'Guild B',
      winnerScore,
      loserScore,
      clipsLink,
      roundDowns,
      mvpValue,
      roundSummary
    );

    await warLogsChannel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [resultContainer],
    });
  }

  return { winnerGuild, loserGuild };
}

type GuildActorRole = 'LEADER' | 'CO_LEADER' | 'MANAGER';

function getGuildActorRole(db: any, guildId: string, userId: string): GuildActorRole | null {
  const guild = getGuildById(db, guildId);
  if (!guild) return null;

  if (guild.leaderId === userId) return 'LEADER';
  if (guild.coLeaderId === userId) return 'CO_LEADER';

  const isManager = !!db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guildId, userId);
  if (isManager) return 'MANAGER';

  return null;
}

function getGuildActorRoleFromDiscordRoles(member: any, db?: any, discordGuildId?: string): GuildActorRole | null {
  if (!member) return null;

  const leaderRoleId = (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_leader_role_id`) : null) || FIXED_ROLE_IDS.GUILD_LEADER;
  const coLeaderRoleId = (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_co_leader_role_id`) : null) || FIXED_ROLE_IDS.GUILD_CO_LEADER;
  const managerRoleId = (db && discordGuildId ? getSetting(db, `${discordGuildId}_guild_manager_role_id`) : null) || FIXED_ROLE_IDS.MANAGER_GUILD;

  if (member.roles.cache.has(WAR_ROLE_IDS.GUILD_LEADER) || member.roles.cache.has(leaderRoleId)) return 'LEADER';
  if (member.roles.cache.has(WAR_ROLE_IDS.GUILD_CO_LEADER) || member.roles.cache.has(coLeaderRoleId)) return 'CO_LEADER';
  if (member.roles.cache.has(WAR_ROLE_IDS.MANAGER_GUILD) || member.roles.cache.has(managerRoleId)) return 'MANAGER';

  return null;
}

async function getGuildActorRoleWithPanelAdmin(
  interaction: any,
  db: any,
  guildId: string,
  userId: string
): Promise<GuildActorRole | null> {
  const actorRole = getGuildActorRole(db, guildId, userId);
  if (actorRole) return actorRole;

  const member = await interaction.guild?.members.fetch(userId).catch(() => null);
  const outerRole = getGuildActorRoleFromDiscordRoles(member, db, interaction.guildId ?? undefined);
  if (outerRole) return outerRole;

  const panelAdminRoleId = getSetting(db, `${interaction.guildId}_staff_role_id`);
  const isPanelAdmin = !!member && (
    panelAdminRoleId
      ? member.roles.cache.has(panelAdminRoleId)
      : PANEL_ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId))
  );
  if (isPanelAdmin) return 'LEADER';

  return null;
}

function canManageRoleType(actorRole: GuildActorRole, targetRoleType: GuildRoleType): boolean {
  if (actorRole === 'LEADER') return true;
  if (actorRole === 'CO_LEADER') return true;
  if (actorRole === 'MANAGER') {
    return targetRoleType === 'MANAGER' || targetRoleType === 'MAIN' || targetRoleType === 'SUB';
  }
  return false;
}

function getManageableRoleTypes(actorRole: GuildActorRole): GuildRoleType[] {
  if (actorRole === 'MANAGER') return ['MANAGER', 'MAIN', 'SUB'];
  return ['CO_LEADER', 'MANAGER', 'MAIN', 'SUB'];
}

function getRegisteredGuildMemberIds(db: any, guildId: string): string[] {
  const guild = getGuildById(db, guildId);
  if (!guild) return [];

  const ids = new Set<string>();
  if (guild.leaderId) ids.add(guild.leaderId);
  if (guild.coLeaderId) ids.add(guild.coLeaderId);

  const managers = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId) as Array<{ userId: string }>;
  const mains = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId) as Array<{ userId: string }>;
  const subs = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId) as Array<{ userId: string }>;

  for (const row of managers) if (row?.userId) ids.add(row.userId);
  for (const row of mains) if (row?.userId) ids.add(row.userId);
  for (const row of subs) if (row?.userId) ids.add(row.userId);

  return Array.from(ids);
}

function shouldKeepGuildLeaderRole(db: any, userId: string): boolean {
  const row = db.prepare('SELECT COUNT(*) as count FROM Guilds WHERE leaderId = ?').get(userId);
  return (row?.count || 0) > 0;
}

async function maybeRemoveGuildLeaderDiscordRole(interaction: any, db: any, targetUserId: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (shouldKeepGuildLeaderRole(db, targetUserId)) return;

  const roleId = getSetting(db, `${interaction.guildId}_guild_leader_role_id`) || FIXED_ROLE_IDS.GUILD_LEADER;
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return;

  const member = await guild.members.fetch(targetUserId).catch(() => null);
  if (!member) return;

  await member.roles.remove(role).catch((error: unknown) => {
    console.warn(`Failed to remove role ${roleId} from ${targetUserId}:`, error);
  });
}

async function canUseOwnershipTransfer(interaction: any, db: any, guildId: string, userId: string): Promise<boolean> {
  const guild = getGuildById(db, guildId);
  if (!guild) return false;
  if (guild.leaderId === userId) return true;

  const member = await interaction.guild?.members.fetch(userId).catch(() => null);
  const panelAdminRoleId2 = getSetting(db, `${interaction.guildId}_staff_role_id`);
  return !!member && (
    panelAdminRoleId2
      ? member.roles.cache.has(panelAdminRoleId2)
      : PANEL_ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId))
  );
}

async function replyPermissionError(interaction: any, message = 'âŒ You do not have permission to use this panel action.'): Promise<void> {
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

function buildInviteDecisionRow(inviteId: number, roleType: GuildRoleType): ActionRowBuilder<ButtonBuilder> {
  const isRosterInvite = roleType === 'MAIN' || roleType === 'SUB';
  const acceptLabel = isRosterInvite ? 'Join Guild' : 'Accept';
  const declineLabel = isRosterInvite ? "Don't Join" : 'Decline';

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gp_invite_accept|${inviteId}`)
      .setLabel(acceptLabel)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`gp_invite_decline|${inviteId}`)
      .setLabel(declineLabel)
      .setStyle(ButtonStyle.Danger)
  );
}

function getRoleInviteTitle(roleType: GuildRoleType): string {
  if (roleType === 'CO_LEADER') return ':star: Co-Leader Invitation';
  if (roleType === 'MANAGER') return ':open_file_folder: Manager Invitation';
  return ':busts_in_silhouette: Guild Roster Invitation';
}

function buildInviteEmbed(
  roleType: GuildRoleType,
  guildName: string,
  inviterNick: string
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor('#2a8900').setTitle(getRoleInviteTitle(roleType));

  if (roleType === 'CO_LEADER') {
    return embed.setDescription(
      `You have been invited to become Co-Leader of the guild **"${guildName}"**.\n\n` +
        `As a co-leader, you will have access to manage rosters and help lead the guild.\n\n` +
        `**Guild:** ${guildName}\n` +
        `**Invited by:** ${inviterNick}\n\n` +
        `**Would you like to accept this invitation?**\n\n` +
        `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`
    );
  }

  if (roleType === 'MANAGER') {
    return embed.setDescription(
      `You have been invited to be a Manager of the guild **"${guildName}"**.\n\n` +
        `As a manager, you will be able to access and manage the guild panel.\n\n` +
        `**Guild:** ${guildName}\n` +
        `**Invited by:** ${inviterNick}\n\n` +
        `**Would you like to accept this invitation?**\n\n` +
        `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`
    );
  }

  const rosterLabel = roleType === 'MAIN' ? 'Main Roster' : 'Sub Roster';
  return embed.setDescription(
    `You have been invited to join the ${rosterLabel} of the guild **"${guildName}"**.\n\n` +
      `**Guild:** ${guildName}\n` +
      `**Roster:** ${rosterLabel}\n` +
      `**Invited by:** ${inviterNick}\n\n` +
      `**Would you like to accept this invitation?**\n\n` +
      `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`
  );
}

function buildRemovalEmbed(roleType: GuildRoleType, guildName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor('#2a8900')
    .setTitle('âŒ Role removed')
    .setDescription(`You are no longer part of **${getRoleLabel(roleType)}** in guild **${guildName}**.`);
}

function buildBackToPanelRow(guildId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gp_back_panel|${guildId}`)
      .setLabel('Back to Panel')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildGuildPanelButtons(guildId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gp_open_add|${guildId}|CO_LEADER`)
      .setLabel('Add Co-Leader')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`gp_open_add|${guildId}|MANAGER`)
      .setLabel('Add Manager Guild')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`gp_open_add|${guildId}|MAIN`)
      .setLabel('Add Main Roster')
      .setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gp_open_add|${guildId}|SUB`)
      .setLabel('Add Sub Roster')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`gp_open_remove|${guildId}`)
      .setLabel('Remove Member')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`gp_open_transfer|${guildId}`)
      .setLabel('Ownership Transfer')
      .setStyle(ButtonStyle.Secondary)
  );

  const rowLeave = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gp_leave_guild|${guildId}`)
      .setLabel('Leave Guild')
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2, rowLeave];
}

function buildGuildPanelEmbedForInteraction(db: any, guildId: string): EmbedBuilder | null {
  const guild = getGuildById(db, guildId);
  if (!guild) return null;

  const coLeader = guild.coLeaderId;
  const managersCount = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(guild.id)?.count || 0;
  const mainsCount = db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(guild.id)?.count || 0;
  const subsCount = db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(guild.id)?.count || 0;

  return new EmbedBuilder()
    .setTitle(`ðŸ° ${guild.name}`)
    .setColor('#2a8900')
    .addFields(
      { name: 'Leader', value: `<@${guild.leaderId}>`, inline: true },
      { name: 'Co-Leader', value: coLeader ? `<@${coLeader}>` : 'None', inline: true },
      { name: 'Region', value: guild.region, inline: true },
      { name: 'Managers', value: `${managersCount}/2`, inline: true },
      { name: 'Main Roster', value: `${mainsCount}/5`, inline: true },
      { name: 'Sub Roster', value: `${subsCount}/5`, inline: true }
    )
    .setThumbnail(guild.imageUrl || null);
}

async function handleAdminWinModal(interaction: any, db: any) {
  const customId = interaction.customId;

  // Legacy handler for old admin_win_modal
  if (customId.startsWith('admin_win_modal|')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [, guildId] = parseCustomId(customId);
    if (!guildId) {
      await interaction.editReply({
        content: 'âŒ Invalid guild ID.',
      });
      return;
    }

    const winsValue = interaction.fields.getTextInputValue('wins')?.trim();
    const lossesValue = interaction.fields.getTextInputValue('losses')?.trim();
    const reason = interaction.fields.getTextInputValue('reason')?.trim();

    if (!reason) {
      await interaction.editReply({
        content: 'âŒ Reason is required.',
      });
      return;
    }

    const guild = getGuildById(db, guildId);
    if (!guild) {
      await interaction.editReply({
        content: 'âŒ Guild not found.',
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
          content: 'âŒ Wins must be a non-negative number.',
        });
        return;
      }
      newWins = parsedWins;
    }

    if (lossesValue) {
      const parsedLosses = parseInt(lossesValue, 10);
      if (isNaN(parsedLosses) || parsedLosses < 0) {
        await interaction.editReply({
          content: 'âŒ Losses must be a non-negative number.',
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
      await logChannel.send(`ðŸ“Š Admin W/L Change: Guild "${guild.name}" W/L changed from ${currentWins}/${currentLosses} to ${newWins}/${newLosses} by <@${interaction.user.id}>. Reason: ${reason}`);
    }

    // Refresh guild panel
    await refreshGuildPanel(interaction.client, db, guildId);

    await interaction.editReply({
      content: `âœ… Updated ${guild.name}: W/L changed from ${currentWins}/${currentLosses} to ${newWins}/${newLosses}.`,
    });
    return;
  }
}

export async function handleInteractions(
  interaction: any,
  client: Client,
  db: any,
  commands: Map<string, any>
): Promise<void> {
  try {
    // Defer reply only for chat input commands
    if (interaction.isChatInputCommand()) {
      if (typeof interaction.deferReply === 'function' && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.deferReply({ flags: 64 });
        } catch (e: any) {
          if (e?.code !== 40060) throw e;
          // 40060: already acknowledged â€” mark as deferred so editReply works
          Object.defineProperty(interaction, 'deferred', { value: true, writable: true });
        }
      }
    }
    // For components (buttons/select menus), let the handler manage it

    if (interaction.isChatInputCommand()) {
      if (!commands) {
        console.error('[handleInteractions] commands Map is undefined â€” bot still loading');
        await interaction.editReply({ content: 'âš ï¸ O bot ainda estÃ¡ inicializando. Tente novamente em instantes.' });
        return;
      }

      console.log(`[CMD] /${interaction.commandName} | map:${commands.size} | found:${commands.has(interaction.commandName)}`);
      const command = commands.get(interaction.commandName);

      if (!command) {
        console.error(`Command not found: ${interaction.commandName}`);
        console.error('Available commands:', Array.from(commands.keys()).sort().join(', '));

        // Safe auto-reload: only clear+update the map if the reload actually has the command.
        // Clearing before confirming was causing the map to be wiped on failed reloads.
        try {
          const newCommands = await loadCommands();
          const retry = newCommands.get(interaction.commandName);
          if (retry) {
            commands.clear();
            for (const [k, v] of newCommands.entries()) commands.set(k, v);
            await retry.execute(interaction, db);
            return;
          } else {
            console.error(`Reload also could not find: ${interaction.commandName}`);
            console.error('Reloaded set:', Array.from(newCommands.keys()).sort().join(', '));
          }
        } catch (reloadErr: any) {
          console.error(`[auto-reload] /${interaction.commandName} threw:`, reloadErr?.message ?? reloadErr);
        }

        await interaction.editReply({
          content: 'Command not found.',
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
        const hasWarPermissionFromRole =
          !!member &&
          (
            member.roles.cache.has(WAR_ROLE_IDS.GUILD_LEADER) ||
            member.roles.cache.has(WAR_ROLE_IDS.GUILD_CO_LEADER) ||
            member.roles.cache.has(WAR_ROLE_IDS.MANAGER_GUILD)
          );

        const canOpenWar = hasWarPermissionFromRole || !!actorGuild;
        if (!canOpenWar) {
          await interaction.reply({
            content: 'âŒ Only Guild Leader, Guild Co-Leader, or Manager Guild can open a War Ticket.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!actorGuild) {
          await interaction.reply({
            content: 'âŒ You are not registered as Leader, Co-Leader, or Manager in any guild.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const guilds = db.prepare('SELECT * FROM Guilds WHERE id != ? ORDER BY name ASC').all(actorGuild.id);
        if (!guilds || guilds.length === 0) {
          await interaction.reply({
            content: 'âŒ No opponent guilds are available right now.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
        const currentPage = 1;
        const menuGuilds = guilds.slice((currentPage - 1) * 25, currentPage * 25);

        const options = menuGuilds.map((guild: any) =>
          new StringSelectMenuOptionBuilder()
            .setLabel((guild.name || 'Unknown').slice(0, 100))
            .setDescription(`Region: ${guild.region || 'Unknown'}`)
            .setValue(guild.id)
        );

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`wt_select_opponent|${actorGuild.id}`)
                    .setPlaceholder('Select an opponent guild')
          .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        const components: Array<ActionRowBuilder<any>> = [row];

        if (totalPages > 1) {
          const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`wt_select_opponent_page|${actorGuild.id}|${currentPage - 1}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage <= 1),
            new ButtonBuilder()
              .setCustomId(`wt_select_opponent_page|${actorGuild.id}|${currentPage + 1}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(currentPage >= totalPages)
          );
          components.push(pageRow);
        }

        const embed = new EmbedBuilder()
          .setColor('#2a8900')
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
            content: 'âŒ Invalid page.',
            embeds: [],
            components: [],
          });
          return;
        }

        const guilds = db.prepare('SELECT * FROM Guilds WHERE id != ? ORDER BY name ASC').all(actorGuildId);
        if (!guilds || guilds.length === 0) {
          await interaction.update({
            content: 'âŒ No opponent guilds are available right now.',
            embeds: [],
            components: [],
          });
          return;
        }

        const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
        if (page > totalPages) {
          await interaction.update({
            content: 'âŒ Invalid page.',
            embeds: [],
            components: [],
          });
          return;
        }

        const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
        const options = menuGuilds.map((guild: any) =>
          new StringSelectMenuOptionBuilder()
            .setLabel((guild.name || 'Unknown').slice(0, 100))
            .setDescription(`Region: ${guild.region || 'Unknown'}`)
            .setValue(guild.id)
        );

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`wt_select_opponent|${actorGuildId}`)
                    .setPlaceholder('Select an opponent guild')
          .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        const components: Array<ActionRowBuilder<any>> = [row];

        if (totalPages > 1) {
          const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`wt_select_opponent_page|${actorGuildId}|${page - 1}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page <= 1),
            new ButtonBuilder()
              .setCustomId(`wt_select_opponent_page|${actorGuildId}|${page + 1}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page >= totalPages)
          );
          components.push(pageRow);
        }

        const embed = new EmbedBuilder()
          .setColor('#2a8900')
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
            content: 'âŒ Invalid page.',
            embeds: [],
            components: [],
          });
          return;
        }

        const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
        const options = menuGuilds.map((guild: any) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(guild.name)
            .setDescription(`Region: ${guild.region} | Leader: ${guild.leaderId}`)
            .setValue(guild.id)
            .setEmoji('ðŸ°')
        );

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('guild_select')
          .setPlaceholder('Select a guild to open panel')
          .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        const components: Array<ActionRowBuilder<any>> = [row];

        if (totalPages > 1) {
          const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`guild_list_page|${page - 1}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page <= 1),
            new ButtonBuilder()
              .setCustomId(`guild_list_page|${page + 1}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page >= totalPages)
          );
          components.push(pageRow);
        }

        const pageEmbed = new EmbedBuilder()
          .setTitle('ðŸ° Registered Guilds')
          .setDescription(`ðŸ“Š Total guilds: **${guilds.length}**\n\nSelect a guild from the menu below to open its management panel.\nPage ${page}/${totalPages}.`)
          .setColor('#2a8900');

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
            content: 'âŒ Invalid page.',
            embeds: [],
            components: [],
          });
          return;
        }

        const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
        const options = menuGuilds.map((guild: any) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(guild.name)
            .setDescription(`Leader: ${guild.leaderId} | Region: ${guild.region}`)
            .setValue(guild.id)
            .setEmoji('ðŸ°')
        );

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('guild_delete_select')
          .setPlaceholder('Select a guild to delete')
          .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        const components: Array<ActionRowBuilder<any>> = [row];

        if (totalPages > 1) {
          const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`guild_delete_page|${page - 1}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page <= 1),
            new ButtonBuilder()
              .setCustomId(`guild_delete_page|${page + 1}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page >= totalPages)
          );
          components.push(pageRow);
        }

        await interaction.update({
          content: 'ðŸ—‘ï¸ **Select a guild to delete:**',
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
            content: 'âŒ Invalid page.',
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
            content: 'âŒ Invalid page.',
            embeds: [],
            components: [],
          });
          return;
        }

        const pageCandidates = allCandidates.slice((page - 1) * 25, page * 25);
        const candidateOptions = await Promise.all(
          pageCandidates.map(async (userId) => {
            const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
            return new StringSelectMenuOptionBuilder()
              .setLabel((guildMember?.displayName || userId).slice(0, 100))
              .setDescription(`ID: ${userId}`)
              .setValue(userId);
          })
        );

        const transferSelect = new StringSelectMenuBuilder()
          .setCustomId(`gp_transfer_target_select|${guildId}`)
          .setPlaceholder('Select the new guild leader')
          .addOptions(candidateOptions);

        const components: Array<ActionRowBuilder<any>> = [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(transferSelect),
        ];

        if (totalPages > 1) {
          const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`gp_transfer_target_page|${guildId}|${page - 1}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page <= 1),
            new ButtonBuilder()
              .setCustomId(`gp_transfer_target_page|${guildId}|${page + 1}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page >= totalPages)
          );
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
            content: 'âŒ Invalid page.',
            embeds: [],
            components: [],
          });
          return;
        }

        const members = getMembersByRole(db, guildId, roleType as GuildRoleType);
        if (!members.length) {
          await interaction.update({
            content: ` No members found for **${getRoleLabel(roleType as GuildRoleType)}**.`,
            components: [],
            embeds: [],
          });
          return;
        }

        const totalPages = Math.max(1, Math.ceil(members.length / 25));
        if (page < 1 || page > totalPages) {
          await interaction.update({
            content: 'âŒ Invalid page.',
            embeds: [],
            components: [],
          });
          return;
        }

        const pageMembers = members.slice((page - 1) * 25, page * 25);
        const memberOptions = await Promise.all(
          pageMembers.map(async (userId: string) => {
            const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
            return new StringSelectMenuOptionBuilder()
              .setLabel((guildMember?.displayName || userId).slice(0, 100))
              .setDescription(`ID: ${userId}`)
              .setValue(userId);
          })
        );

        const memberSelect = new StringSelectMenuBuilder()
          .setCustomId(`gp_remove_member_select|${guildId}|${roleType}`)
          .setPlaceholder(`Select who to remove from ${getRoleLabel(roleType as GuildRoleType)}`)
          .addOptions(memberOptions);

        const components: Array<ActionRowBuilder<any>> = [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(memberSelect),
        ];

        if (totalPages > 1) {
          const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${page - 1}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page <= 1),
            new ButtonBuilder()
              .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${page + 1}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page >= totalPages)
          );
          components.push(pageRow);
        }

        components.push(buildBackToPanelRow(guildId));

        await interaction.update({
          content: `Select the member to remove from **${getRoleLabel(roleType as GuildRoleType)}**. Page ${page}/${totalPages}.`,
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
            content: 'âŒ This war is no longer pending.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const opponentGuild = getGuildById(db, war.opponentGuildId);
        const openerGuild = getGuildById(db, war.openerGuildId);
        const actorRole = getGuildRoleInWar(opponentGuild, interaction.user.id);

        if (!actorRole) {
          await interaction.followUp({
            content: 'âŒ Only the Leader or Co-Leader of the opponent guild can accept this war.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        acceptWar(db, war.id, interaction.user.id, war.opponentGuildId);

        const acceptedContainer = new ContainerBuilder()
          .setAccentColor(0x2a8900)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# <:deepwoken:1470975025988501515> War Confirmation\nWar between: ${openerGuild?.name || 'Unknown'} vs ${opponentGuild?.name || 'Unknown'}`
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `âœ… War accepted by <@${interaction.user.id}>.\n\nHoster team can proceed with the match details.`
            )
          );

        await interaction.editReply({
          components: [acceptedContainer],
        });

        {
          const warMentionSetting = getSetting(db, `${interaction.guildId}_war_mention_roles`);
          const warMentionRoles: string[] = warMentionSetting
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

        const finalizeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`wt_open_finalize|${war.id}`)
            .setLabel('Finalize War')
            .setStyle(ButtonStyle.Primary)
        );

        const finalizeContainer = new ContainerBuilder()
          .setAccentColor(0x2a8900)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# <:deepwoken:1470975025988501515> Finalize War')
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'â„¹ï¸ The Hoster team can finalize the war.\n\nUse the button below to start finalization and choose the winning guild.'
            )
          )
          .addActionRowComponents(finalizeRow);

        await interaction.channel?.send({
          flags: MessageFlags.IsComponentsV2,
          components: [finalizeContainer],
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
            content: 'âŒ This war can no longer be dodged.',
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
            content: 'âŒ Only guild leaders, co-leaders, Hoster, Junior Hoster, or Event Hoster can use Dodge.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        dodgeWar(db, war.id);

        const dodgeSummary = `âš ï¸ <@${interaction.user.id}> used Dodge and closed the war ticket (${openerGuild?.name || 'Unknown'} vs ${opponentGuild?.name || 'Unknown'}).`;

        const warDodgeId = getSetting(db, `${interaction.guildId}_war_dodge_channel_id`) || WAR_DODGE_LOGS_CHANNEL_ID;
        const warDodgeLogsChannel = await interaction.client.channels.fetch(warDodgeId).catch(() => null);
        if (warDodgeLogsChannel && warDodgeLogsChannel.isTextBased() && 'send' in warDodgeLogsChannel) {
          await warDodgeLogsChannel.send({
            content: dodgeSummary,
          });
        }

        await interaction.editReply({
          content: `${dodgeSummary}\n\nâ³ Canal serÃ¡ deletado em 5 segundos...`,
          embeds: [],
          components: [],
          allowedMentions: { users: [interaction.user.id] },
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

        const channelToDelete = interaction.channel
          ?? (war.channelId ? (interaction.guild?.channels.cache.get(war.channelId) ?? await interaction.guild?.channels.fetch(war.channelId).catch(() => null)) : null);

        if (channelToDelete && 'delete' in channelToDelete) {
          await (channelToDelete as any).delete('War ticket closed after dodge').catch((err: any) => {
            console.error('Failed to delete war ticket channel after dodge:', err);
          });
        } else {
          console.warn('Could not find channel to delete after war dodge:', war.channelId);
        }

        return;
      }

      if (customId.startsWith('wt_elo_btn|')) {
        const [, winnerGuildId, loserGuildId, warIdRaw] = parseCustomId(customId);
        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        if (!canMemberFinalizeTicket(member, db, interaction.guildId)) {
          await interaction.reply({ content: 'âŒ Sem permissÃ£o para aplicar ELO.', flags: MessageFlags.Ephemeral });
          return;
        }
        const eloModal = new ModalBuilder()
          .setCustomId(`wt_elo_standalone_modal|${winnerGuildId}|${loserGuildId}|${warIdRaw || ''}`)
          .setTitle('Aplicar Pontos de ELO')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('winner_elo_gain')
                .setLabel('Pontos ganhos pelo ganhador')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ex: 20')
                .setRequired(true)
                .setMaxLength(6)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('loser_elo_loss')
                .setLabel('Pontos removidos do perdedor')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ex: 25')
                .setRequired(true)
                .setMaxLength(6)
            )
          );
        await interaction.showModal(eloModal);
        return;
      }

      if (customId.startsWith('wt_open_finalize|')) {
        const [, warIdRaw] = parseCustomId(customId);
        const warId = Number(warIdRaw);
        const war = getWarById(db, warId);

        if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
          await interaction.reply({
            content: 'âŒ This war is not available for finalization.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.reply({
            content: 'âŒ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
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
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(winnerSelect)],
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
          .setColor('#2a8900')
          .setTitle('Wager 1v1')
          .setDescription('Select the opponent for this 1v1 wager.');

        await interaction.editReply({
          embeds: [embed],
          components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(selectOpponent)],
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
          .setColor('#2a8900')
          .setTitle('Wager 2v2')
          .setDescription('Step 1/2: Select your teammate.');

        await interaction.editReply({
          embeds: [embed],
          components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(selectPartner)],
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
            content: 'âŒ This wager is no longer pending.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const requiredAcceptors = wager.type === '1V1'
          ? [wager.challenged1Id]
          : [wager.challenged1Id, wager.challenged2Id].filter((v: unknown): v is string => !!v);

        if (!requiredAcceptors.includes(interaction.user.id)) {
          await interaction.followUp({
            content: wager.type === '1V1'
              ? 'âŒ Only the challenged player can accept this wager.'
              : 'âŒ Only the challenged duo can accept this wager.',
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
        const acceptedCount = requiredAcceptors.filter((id: string) => acceptedUsers.includes(id)).length;

        if (acceptedCount < requiredAcceptors.length) {
          await interaction.editReply({
            content: `â³ Wager pending acceptance: **${acceptedCount}/${requiredAcceptors.length}** challenged players accepted.`,
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

        const acceptDisabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`wg_accept|${wager.id}`)
            .setLabel('Accept Wager')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`wg_finalize_open|${wager.id}`)
            .setLabel('Finalize Wager')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`wg_dodge|${wager.id}`)
            .setLabel('Dodge')
            .setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({
          content: 'âœ… Wager accepted. Chat unlocked.',
          embeds: [],
          components: [acceptDisabledRow],
        });
        return;
      }

      if (customId.startsWith('wg_finalize_open|')) {
        const [, wagerIdRaw] = parseCustomId(customId);
        const wagerId = Number(wagerIdRaw);
        const wager = getWagerById(db, wagerId);

        if (!wager || wager.status !== 'ACCEPTED') {
          await interaction.reply({
            content: 'âŒ This wager is not available for finalization.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.reply({
            content: 'âŒ You do not have permission to finalize this wager. Configure the role with `/setup hoster_role`.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const teamA = formatWagerTeam([wager.challenger1Id, wager.challenger2Id]);
        const teamB = formatWagerTeam([wager.challenged1Id, wager.challenged2Id]);

        const winnerSelect = new StringSelectMenuBuilder()
          .setCustomId(`wg_finalize_winner_select|${wager.id}`)
          .setPlaceholder('Select the winning team')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel((teamA || 'Team A').slice(0, 100))
              .setValue('CHALLENGER'),
            new StringSelectMenuOptionBuilder()
              .setLabel((teamB || 'Team B').slice(0, 100))
              .setValue('CHALLENGED'),
          ]);

        await interaction.reply({
          content: 'Select the winner team:',
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(winnerSelect)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (customId.startsWith('wg_dodge|')) {
        await interaction.deferUpdate();

        const [, wagerIdRaw] = parseCustomId(customId);
        const wagerId = Number(wagerIdRaw);
        const wager = getWagerById(db, wagerId);

        if (!wager || !['PENDING', 'ACCEPTED'].includes(wager.status)) {
          await interaction.followUp({
            content: 'âŒ This wager cannot be dodged now.',
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
            content: 'âŒ Only wager participants, Hoster, Junior Hoster, or Event Hoster can use Dodge.',
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
          await (wagerChannelToDelete as any).delete('Wager ticket closed after dodge').catch((err: any) => {
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
            content: 'âŒ This wager is already closed.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canClose = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canClose) {
          await interaction.followUp({
            content: 'âŒ Only Hoster can close this ticket.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        closeWager(db, wager.id);
        await interaction.editReply({
          content: 'âœ… Ticket closed by hoster.',
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
            content: 'âŒ This war is not available for finalization.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
          await interaction.reply({
            content: 'âŒ Invalid winner selected.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.reply({
            content: 'âŒ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const eloModal = new ModalBuilder()
          .setCustomId(`wt_elo_modal|${war.id}|${winnerGuildId}|${scoreValue}`)
          .setTitle('Definir Pontos de ELO')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('winner_elo_gain')
                .setLabel('Pontos ganhos pelo ganhador')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ex: 20')
                .setRequired(true)
                .setMaxLength(6)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('loser_elo_loss')
                .setLabel('Pontos removidos do perdedor')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ex: 25')
                .setRequired(true)
                .setMaxLength(6)
            )
          );

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
            content: 'âŒ This war is not available for finalization.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.reply({
            content: 'âŒ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
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
          .setTitle('Finalizar War (Link + ELO)')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('winner_elo_gain')
                .setLabel('Pontos ganhos pelo ganhador')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ex: 20')
                .setRequired(true)
                .setMaxLength(6)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('loser_elo_loss')
                .setLabel('Pontos removidos do perdedor')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ex: 25')
                .setRequired(true)
                .setMaxLength(6)
            )
          );

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
            content: 'âŒ This war is not available for finalization.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.reply({
            content: 'âŒ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const { winnerScore, loserScore } = parsedScore;
        const totalRounds = Math.max(1, winnerScore + loserScore);

        const modalComponents: ActionRowBuilder<TextInputBuilder>[] = [];

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

          modalComponents.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(winnerGuildInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(loserGuildInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(mvpInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(clipsInput1),
            new ActionRowBuilder<TextInputBuilder>().addComponents(clipsInput2)
          );
        } else if (totalRounds === 2) {
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

            modalComponents.push(
              new ActionRowBuilder<TextInputBuilder>().addComponents(winnerGuildInput),
              new ActionRowBuilder<TextInputBuilder>().addComponents(loserGuildInput)
            );
          }

          const mvpInput = new TextInputBuilder()
            .setCustomId('mvp_user')
            .setLabel('MVP user (@mention, ID, or name)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('@player')
            .setRequired(false)
            .setMaxLength(120);

          modalComponents.push(new ActionRowBuilder<TextInputBuilder>().addComponents(mvpInput));
        } else {
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

          modalComponents.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(roundSummaryInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(mvpInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(clipsInput1),
            new ActionRowBuilder<TextInputBuilder>().addComponents(clipsInput2),
            new ActionRowBuilder<TextInputBuilder>().addComponents(clipsInput3)
          );
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
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        const panelEmbed = buildGuildPanelEmbedForInteraction(db, guildId);
        if (!panelEmbed) {
          await interaction.update({
            content: 'âŒ Guild not found.',
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
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const castRoleType = roleType as GuildRoleType;
        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        if (!canManageRoleType(actorRole, castRoleType)) {
          await replyPermissionError(interaction, `âŒ You cannot manage role **${getRoleLabel(castRoleType)}**.`);
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
          .setColor('#2a8900');

        await interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect),
            buildBackToPanelRow(guildId),
          ],
          content: '',
        });
        return;
      }

      if (customId.startsWith('gp_open_remove|')) {
        const [, guildId] = parseCustomId(customId);

        if (!guildId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        const manageableRoleTypes = getManageableRoleTypes(actorRole);
        const roleOptionsMap: Record<GuildRoleType, StringSelectMenuOptionBuilder> = {
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
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(roleSelect),
            buildBackToPanelRow(guildId),
          ],
        });
        return;
      }

      if (customId.startsWith('gp_open_transfer|')) {
        const [, guildId] = parseCustomId(customId);

        if (!guildId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
        if (!canTransfer) {
          await replyPermissionError(interaction, 'âŒ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
          return;
        }

        const guild = getGuildById(db, guildId);
        if (!guild) {
          await interaction.update({ content: 'âŒ Guild not found.', embeds: [], components: [] });
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

        const candidateOptions = await Promise.all(
          pageCandidates.map(async (userId) => {
            const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
            return new StringSelectMenuOptionBuilder()
              .setLabel((guildMember?.displayName || userId).slice(0, 100))
              .setDescription(`ID: ${userId}`)
              .setValue(userId);
          })
        );

        const transferSelect = new StringSelectMenuBuilder()
          .setCustomId(`gp_transfer_target_select|${guildId}`)
          .setPlaceholder('Select the new guild leader')
          .addOptions(candidateOptions);

        const components: Array<ActionRowBuilder<any>> = [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(transferSelect),
          buildBackToPanelRow(guildId),
        ];

        if (totalPages > 1) {
          const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`gp_transfer_target_page|${guildId}|${currentPage - 1}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage <= 1),
            new ButtonBuilder()
              .setCustomId(`gp_transfer_target_page|${guildId}|${currentPage + 1}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(currentPage >= totalPages)
          );
          components.splice(1, 0, pageRow);
        }

        await interaction.update({
          content: `Select the new leader for **${guild.name}**. Page ${currentPage}/${totalPages}.`,
          embeds: [],
          components,
        });
        return;
      }

      if (customId.startsWith('gp_confirm_invite|')) {
        const [, guildId, roleType, targetUserId] = parseCustomId(customId);

        if (!guildId || !roleType || !targetUserId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        if (!canManageRoleType(actorRole, roleType as GuildRoleType)) {
          await replyPermissionError(interaction, `âŒ You cannot manage role **${getRoleLabel(roleType as GuildRoleType)}**.`);
          return;
        }

        if (getPendingInviteForTarget(db, guildId, targetUserId, roleType as GuildRoleType)) {
          await interaction.update({
            content: ' This user already has a pending invitation for this role.',
            embeds: [],
            components: [],
          });
          return;
        }

        if (isUserInRole(db, guildId, targetUserId, roleType as GuildRoleType)) {
          await interaction.update({
            content: ` <@${targetUserId}> already has the role ${getRoleLabel(roleType as GuildRoleType)}.`,
            embeds: [],
            components: [],
          });
          return;
        }

        if (!canAddUserToRole(db, guildId, roleType as GuildRoleType)) {
          await interaction.update({
            content: `âŒ The ${getRoleLabel(roleType as GuildRoleType)} role has reached its limit.`,
            embeds: [],
            components: [],
          });
          return;
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const inviteId = createInvite(db, guildId, targetUserId, roleType as GuildRoleType, interaction.user.id, expiresAt);
        const inviteRow = buildInviteDecisionRow(inviteId, roleType as GuildRoleType);
        const guild = getGuildById(db, guildId);
        const inviterMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const inviterNick = inviterMember?.displayName || interaction.user.username;
        const guildName = guild?.name || guildId;
        const inviteEmbed = buildInviteEmbed(roleType as GuildRoleType, guildName, inviterNick);

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
        } catch (dmError) {
          sentByDm = false;
          const rawCode = (dmError as any)?.code;
          dmFailureReason = rawCode ? `code ${rawCode}` : 'unknown reason';
          console.warn(`Failed to send invite DM to ${targetUserId}:`, dmError);
        }

        if (!sentByDm) {
          await interaction.channel?.send({
            content: `<@${targetUserId}>`,
            embeds: [inviteEmbed],
            components: [inviteRow],
            allowedMentions: { users: [targetUserId] },
          });
        }

        await interaction.update({
          content: sentByDm
            ? `âœ… Invite sent via DM to <@${targetUserId}>.`
            : ` DM unavailable (${dmFailureReason}). Invite posted in chat mentioning <@${targetUserId}>.`,
          embeds: [],
          components: [],
        });
        return;
      }

      if (customId.startsWith('gp_invite_accept|') || customId.startsWith('gp_invite_decline|')) {
        const [action, inviteIdRaw] = parseCustomId(customId);
        const inviteId = Number(inviteIdRaw);
        const validation = validateInviteForAction(db, inviteId);

        if (!validation.invite) {
          await interaction.reply({
            content: `âŒ ${validation.reason || 'Invalid invite.'}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const invite = validation.invite;

        if (invite.targetUserId !== interaction.user.id) {
          await interaction.reply({
            content: 'âŒ Only the invited user can respond to this invitation.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (action === 'gp_invite_decline') {
          setInviteStatus(db, inviteId, 'DECLINED');
          await interaction.update({
            content: 'âŒ Invitation declined.',
            components: [],
          });
          return;
        }

        if (!canAddUserToRole(db, invite.guildId, invite.roleType as GuildRoleType)) {
          setInviteStatus(db, inviteId, 'DECLINED');
          await interaction.update({
            content: `âŒ Unable to accept: ${getRoleLabel(invite.roleType as GuildRoleType)} has reached its limit.`,
            components: [],
          });
          return;
        }

        if (isUserInRole(db, invite.guildId, invite.targetUserId, invite.roleType as GuildRoleType)) {
          setInviteStatus(db, inviteId, 'DECLINED');
          await interaction.update({
            content: ' You already have this role.',
            components: [],
          });
          return;
        }

        const added = addMemberToRole(db, invite.guildId, invite.targetUserId, invite.roleType as GuildRoleType);
        if (!added) {
          setInviteStatus(db, inviteId, 'DECLINED');
          await interaction.update({
            content: 'âŒ Unable to complete role assignment.',
            components: [],
          });
          return;
        }

        const inviteRoleType = invite.roleType as GuildRoleType;
        const configuredRoleId = interaction.guildId
          ? (inviteRoleType === 'CO_LEADER' ? getSetting(db, `${interaction.guildId}_guild_co_leader_role_id`) : null)
          ?? (inviteRoleType === 'MANAGER' ? getSetting(db, `${interaction.guildId}_guild_manager_role_id`) : null)
          : null;
        const discordRoleId = getDiscordRoleIdForRoleType(inviteRoleType, db, interaction.guildId ?? undefined);

        if (discordRoleId) {
          const discordGuildId = getDiscordGuildIdFromInternalGuildId(invite.guildId);
          const roleAssigned = await assignDiscordRoleById(client, discordGuildId, invite.targetUserId, discordRoleId);
          if (!roleAssigned) {
            if (configuredRoleId) {
              // Role was explicitly configured but failed â€” block acceptance
              removeMemberFromRole(db, invite.guildId, invite.targetUserId, inviteRoleType);
              setInviteStatus(db, inviteId, 'DECLINED');
              await interaction.update({
                content: 'âŒ Unable to accept invitation: failed to assign Discord role. Contact an admin.',
                components: [],
              });
              return;
            }
            // No role configured â€” Discord role is optional, continue anyway
            console.warn(`Discord role ${discordRoleId} not found for invite ${inviteId}; continuing without it.`);
          }
        }

        setInviteStatus(db, inviteId, 'ACCEPTED');
        await refreshGuildPanel(client, db, invite.guildId).catch(() => {});

        await interaction.update({
          content: `âœ… Invitation accepted for **${getRoleLabel(invite.roleType as GuildRoleType)}**.`,
          components: [],
        });
        return;
      }

      if (customId.startsWith('gp_confirm_remove|')) {
        const [, guildId, roleType, targetUserId] = parseCustomId(customId);

        if (!guildId || !roleType || !targetUserId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        if (!canManageRoleType(actorRole, roleType as GuildRoleType)) {
          await replyPermissionError(interaction, `âŒ You cannot manage role **${getRoleLabel(roleType as GuildRoleType)}**.`);
          return;
        }

        const guild = getGuildById(db, guildId);
        if (guild?.leaderId === targetUserId) {
          await interaction.update({
            content: 'âŒ The guild leader cannot be removed from this panel.',
            embeds: [],
            components: [],
          });
          return;
        }

        const removed = removeMemberFromRole(db, guildId, targetUserId, roleType as GuildRoleType);
        if (!removed) {
          await interaction.update({
            content: 'âŒ Unable to remove the selected member.',
            embeds: [],
            components: [],
          });
          return;
        }

        await maybeRemoveDiscordRoleByType(interaction, db, targetUserId, roleType as GuildRoleType);

        const targetUser = await client.users.fetch(targetUserId).catch(() => null);
        if (targetUser) {
          const removalEmbed = buildRemovalEmbed(roleType as GuildRoleType, guild?.name || guildId);
          await targetUser.send({ embeds: [removalEmbed] }).catch(() => {});
        }

        await refreshGuildPanel(client, db, guildId).catch(() => {});
        await interaction.update({
          content: `âœ… <@${targetUserId}> was removed from **${getRoleLabel(roleType as GuildRoleType)}** and the panel was updated.`,
          embeds: [],
          components: [],
        });
        return;
      }

      if (customId.startsWith('gp_confirm_transfer|')) {
        const [, guildId, targetUserId] = parseCustomId(customId);

        if (!guildId || !targetUserId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
        if (!canTransfer) {
          await replyPermissionError(interaction, 'âŒ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
          return;
        }

        const guild = getGuildById(db, guildId);
        if (!guild) {
          await interaction.update({ content: 'âŒ Guild not found.', embeds: [], components: [] });
          return;
        }

        if (targetUserId === guild.leaderId) {
          await interaction.update({
            content: ' This user is already the current guild leader.',
            embeds: [],
            components: [],
          });
          return;
        }

        const registeredMemberIds = getRegisteredGuildMemberIds(db, guildId);
        if (!registeredMemberIds.includes(targetUserId)) {
          await interaction.update({
            content: 'âŒ The selected user is not a registered member of this guild.',
            embeds: [],
            components: [],
          });
          return;
        }

        const previousLeaderId = guild.leaderId;
        const previousCoLeaderId = guild.coLeaderId;

        db.prepare('UPDATE Guilds SET leaderId = ?, coLeaderId = CASE WHEN coLeaderId = ? THEN NULL ELSE coLeaderId END WHERE id = ?')
          .run(targetUserId, targetUserId, guildId);

        const discordGuildId = getDiscordGuildIdFromInternalGuildId(guildId);
        const leaderRoleId = getSetting(db, `${interaction.guildId}_guild_leader_role_id`) || FIXED_ROLE_IDS.GUILD_LEADER;
        const assigned = await assignDiscordRoleById(client, discordGuildId, targetUserId, leaderRoleId);
        if (!assigned) {
          db.prepare('UPDATE Guilds SET leaderId = ?, coLeaderId = ? WHERE id = ?')
            .run(previousLeaderId, previousCoLeaderId, guildId);
          await interaction.update({
            content: 'âŒ Failed to assign the Guild Leader role on Discord. Ownership transfer canceled.',
            embeds: [],
            components: [],
          });
          return;
        }

        await maybeRemoveGuildLeaderDiscordRole(interaction, db, previousLeaderId);
        await refreshGuildPanel(client, db, guildId).catch(() => {});

        await interaction.update({
          content: `âœ… Ownership transferred successfully to <@${targetUserId}>.`,
          embeds: [],
          components: [],
        });
        return;
      }

      if (customId.startsWith('gp_leave_guild|')) {
        await interaction.deferUpdate();

        const [, guildId] = parseCustomId(customId);
        if (!guildId) {
          await interaction.followUp({ content: 'âŒ Invalid action.', flags: MessageFlags.Ephemeral });
          return;
        }

        const guild = getGuildById(db, guildId);
        if (!guild) {
          await interaction.followUp({ content: 'âŒ Guild not found.', flags: MessageFlags.Ephemeral });
          return;
        }

        const userId = interaction.user.id;
        if (guild.leaderId === userId) {
          if (!guild.coLeaderId) {
            await interaction.followUp({
              content: 'âŒ You are the guild leader and must transfer ownership before leaving. Use Ownership Transfer first.',
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

          await refreshGuildPanel(client, db, guildId).catch(() => {});

          await interaction.followUp({
            content: 'âœ… You left the guild. Ownership transferred to the former co-leader.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (guild.coLeaderId === userId) {
          removeMemberFromRole(db, guildId, userId, 'CO_LEADER');
          await maybeRemoveDiscordRoleByType(interaction, db, userId, 'CO_LEADER');
          await refreshGuildPanel(client, db, guildId).catch(() => {});
          await interaction.followUp({ content: 'âœ… You left co-leader role.', flags: MessageFlags.Ephemeral });
          return;
        }

        if (db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
          removeMemberFromRole(db, guildId, userId, 'MANAGER');
          await maybeRemoveDiscordRoleByType(interaction, db, userId, 'MANAGER');
          await refreshGuildPanel(client, db, guildId).catch(() => {});
          await interaction.followUp({ content: 'âœ… You were removed from Manager and left the guild.', flags: MessageFlags.Ephemeral });
          return;
        }

        if (db.prepare('SELECT 1 FROM MainRosters WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
          removeMemberFromRole(db, guildId, userId, 'MAIN');
          await refreshGuildPanel(client, db, guildId).catch(() => {});
          await interaction.followUp({ content: 'âœ… You left the main roster.', flags: MessageFlags.Ephemeral });
          return;
        }

        if (db.prepare('SELECT 1 FROM SubRosters WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
          removeMemberFromRole(db, guildId, userId, 'SUB');
          await refreshGuildPanel(client, db, guildId).catch(() => {});
          await interaction.followUp({ content: 'âœ… You left the sub roster.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.followUp({ content: 'âŒ You are not a member of this guild (or already left).', flags: MessageFlags.Ephemeral });
        return;
      }

      if (customId.startsWith('gp_cancel_action|')) {
        await interaction.update({
          content: 'âŽ Action canceled.',
          components: [],
          embeds: [],
        });
        return;
      }
    }

    // â”€â”€ Signing flow buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (interaction.isButton() && interaction.customId.startsWith('sign_')) {
      const parts = interaction.customId.split('_');
      const action = parts[1]; // accept | decline | approve | reject
      const signingId = parseInt(parts[2] ?? '0');
      const { getSigningRequest, updateSigningStatus, getSetting } = await import('./database.js');
      const { signMember, getAllOrgs } = await import('./siteapi.js');

      const req = getSigningRequest(db, signingId);
      if (!req) { await interaction.reply({ content: 'âŒ Signing request not found or expired.', ephemeral: true }); return; }

      if (action === 'accept') {
        if (interaction.user.id !== req.target_discord_id) {
          await interaction.reply({ content: 'âŒ This signing offer is not for you.', ephemeral: true }); return;
        }
        if (req.status !== 'PENDING_PLAYER') {
          await interaction.reply({ content: 'âŒ This offer has already been responded to.', ephemeral: true }); return;
        }
        // Send to log channel
        const logChannelId = getSetting(db, 'log_channel_id');
        if (!logChannelId) {
          await interaction.reply({ content: 'âŒ No log channel set. Ask staff to use /setlogchannel.', ephemeral: true }); return;
        }
        const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel || !logChannel.isTextBased() || !('send' in logChannel)) {
          await interaction.reply({ content: 'âŒ Log channel not accessible.', ephemeral: true }); return;
        }
        const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setTitle('â³ Signing Request â€” Pending Staff Approval')
          .setColor(0xF5F07A)
          .addFields(
            { name: 'Guild', value: `${req.org_tag}`, inline: true },
            { name: 'Player', value: `<@${req.target_discord_id}> (${req.target_name})`, inline: true },
            { name: 'Role', value: req.role, inline: true },
            { name: 'Invited by', value: `<@${req.inviter_discord_id}>`, inline: true },
          );
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`sign_approve_${signingId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`sign_reject_${signingId}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
        );
        const logMsg = await (logChannel as any).send({ embeds: [embed], components: [row] });
        updateSigningStatus(db, signingId, 'PENDING_STAFF', logMsg.id);
        await interaction.update({ content: 'âœ… You accepted the signing offer. A staff member will review it.', components: [], embeds: [] });

      } else if (action === 'decline') {
        if (interaction.user.id !== req.target_discord_id) {
          await interaction.reply({ content: 'âŒ This signing offer is not for you.', ephemeral: true }); return;
        }
        updateSigningStatus(db, signingId, 'DECLINED');
        await interaction.update({ content: 'âŒ You declined the signing offer.', components: [], embeds: [] });

      } else if (action === 'approve') {
        // Staff approving
        const staffRoleId = getSetting(db, 'staff_role_id');
        if (staffRoleId && interaction.guild) {
          const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
          if (!member?.roles.cache.has(staffRoleId)) {
            await interaction.reply({ content: 'âŒ You are not staff.', ephemeral: true }); return;
          }
        }
        if (req.status !== 'PENDING_STAFF') {
          await interaction.reply({ content: 'âŒ Already handled.', ephemeral: true }); return;
        }
        try {
          await signMember(req.org_id, req.target_discord_id, req.target_name, req.role);
        } catch (e: any) {
          await interaction.reply({ content: `âŒ Could not add to site: ${e.message}`, ephemeral: true }); return;
        }
        updateSigningStatus(db, signingId, 'APPROVED');
        // Give guild role
        const orgs = await getAllOrgs().catch(() => []);
        const org = orgs.find((o: any) => o.tag === req.org_tag);
        if (org?.discord_role_id && interaction.guild) {
          const gm = await interaction.guild.members.fetch(req.target_discord_id).catch(() => null);
          if (gm) await gm.roles.add(org.discord_role_id).catch(() => null);
        }
        // Public announcement
        const { EmbedBuilder } = await import('discord.js');
        const pubChannelId = getSetting(db, 'public_channel_id');
        if (pubChannelId) {
          const pubChannel = await client.channels.fetch(pubChannelId).catch(() => null);
          if (pubChannel && pubChannel.isTextBased() && 'send' in pubChannel) {
            const pubEmbed = new EmbedBuilder()
              .setTitle('ðŸ“ New Signing')
              .setColor(0x2a8900)
              .setDescription(`<@${req.target_discord_id}> has been signed to **${req.org_tag}** as **${req.role}**!`);
            await (pubChannel as any).send({ embeds: [pubEmbed] });
          }
        }
        await interaction.update({ content: `âœ… Signing approved. ${req.target_name} added to ${req.org_tag}.`, components: [], embeds: [] });

      } else if (action === 'reject') {
        const staffRoleId = getSetting(db, 'staff_role_id');
        if (staffRoleId && interaction.guild) {
          const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
          if (!member?.roles.cache.has(staffRoleId)) {
            await interaction.reply({ content: 'âŒ You are not staff.', ephemeral: true }); return;
          }
        }
        updateSigningStatus(db, signingId, 'REJECTED');
        // DM the player
        try {
          const user = await client.users.fetch(req.target_discord_id);
          await user.send(`âŒ Your signing to **${req.org_tag}** was rejected by staff.`);
        } catch { /* ignore */ }
        await interaction.update({ content: `âŒ Signing rejected.`, components: [], embeds: [] });
      }
      return;
    }
    // â”€â”€ End signing flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;

      if (customId.startsWith('wt_select_opponent|')) {
        const [, actorGuildId] = parseCustomId(customId);
        const opponentGuildId = interaction.values[0];
        const actorGuild = actorGuildId ? getGuildById(db, actorGuildId) : null;
        const opponentGuild = getGuildById(db, opponentGuildId);

        if (!actorGuild || !opponentGuild) {
          await interaction.update({
            content: 'âŒ Invalid guild selection.',
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
            content: 'âŒ You no longer have permission to open this war ticket.',
            components: [],
            embeds: [],
          });
          return;
        }

        const warChannel = await createWarTicketChannel(interaction, db, actorGuild, opponentGuild);
        if (!warChannel) {
          await interaction.update({
            content: 'âŒ Failed to create war ticket channel. Check bot permissions and category setup.',
            components: [],
            embeds: [],
          });
          return;
        }

        await interaction.update({
          content: `âœ… War ticket created successfully! Check <#${warChannel.id}>`,
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
            content: 'âŒ This war is not available for finalization.',
            components: [],
            embeds: [],
          });
          return;
        }

        if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
          await interaction.update({
            content: 'âŒ Invalid winner selected.',
            components: [],
            embeds: [],
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.update({
            content: 'âŒ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
            components: [],
            embeds: [],
          });
          return;
        }

        const scoreSelect = new StringSelectMenuBuilder()
          .setCustomId(`wt_finalize_score_select|${war.id}|${winnerGuildId}`)
          .setPlaceholder('Select the final score')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('2-1')
              .setDescription('Close war result')
              .setValue('2-1'),
            new StringSelectMenuOptionBuilder()
              .setLabel('3-0')
              .setDescription('Clean sweep result')
              .setValue('3-0'),
          ]);

        await interaction.update({
          content: 'Select the final score:',
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(scoreSelect)],
          embeds: [],
        });
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
            content: 'âŒ Invalid winner selected.',
            components: [],
            embeds: [],
          });
          return;
        }

        if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
          await interaction.update({
            content: 'âŒ This war is not available for finalization.',
            components: [],
            embeds: [],
          });
          return;
        }

        if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
          await interaction.update({
            content: 'âŒ Invalid winner selected.',
            components: [],
            embeds: [],
          });
          return;
        }

        if (!parsedScore) {
          await interaction.update({
            content: 'âŒ Invalid score selected.',
            components: [],
            embeds: [],
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.update({
            content: 'âŒ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
            components: [],
            embeds: [],
          });
          return;
        }

        const { winnerScore, loserScore } = parsedScore;
        const decisionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`wt_finalize_now|${war.id}|${winnerGuildId}|${scoreValue}`)
            .setLabel('Finalize Without Link')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`wt_finalize_with_link|${war.id}|${winnerGuildId}|${scoreValue}`)
            .setLabel('Send Clips Link')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`wt_finalize_with_details|${war.id}|${winnerGuildId}|${scoreValue}`)
            .setLabel('Finalize With Details')
            .setStyle(ButtonStyle.Secondary)
        );

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
        const winnerSide = interaction.values[0] as 'CHALLENGER' | 'CHALLENGED';
        const wager = getWagerById(db, wagerId);

        if (!wager || wager.status !== 'ACCEPTED') {
          await interaction.update({
            content: 'âŒ This wager is not available for finalization.',
            components: [],
            embeds: [],
          });
          return;
        }

        if (!['CHALLENGER', 'CHALLENGED'].includes(winnerSide)) {
          await interaction.update({
            content: 'âŒ Invalid winner selected.',
            components: [],
            embeds: [],
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.update({
            content: 'âŒ You do not have permission to finalize this wager. Configure the role with `/setup hoster_role`.',
            components: [],
            embeds: [],
          });
          return;
        }

        const clipsInput = new TextInputBuilder()
          .setCustomId('wager_clips_link')
          .setLabel('Clips link (required)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://...')
          .setRequired(true)
          .setMaxLength(400);

        const modal = new ModalBuilder()
          .setCustomId(`wg_finalize_clip_modal|${wager.id}|${winnerSide}`)
          .setTitle('Finalizar Wager')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(clipsInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('winner_elo_gain')
                .setLabel('Pontos ELO ganhos pelo ganhador')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ex: 20')
                .setRequired(true)
                .setMaxLength(6)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('loser_elo_loss')
                .setLabel('Pontos ELO removidos do perdedor')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ex: 25')
                .setRequired(true)
                .setMaxLength(6)
            )
          );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith('gp_action_select|')) {
        const [, guildId] = parseCustomId(customId);

        if (!guildId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        const selectedAction = interaction.values[0];

        if (selectedAction === 'MANAGE_REMOVE') {
          const manageableRoleTypes = getManageableRoleTypes(actorRole);
          const roleOptionsMap: Record<GuildRoleType, StringSelectMenuOptionBuilder> = {
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
            components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(roleSelect)],
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
          await replyPermissionError(interaction, `âŒ You cannot manage role **${getRoleLabel(roleType)}**.`);
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
          .setColor('#2a8900');

        await interaction.update({
          embeds: [embed],
          components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect)],
          content: '',
        });
        return;
      }

      if (customId.startsWith('gp_remove_role_select|')) {
        const [, guildId] = parseCustomId(customId);

        if (!guildId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const roleType = interaction.values[0] as GuildRoleType;

        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        if (!canManageRoleType(actorRole, roleType)) {
          await replyPermissionError(interaction, `âŒ You cannot manage role **${getRoleLabel(roleType)}**.`);
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

        const memberOptions = await Promise.all(
          pageMembers.map(async (userId: string) => {
            const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
            return new StringSelectMenuOptionBuilder()
              .setLabel((guildMember?.displayName || userId).slice(0, 100))
              .setDescription(`ID: ${userId}`)
              .setValue(userId);
          })
        );

        const memberSelect = new StringSelectMenuBuilder()
          .setCustomId(`gp_remove_member_select|${guildId}|${roleType}`)
          .setPlaceholder(`Select who to remove from ${getRoleLabel(roleType)}`)
          .addOptions(memberOptions);

        const components: Array<ActionRowBuilder<any>> = [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(memberSelect),
          buildBackToPanelRow(guildId),
        ];

        if (totalPages > 1) {
          const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${currentPage - 1}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage <= 1),
            new ButtonBuilder()
              .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${currentPage + 1}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(currentPage >= totalPages)
          );
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
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        if (!canManageRoleType(actorRole, roleType as GuildRoleType)) {
          await replyPermissionError(interaction, `âŒ You cannot manage role **${getRoleLabel(roleType as GuildRoleType)}**.`);
          return;
        }

        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`gp_confirm_remove|${guildId}|${roleType}|${targetUserId}`)
            .setLabel('Confirm Removal')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`gp_cancel_action|${guildId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({
          content: `Do you want to remove <@${targetUserId}> from **${getRoleLabel(roleType as GuildRoleType)}**?`,
          embeds: [],
          components: [confirmRow, buildBackToPanelRow(guildId)],
        });
        return;
      }

      if (customId.startsWith('gp_transfer_target_select|')) {
        const [, guildId] = parseCustomId(customId);
        const targetUserId = interaction.values[0];

        if (!guildId || !targetUserId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
        if (!canTransfer) {
          await replyPermissionError(interaction, 'âŒ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
          return;
        }

        const guild = getGuildById(db, guildId);
        if (!guild) {
          await interaction.update({ content: 'âŒ Guild not found.', embeds: [], components: [] });
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
            content: 'âŒ The selected user is not a registered member of this guild.',
            components: [buildBackToPanelRow(guildId)],
            embeds: [],
          });
          return;
        }

        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`gp_confirm_transfer|${guildId}|${targetUserId}`)
            .setLabel('Confirm Transfer')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`gp_cancel_action|${guildId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({
          content: `Do you want to transfer guild ownership to <@${targetUserId}>?`,
          embeds: [],
          components: [confirmRow, buildBackToPanelRow(guildId)],
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
            content: 'âŒ Invalid opponent selection.',
            embeds: [],
            components: [],
          });
          return;
        }

        const challengedMember = await interaction.guild?.members.fetch(challengedId).catch(() => null);
        if (!challengedMember || challengedMember.user.bot) {
          await interaction.editReply({
            content: 'âŒ You must select a valid member (not a bot).',
            embeds: [],
            components: [],
          });
          return;
        }

        const challengerMember = await interaction.guild?.members.fetch(challengerId).catch(() => null);
        const challengerName = challengerMember?.displayName || interaction.user.username;
        const challengedName = challengedMember.displayName || challengedId;
        const ticketName = `${challengerName} vs ${challengedName}`;

        const ticketChannel = await createWagerTicketChannel(interaction, ticketName, [challengerId, challengedId], db);
        if (!ticketChannel) {
          await interaction.editReply({
            content: 'âŒ Failed to create wager ticket channel. Check bot permissions and category setup.',
            embeds: [],
            components: [],
          });
          return;
        }

        const wagerEmbed = new EmbedBuilder()
          .setColor('#2a8900')
          .setTitle('Wager Ticket')
          .setDescription(
            ' Chat is locked until the wager is accepted.\n\n' +
            'Use the buttons below to accept, dodge, or close the ticket.'
          );

        const tempRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('wg_accept|temp').setLabel('Accept Wager').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('wg_dodge|temp').setLabel('Dodge').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('wg_close|temp').setLabel('Close Ticket').setStyle(ButtonStyle.Secondary)
        );

        const panelMessage = await ticketChannel.send({
          content: `<@${challengerId}> vs <@${challengedId}>`,
          embeds: [wagerEmbed],
          components: [tempRow],
          allowedMentions: { users: [challengerId, challengedId] },
        });

        const wagerId = createWager(
          db,
          '1V1',
          ticketChannel.id,
          challengerId,
          null,
          challengedId,
          null,
          panelMessage.id
        );

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`wg_accept|${wagerId}`).setLabel('Accept Wager').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`wg_dodge|${wagerId}`).setLabel('Dodge').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`wg_finalize_open|${wagerId}`).setLabel('Finalize Wager').setStyle(ButtonStyle.Primary)
        );

        await panelMessage.edit({ components: [actionRow] });

        await interaction.editReply({
          content: `âœ… 1v1 wager ticket created: <#${ticketChannel.id}>`,
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
            content: 'âŒ Invalid teammate selection.',
            embeds: [],
            components: [],
          });
          return;
        }

        const partnerMember = await interaction.guild?.members.fetch(partnerId).catch(() => null);
        if (!partnerMember || partnerMember.user.bot) {
          await interaction.update({
            content: 'âŒ You must select a valid teammate (not a bot).',
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
          .setColor('#2a8900')
          .setTitle('Wager 2v2')
          .setDescription('Step 2/2: Select the two opposing players.');

        await interaction.update({
          embeds: [embed],
          components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(selectOpponents)],
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
            content: 'âŒ Invalid 2v2 selection data.',
            embeds: [],
            components: [],
          });
          return;
        }

        const uniqueIds = new Set([challenger1Id, challenger2Id, challenged1Id, challenged2Id]);
        if (uniqueIds.size !== 4) {
          await interaction.editReply({
            content: 'âŒ The four players must be different users.',
            embeds: [],
            components: [],
          });
          return;
        }

        const members = await Promise.all(
          [challenger1Id, challenger2Id, challenged1Id, challenged2Id].map(id =>
            interaction.guild?.members.fetch(id).catch(() => null)
          )
        );

        if (members.some(member => !member || member.user.bot)) {
          await interaction.editReply({
            content: 'âŒ All selected players must be valid members (not bots).',
            embeds: [],
            components: [],
          });
          return;
        }

        const ticketName = `${members[0]?.displayName || challenger1Id}-${members[1]?.displayName || challenger2Id} vs ${members[2]?.displayName || challenged1Id}-${members[3]?.displayName || challenged2Id}`;
        const ticketChannel = await createWagerTicketChannel(
          interaction,
          ticketName,
          [challenger1Id, challenger2Id, challenged1Id, challenged2Id],
          db
        );

        if (!ticketChannel) {
          await interaction.editReply({
            content: 'âŒ Failed to create wager ticket channel. Check bot permissions and category setup.',
            embeds: [],
            components: [],
          });
          return;
        }

        const wagerEmbed = new EmbedBuilder()
          .setColor('#2a8900')
          .setTitle('Wager Ticket')
          .setDescription(
            ' Chat is locked until the wager is accepted by both challenged players.\n\n' +
            'Use the buttons below to accept, dodge, or close the ticket.'
          );

        const tempRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('wg_accept|temp').setLabel('Accept Wager').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('wg_dodge|temp').setLabel('Dodge').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('wg_close|temp').setLabel('Close Ticket').setStyle(ButtonStyle.Secondary)
        );

        const panelMessage = await ticketChannel.send({
          content: `<@${challenger1Id}> + <@${challenger2Id}> vs <@${challenged1Id}> + <@${challenged2Id}>`,
          embeds: [wagerEmbed],
          components: [tempRow],
          allowedMentions: { users: [challenger1Id, challenger2Id, challenged1Id, challenged2Id] },
        });

        const wagerId = createWager(
          db,
          '2V2',
          ticketChannel.id,
          challenger1Id,
          challenger2Id,
          challenged1Id,
          challenged2Id,
          panelMessage.id
        );

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`wg_accept|${wagerId}`).setLabel('Accept Wager').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`wg_dodge|${wagerId}`).setLabel('Dodge').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`wg_finalize_open|${wagerId}`).setLabel('Finalize Wager').setStyle(ButtonStyle.Primary)
        );

        await panelMessage.edit({ components: [actionRow] });

        await interaction.editReply({
          content: `âœ… 2v2 wager ticket created: <#${ticketChannel.id}>`,
          embeds: [],
          components: [],
        });
        return;
      }

      if (customId.startsWith('gp_add_user_select|')) {
        const [, guildId, roleType] = parseCustomId(customId);
        const targetUserId = interaction.values[0];

        if (!guildId || !roleType || !targetUserId) {
          await interaction.update({ content: 'âŒ Invalid action.', embeds: [], components: [] });
          return;
        }

        const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
        if (!actorRole) {
          await replyPermissionError(interaction, 'âŒ You are not registered in this guild panel.');
          return;
        }

        if (!canManageRoleType(actorRole, roleType as GuildRoleType)) {
          await replyPermissionError(interaction, `âŒ You cannot manage role **${getRoleLabel(roleType as GuildRoleType)}**.`);
          return;
        }

        if (targetUserId === interaction.user.id) {
          await interaction.update({
            content: 'âŒ You cannot invite yourself through this flow.',
            components: [],
            embeds: [],
          });
          return;
        }

        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`gp_confirm_invite|${guildId}|${roleType}|${targetUserId}`)
            .setLabel('Confirm Invite')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`gp_cancel_action|${guildId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({
          content: `Do you want to invite <@${targetUserId}> to **${getRoleLabel(roleType as GuildRoleType)}**?`,
          embeds: [],
          components: [confirmRow, buildBackToPanelRow(guildId)],
        });
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

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
          await interaction.editReply(`âœ… Guild **${name}** [${tag}] registered on the site!`);
        } catch (e: any) {
          await interaction.editReply(`âŒ ${e.message}`);
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
            content: 'âŒ Invalid input.',
          });
          return;
        }

        const actorGuild = getGuildById(db, actorGuildId);
        const opponentGuild = db.prepare('SELECT * FROM Guilds WHERE name = ? AND id != ?').get(opponentGuildName, actorGuildId);

        if (!actorGuild) {
          await interaction.editReply({
            content: 'âŒ Your guild data could not be found.',
          });
          return;
        }

        if (!opponentGuild) {
          await interaction.editReply({
            content: `âŒ Guild "${opponentGuildName}" not found or is your own guild.`,
          });
          return;
        }

        const starterRole = getGuildRoleInWar(actorGuild, interaction.user.id);
        const isManager = !!db
          .prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?')
          .get(actorGuild.id, interaction.user.id);

        if (!starterRole && !isManager) {
          await interaction.editReply({
            content: 'âŒ You no longer have permission to open this war ticket.',
          });
          return;
        }

        const warChannel = await createWarTicketChannel(interaction, db, actorGuild, opponentGuild);
        if (!warChannel) {
          await interaction.editReply({
            content: 'âŒ Failed to create war ticket channel. Check bot permissions and category setup.',
          });
          return;
        }

        await interaction.editReply({
          content: `âœ… War ticket created successfully! Check <#${warChannel.id}>`,
        });
        return;
      }

      if (customId.startsWith('wg_finalize_clip_modal|')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [, wagerIdRaw, winnerSide] = parseCustomId(customId);
        const wagerId = Number(wagerIdRaw);
        const wager = getWagerById(db, wagerId);
        const clipsLink = interaction.fields.getTextInputValue('wager_clips_link')?.trim();
        const winnerEloGainRaw = interaction.fields.getTextInputValue('winner_elo_gain')?.trim();
        const loserEloLossRaw = interaction.fields.getTextInputValue('loser_elo_loss')?.trim();

        if (!wager || wager.status !== 'ACCEPTED') {
          await interaction.editReply({
            content: 'âŒ This wager is not available for finalization.',
          });
          return;
        }

        if (!['CHALLENGER', 'CHALLENGED'].includes(winnerSide || '')) {
          await interaction.editReply({
            content: 'âŒ Invalid winner selected.',
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.editReply({
            content: 'âŒ You do not have permission to finalize this wager. Configure the role with `/setup hoster_role`.',
          });
          return;
        }

        if (!clipsLink || !isValidClipLink(clipsLink)) {
          await interaction.editReply({
            content: 'âŒ Invalid link. Please provide a valid URL starting with http:// or https://',
          });
          return;
        }

        const winnerEloGain = parseInt(winnerEloGainRaw || '', 10);
        const loserEloLoss = parseInt(loserEloLossRaw || '', 10);
        if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
          await interaction.editReply({ content: 'âŒ Pontos de ELO invÃ¡lidos. Use nÃºmeros inteiros positivos.' });
          return;
        }

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

        const wagerLogId = getSetting(db, `${interaction.guildId}_wager_log_channel_id`) || WAGER_LOGS_CHANNEL_ID;
        const wagerLogsChannel = await interaction.client.channels.fetch(wagerLogId).catch(() => null);
        if (wagerLogsChannel && wagerLogsChannel.isTextBased() && 'send' in wagerLogsChannel) {
          await wagerLogsChannel.send({
            flags: MessageFlags.IsComponentsV2,
            components: [
              buildWagerLogsContainer(
                `WAGER FINALIZED (${wager.type})`,
                teamA,
                teamB,
                `\nWinner: ${winnerTeam}\nClips: ${clipsLink}\nELO: +${winnerEloGain} / -${loserEloLoss}\nClosed by: <@${interaction.user.id}>`,
                '## WAGER CLOSED'
              ),
            ],
          });
        }

        await interaction.followUp({
          content: `âœ… Wager finalizado. Ganhador: ${winnerTeam} | Clips: ${clipsLink}\nðŸ“Š ELO: +${winnerEloGain} / -${loserEloLoss}. Fechando ticket...`,
          flags: MessageFlags.Ephemeral,
        });

        if (interaction.channel && 'delete' in interaction.channel) {
          await interaction.channel.delete('Wager finalized and recorded').catch(() => null);
        }
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
            content: 'âŒ This war is not available for finalization.',
          });
          return;
        }

        if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
          await interaction.editReply({
            content: 'âŒ Invalid winner selected.',
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.editReply({
            content: 'âŒ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
          });
          return;
        }

        const { winnerScore, loserScore } = parsedScore;
        const totalRounds = Math.max(1, winnerScore + loserScore);

        const roundSummary = interaction.fields.getTextInputValue('rounds_summary')?.trim() || null;
        const roundDowns: Array<{ winnerDowns: number; loserDowns: number }> = [];

        if (roundSummary) {
          if (totalRounds <= 2) {
            await interaction.editReply({
              content: 'âŒ Round summary is only used for wars with more than 2 total rounds.',
            });
            return;
          }
        } else {
          if (totalRounds > 2) {
            await interaction.editReply({
              content: 'âŒ Please provide a round details summary for wars longer than 2 rounds.',
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
                content: `âŒ Invalid downs value for round ${round}. Must be non-negative numbers.`,
              });
              return;
            }

            roundDowns.push({ winnerDowns, loserDowns });
          }
        }

        const mvpRaw = interaction.fields.getTextInputValue('mvp_user')?.trim() || null;

        // Collect all clip links
        const clipLinks: string[] = [];
        for (let i = 1; i <= 3; i++) {
          const clipLink = interaction.fields.getTextInputValue(`clips_link_${i}`)?.trim();
          if (clipLink) {
            if (!isValidClipLink(clipLink)) {
              await interaction.editReply({
                content: `âŒ Invalid clip link ${i}. Please provide a valid URL starting with http:// or https://`,
              });
              return;
            }
            clipLinks.push(clipLink);
          }
        }

        // Combine all clip links into a single string for storage
        const clipsCombined = clipLinks.length > 0 ? clipLinks.join('\n') : null;

        const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
        const { winnerGuild } = await finalizeWarAndLog(
          interaction,
          client,
          db,
          war,
          winnerGuildId,
          winnerScore,
          loserScore,
          clipsCombined,
          roundDowns,
          mvpRaw,
          roundSummary
        );

        const clipsText = clipLinks.length > 0 ? ` | Clips: ${clipLinks.length} link(s) provided` : '';
        const eloRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`wt_elo_btn|${winnerGuildId}|${loserGuildId}|${war.id}`)
            .setLabel('Aplicar ELO')
            .setStyle(ButtonStyle.Primary)
        );
        await interaction.editReply({
          content:
            `âœ… War finalizada. Ganhador: **${winnerGuild?.name || 'Unknown'}** | ` +
            `Score: **${winnerScore}-${loserScore}**${clipsText}.\nClique em **Aplicar ELO** para definir os pontos.`,
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
            content: 'âŒ This war is not available for finalization.',
          });
          return;
        }

        if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
          await interaction.editReply({
            content: 'âŒ Invalid winner selected.',
          });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canFinalize = canMemberFinalizeTicket(member, db, interaction.guildId);

        if (!canFinalize) {
          await interaction.editReply({
            content: 'âŒ You do not have permission to finalize this war. Configure the role with `/setup hoster_role`.',
          });
          return;
        }

        if (!clipsLinkRaw || !isValidClipLink(clipsLinkRaw)) {
          await interaction.editReply({
            content: 'âŒ Invalid link. Please provide a valid URL starting with http:// or https://',
          });
          return;
        }

        const winnerEloGain = parseInt(winnerEloGainRaw || '', 10);
        const loserEloLoss = parseInt(loserEloLossRaw || '', 10);
        if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
          await interaction.editReply({ content: 'âŒ Pontos de ELO invÃ¡lidos. Use nÃºmeros inteiros positivos.' });
          return;
        }

        const { winnerScore, loserScore } = parsedScore;
        const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
        const { winnerGuild } = await finalizeWarAndLog(
          interaction,
          client,
          db,
          war,
          winnerGuildId,
          winnerScore,
          loserScore,
          clipsLinkRaw
        );

        applyGuildElo(db, winnerGuildId, winnerEloGain, loserGuildId, loserEloLoss, war.id);
        await refreshGuildPanel(client, db, winnerGuildId).catch(() => {});
        await refreshGuildPanel(client, db, loserGuildId).catch(() => {});

        await interaction.editReply({
          content: `âœ… War finalizada. Ganhador: **${winnerGuild?.name || 'Unknown'}** | Score: **${winnerScore}-${loserScore}** | Clips: ${clipsLinkRaw}\nðŸ“Š ELO: +${winnerEloGain} / -${loserEloLoss}. Fechando ticket...`,
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
          await interaction.editReply({ content: 'âŒ Esta war nÃ£o estÃ¡ disponÃ­vel para finalizaÃ§Ã£o.' });
          return;
        }

        if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
          await interaction.editReply({ content: 'âŒ Ganhador invÃ¡lido.' });
          return;
        }

        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        if (!canMemberFinalizeTicket(member, db, interaction.guildId)) {
          await interaction.editReply({ content: 'âŒ Sem permissÃ£o para finalizar. Configure com `/setup hoster_role`.' });
          return;
        }

        const winnerEloGain = parseInt(interaction.fields.getTextInputValue('winner_elo_gain')?.trim() || '', 10);
        const loserEloLoss = parseInt(interaction.fields.getTextInputValue('loser_elo_loss')?.trim() || '', 10);
        if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
          await interaction.editReply({ content: 'âŒ Pontos de ELO invÃ¡lidos. Use nÃºmeros inteiros positivos.' });
          return;
        }

        const { winnerScore, loserScore } = parsedScore;
        const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
        const { winnerGuild } = await finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, null);

        applyGuildElo(db, winnerGuildId, winnerEloGain, loserGuildId, loserEloLoss, war.id);
        await refreshGuildPanel(client, db, winnerGuildId).catch(() => {});
        await refreshGuildPanel(client, db, loserGuildId).catch(() => {});

        await interaction.editReply({
          content: `âœ… War finalizada. Ganhador: **${winnerGuild?.name || 'Unknown'}** | Score: **${winnerScore}-${loserScore}**\nðŸ“Š ELO: +${winnerEloGain} / -${loserEloLoss}. Fechando ticket...`,
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
          await interaction.editReply({ content: 'âŒ Dados invÃ¡lidos.' });
          return;
        }

        const winnerEloGain = parseInt(interaction.fields.getTextInputValue('winner_elo_gain')?.trim() || '', 10);
        const loserEloLoss = parseInt(interaction.fields.getTextInputValue('loser_elo_loss')?.trim() || '', 10);
        if (isNaN(winnerEloGain) || winnerEloGain < 0 || isNaN(loserEloLoss) || loserEloLoss < 0) {
          await interaction.editReply({ content: 'âŒ Pontos de ELO invÃ¡lidos. Use nÃºmeros inteiros positivos.' });
          return;
        }

        applyGuildElo(db, winnerGuildId, winnerEloGain, loserGuildId, loserEloLoss, isNaN(warId) ? undefined : warId);
        await refreshGuildPanel(client, db, winnerGuildId).catch(() => {});
        await refreshGuildPanel(client, db, loserGuildId).catch(() => {});

        await interaction.editReply({
          content: `âœ… ELO aplicado! Ganhador: +${winnerEloGain} | Perdedor: -${loserEloLoss}`,
        });
        return;
      }
    }
  } catch (error) {
    const discordCode = (error as any)?.code;
    if (discordCode === 10062 || discordCode === 'InteractionAlreadyReplied') {
      return;
    }
    // 40060: another bot instance already acknowledged this interaction â€” nothing to do
    if (discordCode === 40060) {
      console.warn(`[40060] Interaction ${(interaction as any)?.id} already acked by another instance â€” skipping.`);
      return;
    }
    console.error('Error while handling interaction:', error);
    if (error && (error as any).stack) console.error((error as any).stack);

    try {
      const info: any = {
        id: interaction?.id,
        type: interaction?.type,
        userId: interaction?.user?.id,
        guildId: interaction?.guildId,
        commandName: interaction?.commandName,
        customId: interaction?.customId,
      };
      console.error('Interaction info:', JSON.stringify(info));
    } catch (e) {
      console.error('Failed to serialize interaction info:', e);
    }

    if (interaction && typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
      try {
        if (interaction.replied) {
          await interaction.editReply({
            content: 'âŒ An unexpected error occurred while processing your request.',
          });
        } else {
          await interaction.reply({
            content: 'âŒ An unexpected error occurred while processing your request.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
        // Ignore if interaction already replied
        if ((replyErr as any)?.code !== 'InteractionAlreadyReplied') {
          // Try followUp as fallback
          try {
            if (interaction && typeof interaction.followUp === 'function') {
              await interaction.followUp({
                content: 'âŒ An unexpected error occurred while processing your request.',
                flags: MessageFlags.Ephemeral,
              });
            }
          } catch (followUpErr) {
            console.error('Failed to send followUp error:', followUpErr);
          }
        }
      }
    }
  }
}

function sanitizeWagerChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
}

function parseAcceptedUsers(rawValue: unknown): string[] {
  try {
    const value = JSON.parse(String(rawValue || '[]'));
    if (!Array.isArray(value)) return [];
    return value.filter(v => typeof v === 'string');
  } catch {
    return [];
  }
}

function buildWagerParticipantIds(wager: any): string[] {
  return [wager.challenger1Id, wager.challenger2Id, wager.challenged1Id, wager.challenged2Id]
    .filter((value): value is string => !!value);
}

async function createWagerTicketChannel(
  interaction: any,
  channelName: string,
  participantIds: string[],
  db: any
): Promise<any | null> {
  const discordGuild = interaction.guild;
  if (!discordGuild) return null;

  const categoryId = getSetting(db, `${interaction.guildId}_wager_category_id`) || WAGER_TICKETS_CATEGORY_ID;
  const wagerCategory = await interaction.client.channels.fetch(categoryId).catch(() => null);
  if (!wagerCategory || wagerCategory.type !== ChannelType.GuildCategory) {
    console.error(`Wager category ${categoryId} not found or invalid.`);
    return null;
  }

  const permissionOverwrites: any[] = [
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
    if (!member) continue;

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
    .catch((error: unknown) => {
      console.error('Failed to create wager ticket channel:', error);
      return null;
    });

  return channel;
}

async function unlockWagerTicketChat(interaction: any, channel: any, participantIds: string[], db: any): Promise<void> {
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
  const mentionStr = mentionRoles.map((r: string) => `<@&${r}>`).join(' ');
  await channel.send({
    content: `âœ… Wager accepted. Chat unlocked. ${mentionStr}`,
    allowedMentions: { roles: mentionRoles },
  }).catch(() => null);
}