import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from 'discord.js';
import { Buffer } from 'node:buffer';
import { getSetting } from '../database.js';

const FOUNDER_ROLE_ID_DEFAULT = '1470554645364478016';

function tableExists(db: any, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return !!row;
}

export const data = new SlashCommandBuilder()
  .setName('guildbackup')
  .setDescription('Exports guild system data to a JSON backup file');

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
    const isAdmin = !!actorMember?.permissions.has('Administrator');
    const staffRoleId = getSetting(db, `${interaction.guildId}_staff_role_id`) || FOUNDER_ROLE_ID_DEFAULT;
    const canBackup = isAdmin || (!!actorMember && actorMember.roles.cache.has(staffRoleId));

    if (!canBackup) {
      await interaction.editReply({
        content: '❌ Você não tem permissão. Configure o cargo com `/setup staff_role`.',
      });
      return;
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceGuildId: interaction.guildId,
      tables: {
        Guilds: tableExists(db, 'Guilds') ? db.prepare('SELECT * FROM Guilds').all() : [],
        Managers: tableExists(db, 'Managers') ? db.prepare('SELECT * FROM Managers').all() : [],
        MainRosters: tableExists(db, 'MainRosters') ? db.prepare('SELECT * FROM MainRosters').all() : [],
        SubRosters: tableExists(db, 'SubRosters') ? db.prepare('SELECT * FROM SubRosters').all() : [],
        Invites: tableExists(db, 'Invites') ? db.prepare('SELECT * FROM Invites').all() : [],
        Wars: tableExists(db, 'Wars') ? db.prepare('SELECT * FROM Wars').all() : [],
        Wagers: tableExists(db, 'Wagers') ? db.prepare('SELECT * FROM Wagers').all() : [],
      },
    };

    const json = JSON.stringify(payload, null, 2);
    const fileName = `guild-backup-${Date.now()}.json`;
    const bytes = Buffer.from(json, 'utf8');

    const attachment = new AttachmentBuilder(bytes, { name: fileName });

    await interaction.editReply({
      content: `✅ Backup generated successfully.\nGuilds: **${payload.tables.Guilds.length}** | Managers: **${payload.tables.Managers.length}** | Wars: **${payload.tables.Wars.length}** | Wagers: **${payload.tables.Wagers.length}**`,
      files: [attachment],
    });
  } catch (error) {
    console.error('Error executing /guildbackup:', error);
    await interaction.editReply({
      content: '❌ An unexpected error occurred while generating backup.',
    });
  }
}
