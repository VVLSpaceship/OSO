import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getSetting } from '../database.js';

const HOSTER_ROLE_IDS_DEFAULT = ['1470554662687215741', '1470554664238845962'];
const WAR_DODGE_LOGS_CHANNEL_ID_DEFAULT = '1473408078358642759';
const WAGER_DODGE_LOGS_CHANNEL_ID_DEFAULT = '1473407994535346177';

export const data = new SlashCommandBuilder()
  .setName('admindodge')
  .setDescription('Force dodge a war or wager ticket (Admin only)')
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Type of ticket to dodge')
      .setRequired(true)
      .addChoices(
        { name: 'War', value: 'war' },
        { name: 'Wager', value: 'wager' }
      )
  )
  .addStringOption(option =>
    option
      .setName('ticket_id')
      .setDescription('ID do canal do ticket (clique com botão direito no canal → Copiar ID)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for dodging the ticket')
      .setRequired(true)
  );

async function fetchChannel(interaction: ChatInputCommandInteraction, channelId: string) {
  // Try guild channels first (bot can see all guild channels)
  const fromGuild = interaction.guild?.channels.cache.get(channelId)
    ?? await interaction.guild?.channels.fetch(channelId).catch(() => null);
  if (fromGuild) return fromGuild;
  return interaction.client.channels.fetch(channelId).catch(() => null);
}

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: any
): Promise<void> {
  try {
    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    const isAdmin = !!member?.permissions.has('Administrator');
    const hosterRoleId = getSetting(db, `${interaction.guildId}_hoster_role_id`);
    const hasPermission = isAdmin || (!!member && (
      hosterRoleId
        ? member.roles.cache.has(hosterRoleId)
        : HOSTER_ROLE_IDS_DEFAULT.some(roleId => member.roles.cache.has(roleId))
    ));
    if (!hasPermission) {
      await interaction.editReply({ content: '❌ Você não tem permissão. Configure o cargo com `/setup hoster_role`.' });
      return;
    }

    const type = interaction.options.getString('type', true);
    const ticketId = interaction.options.getString('ticket_id', true).trim();
    const reason = interaction.options.getString('reason', true);

    if (!ticketId) {
      await interaction.editReply({ content: '❌ ID inválido.' });
      return;
    }

    if (type === 'war') {
      const war = db.prepare('SELECT * FROM Wars WHERE channelId = ?').get(ticketId);
      if (!war) {
        await interaction.editReply({ content: '❌ War ticket não encontrado. Verifique se o ID é o ID do canal Discord (clique direito no canal → Copiar ID).' });
        return;
      }

      if (war.status === 'FINISHED' || war.status === 'DODGED') {
        await interaction.editReply({ content: '❌ Este war já está encerrado.' });
        return;
      }

      // Update status using war.id (not channelId)
      db.prepare('UPDATE Wars SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', war.id);

      // Send dodge message to ticket channel then delete it
      const ticketChannel = await fetchChannel(interaction, war.channelId) as any;
      if (ticketChannel && 'send' in ticketChannel) {
        await ticketChannel.send(`⚠️ Este war foi encerrado por um admin. Motivo: **${reason}**\nCanal será deletado em 5 segundos.`).catch(() => null);
        setTimeout(async () => {
          await ticketChannel.delete(`War force dodged by admin: ${reason}`).catch((e: any) => {
            console.error('Failed to delete war channel:', e);
          });
        }, 5000);
      } else {
        console.warn(`Could not find/access war ticket channel ${war.channelId}`);
      }

      // Send to dodge log channel
      const warDodgeId = getSetting(db, `${interaction.guildId}_war_dodge_channel_id`) || WAR_DODGE_LOGS_CHANNEL_ID_DEFAULT;
      const dodgeLogChannel = await fetchChannel(interaction, warDodgeId) as any;
      if (dodgeLogChannel && 'send' in dodgeLogChannel) {
        await dodgeLogChannel.send(`⚠️ **Admin Dodge — War**\nForçado por <@${interaction.user.id}>\nMotivo: ${reason}`).catch(() => null);
      }

      await interaction.editReply({ content: `✅ War ticket encerrado por dodge com sucesso.` });

    } else if (type === 'wager') {
      const wager = db.prepare('SELECT * FROM Wagers WHERE channelId = ?').get(ticketId);
      if (!wager) {
        await interaction.editReply({ content: '❌ Wager ticket não encontrado. Verifique se o ID é o ID do canal Discord (clique direito no canal → Copiar ID).' });
        return;
      }

      if (wager.status === 'CLOSED' || wager.status === 'DODGED') {
        await interaction.editReply({ content: '❌ Este wager já está encerrado.' });
        return;
      }

      // Update status using wager.id (not channelId)
      db.prepare('UPDATE Wagers SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', wager.id);

      // Send dodge message to ticket channel then delete it
      const ticketChannel = await fetchChannel(interaction, wager.channelId) as any;
      if (ticketChannel && 'send' in ticketChannel) {
        await ticketChannel.send(`⚠️ Este wager foi encerrado por um admin. Motivo: **${reason}**\nCanal será deletado em 5 segundos.`).catch(() => null);
        setTimeout(async () => {
          await ticketChannel.delete(`Wager force dodged by admin: ${reason}`).catch((e: any) => {
            console.error('Failed to delete wager channel:', e);
          });
        }, 5000);
      } else {
        console.warn(`Could not find/access wager ticket channel ${wager.channelId}`);
      }

      // Send to dodge log channel
      const wagerDodgeId = getSetting(db, `${interaction.guildId}_wager_dodge_channel_id`) || WAGER_DODGE_LOGS_CHANNEL_ID_DEFAULT;
      const dodgeLogChannel = await fetchChannel(interaction, wagerDodgeId) as any;
      if (dodgeLogChannel && 'send' in dodgeLogChannel) {
        await dodgeLogChannel.send(`⚠️ **Admin Dodge — Wager**\nForçado por <@${interaction.user.id}>\nMotivo: ${reason}`).catch(() => null);
      }

      await interaction.editReply({ content: `✅ Wager ticket encerrado por dodge com sucesso.` });
    }

  } catch (error) {
    console.error('Error in admindodge command:', error);
    await interaction.editReply({ content: '❌ Ocorreu um erro inesperado.' });
  }
}
