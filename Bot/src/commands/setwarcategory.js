import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { setSetting } from '../database.js';
export const data = new SlashCommandBuilder()
    .setName('setwarcategory')
    .setDescription('Set the category where war ticket channels are created')
    .addChannelOption(o => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true));
export async function execute(interaction, db) {
    if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.editReply('❌ Only administrators can set this.');
        return;
    }
    const ch = interaction.options.getChannel('category', true);
    setSetting(db, `${interaction.guildId}_war_category_id`, ch.id);
    await interaction.editReply(`❌… War ticket category set to **${ch.name}**.`);
}
//# sourceMappingURL=setwarcategory.js.map