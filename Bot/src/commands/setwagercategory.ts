import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { setSetting } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('setwagercategory')
  .setDescription('Set the category where wager ticket channels are created')
  .addChannelOption(o => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {
  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.editReply('âŒ Only administrators can set this.'); return;
  }
  const ch = interaction.options.getChannel('category', true);
  setSetting(db, `${interaction.guildId}_wager_category_id`, ch.id);
  await interaction.editReply(`❌… Wager ticket category set to **${ch.name}**.`);
}
