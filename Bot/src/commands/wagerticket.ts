import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';

const FOUNDER_ROLE_ID = '1470554645364478016';
const WAGER_TICKET_PANEL_CHANNEL_ID = '1470554825501704345';
import { getSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('wagerticket')
  .setDescription('Publishes the Wager Ticket panel in the configured channel');

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: any
): Promise<void> {
  try {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({
        content: 'This command can only be used in a server.',
      });
      return;
    }

    const actorMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const configuredRoleId = getSetting(db, `${interaction.guildId}_wager_role_id`);
    const allowedRoleId = configuredRoleId || FOUNDER_ROLE_ID;
    const hasPermission = !!actorMember && (
      actorMember.roles.cache.has(allowedRoleId) ||
      actorMember.permissions.has('Administrator')
    );

    if (!hasPermission) {
      await interaction.editReply({
        content: '❌ You do not have permission to use this command.',
      });
      return;
    }

    const channelId = getSetting(db, `${interaction.guildId}_wager_channel_id`) || WAGER_TICKET_PANEL_CHANNEL_ID;
    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      await interaction.editReply({
        content: '❌ Wager Ticket panel channel was not found or is not a text channel.',
      });
      return;
    }

    const components = [
      new ContainerBuilder()
        .setAccentColor(0x2a8900)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('# <:deepwoken:1470975025988501515> Wager Tickets\n\nℹ️ **Use this panel to start a wager challenge.**')
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '\n\n• **1v1 Wager** — challenge a single opponent  \n' +
              '• **2v2 Wager** — team up with a friend and challenge two opponents  \n\n' +
              'A private channel will be automatically created in the configured category.'
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('🐑 **1v1 Wager**  \nCreate a solo wager.')
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Primary)
              .setLabel('Start 1v1')
              .setCustomId('c41fa0d1f1d14d3db74f8dc6ad590316')
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('🐑 **2v2 Wager**  \nTeam up with a friend.')
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Secondary)
              .setLabel('Start 2v2')
              .setCustomId('558e24f85ff142e69f7e05320a41c6bf')
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('Wager System')
        ),
    ];

    await channel.send({
      flags: MessageFlags.IsComponentsV2,
      components,
    });

    await interaction.editReply({
      content: `✅ Wager Ticket panel sent in <#${WAGER_TICKET_PANEL_CHANNEL_ID}>.`,
    });
  } catch (error) {
    console.error('Error executing /wagerticket:', error);
    await interaction.editReply({
      content: '❌ An unexpected error occurred while sending the Wager Ticket panel.',
    });
  }
}
