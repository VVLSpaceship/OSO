import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Replies with Pong');

export async function execute(interaction, db) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Pong', flags: 64 });
    } else {
      await interaction.reply({ content: 'Pong', flags: 64 });
    }
  } catch (err) {
    console.error('Error in ping command:', err);
    try {
      if (interaction && typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
        await interaction.reply({ content: '❌ An unexpected error occurred while processing your request.', flags: 64 });
      }
    } catch (replyErr) {
      console.error('Failed to send ping fallback reply:', replyErr);
    }
  }
}
