import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getSetting } from '../database.js';

const ALLOWED_GUILD_DELETE_ROLE_IDS_DEFAULT = [
  '1470554645364478016',
  '1470554652264108204',
  '1470554648568926219',
];
const GUILD_LEADER_ROLE_ID_DEFAULT = '1470554671944040605';
const GUILD_CO_LEADER_ROLE_ID_DEFAULT = '1470554673038496018';
const MANAGER_GUILD_ROLE_ID_DEFAULT = '1470554674435326146';

export const data = new SlashCommandBuilder()
  .setName('guilddelete')
  .setDescription('Deletes a guild from the system');

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: any
): Promise<void> {
  try {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply({
        content: 'This command can only be used in a server.',
      });
      return;
    }

    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    const isAdmin = !!member?.permissions.has('Administrator');
    const configuredDeleteRole = getSetting(db, `${guildId}_guild_delete_role_id`);
    const canManageGuild = isAdmin || (!!member && (
      configuredDeleteRole
        ? member.roles.cache.has(configuredDeleteRole)
        : ALLOWED_GUILD_DELETE_ROLE_IDS_DEFAULT.some(roleId => member.roles.cache.has(roleId))
    ));
    if (!canManageGuild) {
      await interaction.editReply({
        content: '❌ Você não tem permissão. Configure o cargo com `/setup guild_delete_role`.',
      });
      return;
    }

    // Fetch all registered guilds
    const guilds = db.prepare('SELECT * FROM Guilds ORDER BY name ASC').all();

    if (!guilds || guilds.length === 0) {
      await interaction.editReply({
        content: 'ℹ️ No registered guilds available for deletion.',
      });
      return;
    }

    const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
    const currentPage = 1;
    const menuGuilds = guilds.slice((currentPage - 1) * 25, currentPage * 25);

    const options = menuGuilds.map((guild: any) => 
      new StringSelectMenuOptionBuilder()
        .setLabel(guild.name)
        .setDescription(`Leader: ${guild.leaderId} | Region: ${guild.region}`)
        .setValue(guild.id)
        .setEmoji('🏰')
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('guild_delete_select')
      .setPlaceholder('Select a guild to delete')
      .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);

    const components: Array<ActionRowBuilder<any>> = [row];

    if (totalPages > 1) {
      const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`guild_delete_page|${currentPage - 1}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage <= 1),
        new ButtonBuilder()
          .setCustomId(`guild_delete_page|${currentPage + 1}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage >= totalPages)
      );
      components.push(pageRow);
    }

    await interaction.editReply({
      content: '🗑️ **Select a guild to delete:**',
      components,
    });

    // Collector for select menu
    const selectCollector = interaction.channel?.createMessageComponentCollector({
      filter: (i) => i.customId === 'guild_delete_select' && i.user.id === interaction.user.id,
      time: 120000, // 2 minutos
    });

    selectCollector?.on('collect', async (selectInteraction) => {
      if (!selectInteraction.isStringSelectMenu()) return;

      const selectedGuildId = selectInteraction.values[0];
      const selectedGuild = db.prepare('SELECT * FROM Guilds WHERE id = ?').get(selectedGuildId);

      if (!selectedGuild) {
        await selectInteraction.reply({
          content: '❌ Guild not found.',
          ephemeral: true,
        });
        return;
      }

      // Defer select menu response
      await selectInteraction.deferUpdate().catch(() => {});

      // Build confirmation buttons
      const confirmRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_delete_${selectedGuild.id}`)
            .setLabel('✅ Confirm Deletion')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_delete')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({
        content: `⚠️ **WARNING:** You are about to delete guild **${selectedGuild.name}**.\n\n` +
                 `This will:\n` +
                 `• Remove all members (managers, main roster, sub roster)\n` +
                 `• Delete the thread in the registered guilds channel\n` +
                 `• Remove the leader role\n` +
                 `• Permanently delete all data\n\n` +
                 `**This action is irreversible!**`,
        components: [confirmRow],
      });

      // Collector for confirmation buttons
      const confirmCollector = interaction.channel?.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id && (i.customId.startsWith('confirm_delete_') || i.customId === 'cancel_delete'),
        time: 30000, // 30 segundos
      });

      confirmCollector?.on('collect', async (confirmInteraction) => {
        if (confirmInteraction.customId === 'cancel_delete') {
          try {
            await confirmInteraction.deferUpdate().catch(() => {});
          } catch (e) {
            console.warn('Error while deferring cancel:', e);
          }
          await interaction.editReply({
            content: '✅ Deletion canceled.',
            components: [],
          });
          confirmCollector.stop();
        } else if (confirmInteraction.customId.startsWith('confirm_delete_')) {
          // Confirm first
          try {
            await confirmInteraction.deferUpdate().catch(() => {});
          } catch (e) {
            console.warn('Error while deferring confirm:', e);
          }

          try {
            const managersToCheck = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(selectedGuild.id);
            const coLeaderToCheck = selectedGuild.coLeaderId as string | null;
            const leaderToCheck = selectedGuild.leaderId as string;

            // Run DB operations efficiently
            db.prepare('DELETE FROM Wars WHERE openerGuildId = ? OR opponentGuildId = ?').run(selectedGuild.id, selectedGuild.id);
            db.prepare('DELETE FROM Managers WHERE guildId = ?').run(selectedGuild.id);
            db.prepare('DELETE FROM MainRosters WHERE guildId = ?').run(selectedGuild.id);
            db.prepare('DELETE FROM SubRosters WHERE guildId = ?').run(selectedGuild.id);
            db.prepare('DELETE FROM Invites WHERE guildId = ?').run(selectedGuild.id);
            db.prepare('DELETE FROM Guilds WHERE id = ?').run(selectedGuild.id);

            // Async operations in parallel
            const tasks = [];

            // Try deleting thread/message
            if (selectedGuild.panelChannelId && selectedGuild.panelMessageId) {
              tasks.push(
                (async () => {
                  try {
                    const directThread = await interaction.client.channels.fetch(selectedGuild.panelMessageId).catch(() => null);
                    if (directThread && 'delete' in directThread) {
                      await directThread.delete().catch(() => {});
                      return;
                    }

                    const panelChannel = await interaction.client.channels.fetch(selectedGuild.panelChannelId).catch(() => null);
                    if (!panelChannel) return;

                    if ('threads' in panelChannel && panelChannel.threads) {
                      const thread = await panelChannel.threads.fetch(selectedGuild.panelMessageId).catch(() => null);
                      if (thread) {
                        await thread.delete().catch(() => {});
                        return;
                      }
                    }

                    if ('messages' in panelChannel) {
                      const message = await panelChannel.messages.fetch(selectedGuild.panelMessageId).catch(() => null);
                      if (message) await message.delete().catch(() => {});
                    }
                  } catch (e) {
                    console.warn('Could not delete message/thread:', e);
                  }
                })()
              );
            }

            // Try removing fixed roles
            tasks.push(
              (async () => {
                try {
                  if (!interaction.guild) return;

                  const leaderRoleId = getSetting(db, `${guildId}_guild_leader_role_id`) || GUILD_LEADER_ROLE_ID_DEFAULT;
                  const coLeaderRoleId = getSetting(db, `${guildId}_guild_co_leader_role_id`) || GUILD_CO_LEADER_ROLE_ID_DEFAULT;
                  const managerRoleId = getSetting(db, `${guildId}_guild_manager_role_id`) || MANAGER_GUILD_ROLE_ID_DEFAULT;
                  const leaderRole = interaction.guild.roles.cache.get(leaderRoleId)
                    || (await interaction.guild.roles.fetch(leaderRoleId).catch(() => null));
                  const coLeaderRole = interaction.guild.roles.cache.get(coLeaderRoleId)
                    || (await interaction.guild.roles.fetch(coLeaderRoleId).catch(() => null));
                  const managerRole = interaction.guild.roles.cache.get(managerRoleId)
                    || (await interaction.guild.roles.fetch(managerRoleId).catch(() => null));

                  const leaderMember = await interaction.guild.members.fetch(leaderToCheck).catch(() => null);
                  if (leaderMember && leaderRole) await leaderMember.roles.remove(leaderRole).catch(() => {});

                  if (coLeaderToCheck) {
                    const coLeaderStillExists = db.prepare('SELECT COUNT(*) as count FROM Guilds WHERE coLeaderId = ?').get(coLeaderToCheck)?.count || 0;
                    if (coLeaderStillExists === 0) {
                      const coLeaderMember = await interaction.guild.members.fetch(coLeaderToCheck).catch(() => null);
                      if (coLeaderMember && coLeaderRole) await coLeaderMember.roles.remove(coLeaderRole).catch(() => {});
                    }
                  }

                  for (const manager of managersToCheck) {
                    const managerStillExists = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE userId = ?').get(manager.userId)?.count || 0;
                    if (managerStillExists > 0) continue;

                    const managerMember = await interaction.guild.members.fetch(manager.userId).catch(() => null);
                    if (managerMember && managerRole) await managerMember.roles.remove(managerRole).catch(() => {});
                  }
                } catch (e) {
                  console.warn('Could not remove fixed roles:', e);
                }
              })()
            );

            // Wait for all operations
            await Promise.all(tasks);

            await interaction.editReply({
              content: `✅ Guild **${selectedGuild.name}** was deleted successfully!`,
              components: [],
            });
            confirmCollector.stop();
          } catch (error) {
            console.error('Error deleting guild:', error);
            await interaction.editReply({
              content: '❌ An unexpected error occurred while processing your request.',
              components: [],
            });
            confirmCollector.stop();
          }
        }
      });

      confirmCollector?.on('end', (collected, reason) => {
        if (reason === 'time') {
          interaction.editReply({
            content: '⏱️ Time expired. Deletion canceled.',
            components: [],
          }).catch(() => {});
        }
      });

      selectCollector.stop();
    });

    selectCollector?.on('end', (collected, reason) => {
      if (reason === 'time') {
        interaction.editReply({
          content: '⏱️ Time expired. No guild was selected.',
          components: [],
        }).catch(() => {});
      }
    });

  } catch (error) {
    console.error('Error while processing guilddelete command:', error);
    await interaction.editReply({
      content: '❌ An unexpected error occurred while processing your request.',
    });
  }
}
