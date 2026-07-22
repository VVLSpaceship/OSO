import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { setSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure all bot settings for this server in one command')
  // Roles
  .addRoleOption(o =>
    o.setName('staff_role')
      .setDescription('Role with full power (administration)')
      .setRequired(false))
  .addRoleOption(o =>
    o.setName('hoster_role')
      .setDescription('Hoster role')
      .setRequired(false))
  .addRoleOption(o =>
    o.setName('guild_leader_role')
      .setDescription('Guild Leader role')
      .setRequired(false))
  .addRoleOption(o =>
    o.setName('guild_co_leader_role')
      .setDescription('Guild Co-Leader role')
      .setRequired(false))
  .addRoleOption(o =>
    o.setName('guild_manager_role')
      .setDescription('Guild Manager role')
      .setRequired(false))
  .addRoleOption(o =>
    o.setName('guild_register_role')
      .setDescription('Role that can register a Guild')
      .setRequired(false))
  .addRoleOption(o =>
    o.setName('guild_delete_role')
      .setDescription('Role that can delete a Guild')
      .setRequired(false))
  // Channels
  .addChannelOption(o =>
    o.setName('ticket_category')
      .setDescription('Category where wager/war tickets will be opened')
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(false))
  .addChannelOption(o =>
    o.setName('wager_panel_channel')
      .setDescription('Channel where the Wager panel is posted')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false))
  .addChannelOption(o =>
    o.setName('war_panel_channel')
      .setDescription('Channel where the War panel is posted')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false))
  .addChannelOption(o =>
    o.setName('wager_dodge_channel')
      .setDescription('Wager dodge log channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false))
  .addChannelOption(o =>
    o.setName('war_dodge_channel')
      .setDescription('War dodge log channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false))
  .addChannelOption(o =>
    o.setName('wager_log_channel')
      .setDescription('Wager results/wins log channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false))
  .addChannelOption(o =>
    o.setName('war_log_channel')
      .setDescription('War results/wins log channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false))
  .addChannelOption(o =>
    o.setName('guild_forum_channel')
      .setDescription('Forum channel where Guilds are registered')
      .addChannelTypes(ChannelType.GuildForum)
      .setRequired(false))
  .addChannelOption(o =>
    o.setName('signing_log_channel')
      .setDescription('Admin channel where signing/removal requests go for approval')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {

  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.editReply({ content: '❌ Only administrators can use this command.', embeds: [] });
    return;
  }

  const guildId = interaction.guildId!;
  const saved: string[] = [];
  const skipped: string[] = [];

  function save(key: string, value: string | null, label: string, display: string) {
    if (value) {
      setSetting(db, `${guildId}_${key}`, value);
      saved.push(`✅ **${label}** → ${display}`);
    } else {
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

  // Ticket category (sets both wager and war category)
  const ticketCategory = interaction.options.getChannel('ticket_category');
  if (ticketCategory) {
    setSetting(db, `${guildId}_wager_category_id`, ticketCategory.id);
    setSetting(db, `${guildId}_war_category_id`, ticketCategory.id);
    saved.push(`✅ **Ticket Category** → ${ticketCategory.name}`);
  } else {
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

  if (saved.length === 0) {
    await interaction.editReply({ content: '⚠️ No settings provided. Use the command options to configure the server.', embeds: [] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Server Configuration')
    .setColor(0x2ecc71)
    .setTimestamp();

  if (saved.length > 0) {
    embed.addFields({ name: '✅ Saved settings', value: saved.join('\n') });
  }
  if (skipped.length > 0) {
    embed.addFields({ name: '— Not configured this call', value: skipped.join('\n') });
  }

  await interaction.editReply({ content: '', embeds: [embed] });
}
