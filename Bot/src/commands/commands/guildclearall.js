import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { deleteOrg } from '../siteapi.js';

export const data = new SlashCommandBuilder()
    .setName('guildclearall')
    .setDescription('Delete ALL registered guilds from the bot, site, and Discord (irreversible)');

export async function execute(interaction, db) {
    if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.editReply('❌ Only administrators can use this command.');
        return;
    }
    const count = db.prepare('SELECT COUNT(*) as c FROM Guilds').get()?.c ?? 0;
    if (count === 0) {
        await interaction.editReply('ℹ️ There are no registered guilds to delete.');
        return;
    }
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('guildclearall_confirm')
            .setLabel(`Yes, delete all ${count} guilds`)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('guildclearall_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );
    await interaction.editReply({
        content: `⚠️ **This will permanently delete all ${count} guilds** — their rosters, managers, invites, and site/Discord data.\n\nAre you sure?`,
        components: [row],
    });
    const collector = interaction.channel?.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id && (i.customId === 'guildclearall_confirm' || i.customId === 'guildclearall_cancel'),
        time: 30000,
        max: 1,
    });
    collector?.on('collect', async (btn) => {
        await btn.deferUpdate().catch(() => { });
        if (btn.customId === 'guildclearall_cancel') {
            await interaction.editReply({ content: '❌ Cancelled. No guilds were deleted.', components: [] });
            return;
        }
        try {
            // Collect guild data before wiping so we can clean up site + Discord
            const guilds = db.prepare('SELECT id, name, tag, site_org_id, panelMessageId, panelChannelId FROM Guilds').all();

            // Delete all local DB records
            db.prepare('DELETE FROM Managers').run();
            db.prepare('DELETE FROM MainRosters').run();
            db.prepare('DELETE FROM SubRosters').run();
            db.prepare('DELETE FROM Invites').run();
            db.prepare('DELETE FROM Wars').run();
            db.prepare('DELETE FROM Wagers').run();
            db.prepare('DELETE FROM Guilds').run();

            // Delete each org from the site
            let siteDeleted = 0;
            for (const g of guilds) {
                if (g.tag) {
                    try {
                        await deleteOrg(g.tag);
                        siteDeleted++;
                    } catch (e) {
                        console.warn(`Failed to delete org [${g.tag}] from site:`, e?.message);
                    }
                }
            }

            // Delete guild forum threads/panel messages
            if (interaction.guild) {
                for (const g of guilds) {
                    if (!g.panelMessageId) continue;
                    try {
                        const directThread = await interaction.client.channels.fetch(g.panelMessageId).catch(() => null);
                        if (directThread && 'delete' in directThread) {
                            await directThread.delete().catch(() => { });
                            continue;
                        }
                        if (g.panelChannelId) {
                            const panelChannel = await interaction.client.channels.fetch(g.panelChannelId).catch(() => null);
                            if (panelChannel && 'threads' in panelChannel && panelChannel.threads) {
                                const thread = await panelChannel.threads.fetch(g.panelMessageId).catch(() => null);
                                if (thread) { await thread.delete().catch(() => { }); continue; }
                            }
                            if (panelChannel && 'messages' in panelChannel) {
                                const msg = await panelChannel.messages.fetch(g.panelMessageId).catch(() => null);
                                if (msg) await msg.delete().catch(() => { });
                            }
                        }
                    } catch { /* ignore */ }
                }
            }

            // Delete guild name Discord roles
            if (interaction.guild) {
                for (const g of guilds) {
                    if (!g.name) continue;
                    try {
                        const nameRole = interaction.guild.roles.cache.find(r => r.name === g.name);
                        if (nameRole) await nameRole.delete('VVLeague: guildclearall').catch(() => { });
                    } catch { /* ignore */ }
                }
            }

            await interaction.editReply({
                content: `✅ All **${count} guilds** have been deleted (${siteDeleted} removed from site).`,
                components: [],
            });
        } catch (e) {
            console.error('Error in guildclearall:', e);
            await interaction.editReply({ content: '❌ An error occurred while deleting guilds.', components: [] });
        }
    });
    collector?.on('end', (collected) => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏳ Timed out. Nothing was deleted.', components: [] }).catch(() => { });
        }
    });
}
//# sourceMappingURL=guildclearall.js.map
