import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('guildclearall')
  .setDescription('Delete ALL registered guilds and their data (irreversible)');

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: any
): Promise<void> {

  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.editReply('âŒ Apenas administradores podem usar este comando.');
    return;
  }

  const count = (db.prepare('SELECT COUNT(*) as c FROM Guilds').get() as any)?.c ?? 0;

  if (count === 0) {
    await interaction.editReply('â„¹ï¸ NÃ£o hÃ¡ guilds registradas.');
    return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('guildclearall_confirm')
      .setLabel(`Sim, apagar todas as ${count} guilds`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('guildclearall_cancel')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({
    content: `âš ï¸ **Isso vai apagar permanentemente todas as ${count} guilds** e todos os seus membros, managers e rosters.\n\nTem certeza?`,
    components: [row],
  });

  const collector = interaction.channel?.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id && (i.customId === 'guildclearall_confirm' || i.customId === 'guildclearall_cancel'),
    time: 30000,
    max: 1,
  });

  collector?.on('collect', async (btn) => {
    await btn.deferUpdate().catch(() => {});

    if (btn.customId === 'guildclearall_cancel') {
      await interaction.editReply({ content: '❌… Cancelado.', components: [] });
      return;
    }

    try {
      db.prepare('DELETE FROM Managers').run();
      db.prepare('DELETE FROM MainRosters').run();
      db.prepare('DELETE FROM SubRosters').run();
      db.prepare('DELETE FROM Invites').run();
      db.prepare('DELETE FROM Wars').run();
      db.prepare('DELETE FROM Wagers').run();
      db.prepare('DELETE FROM Guilds').run();

      await interaction.editReply({ content: `❌… Todas as **${count} guilds** foram apagadas.`, components: [] });
    } catch (e) {
      console.error('Error in guildclearall:', e);
      await interaction.editReply({ content: 'âŒ Erro ao apagar as guilds.', components: [] });
    }
  });

  collector?.on('end', (collected) => {
    if (collected.size === 0) {
      interaction.editReply({ content: 'â±ï¸ Tempo esgotado. Nada foi apagado.', components: [] }).catch(() => {});
    }
  });
}
