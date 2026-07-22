import {
  SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder,
} from 'discord.js';
import { getMemberByDiscordId } from '../siteapi.js';
import { getSetting, createSigningRequest, getCooldown } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('sign')
  .setDescription('Sign a player to your guild')
  .addUserOption(o => o.setName('player').setDescription('The player to sign').setRequired(true))
  .addStringOption(o => o.setName('role').setDescription('Role on roster').addChoices(
    { name: 'Player', value: 'Player' },
    { name: 'Sub', value: 'Sub' },
    { name: 'Coach', value: 'Coach' },
  ).setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction, db: any): Promise<void> {

  // Check signing is globally open
  const signingClosed = getSetting(db, `${interaction.guildId}_signing_closed`) === '1';
  if (signingClosed) { await interaction.editReply('âŒ Signings are currently closed.'); return; }

  // Check if leader has a guild on site
  const leaderData = await getMemberByDiscordId(interaction.user.id);
  if (!leaderData || leaderData.role?.toLowerCase() !== 'leader') {
    await interaction.editReply('âŒ You are not registered as a guild Leader on the site. An admin must add your Discord ID to your member entry with the role "Leader".');
    return;
  }

  if (!leaderData.signing_open) {
    await interaction.editReply('âŒ Your guild has signings closed.');
    return;
  }

  const target = interaction.options.getUser('player', true);
  if (target.id === interaction.user.id) { await interaction.editReply('âŒ You cannot sign yourself.'); return; }
  if (target.bot) { await interaction.editReply('âŒ You cannot sign a bot.'); return; }

  // Check cooldown
  const cooldownDays = parseInt(getSetting(db, `${interaction.guildId}_cooldown_days`) || '0');
  if (cooldownDays > 0) {
    const cd = getCooldown(db, target.id);
    if (cd) {
      const expiresAt = new Date(cd.getTime() + cooldownDays * 24 * 60 * 60 * 1000);
      if (expiresAt > new Date()) {
        const remaining = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
        await interaction.editReply(`âŒ That player is on a ${remaining}-day signing cooldown.`);
        return;
      }
    }
  }

  // Check target not already in a guild
  const existing = await getMemberByDiscordId(target.id);
  if (existing) {
    await interaction.editReply(`âŒ ${target.username} is already in **${existing.org_name}** [${existing.tag}].`);
    return;
  }

  const role = interaction.options.getString('role') || 'Player';
  const signingId = createSigningRequest(db, {
    org_tag: leaderData.tag,
    org_id: leaderData.org_id,
    inviter_discord_id: interaction.user.id,
    target_discord_id: target.id,
    target_name: target.username,
    role,
  });

  // DM the target
  const embed = new EmbedBuilder()
    .setTitle('Guild Signing Offer')
    .setColor(0x5BADFF)
    .setDescription(`**${interaction.user.username}** (Leader of **${leaderData.org_name}** [${leaderData.tag}]) wants to sign you as **${role}**.\n\nDo you accept?`);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sign_accept_${signingId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sign_decline_${signingId}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
  );

  try {
    const dm = await target.createDM();
    await dm.send({ embeds: [embed], components: [row] });
    await interaction.editReply(`❌… Signing offer sent to **${target.username}**. Waiting for their response.`);
  } catch {
    await interaction.editReply(`âŒ Could not DM ${target.username}. They may have DMs disabled.`);
  }
}
