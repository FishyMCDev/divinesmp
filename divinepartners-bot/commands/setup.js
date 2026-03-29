const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { buildPartnerEmbed } = require('../utils/embeds');
const { hasAdminRole } = require('../utils/permissions');

const CONFIG_PATH = path.join(__dirname, '../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the DivinePartners bot by selecting your existing channels.')
    .addChannelOption(opt =>
      opt
        .setName('panel_channel')
        .setDescription('The existing channel where the partner application panel will be posted.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt
        .setName('submissions_channel')
        .setDescription('The existing channel where staff will receive and review partner applications.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    if (!hasAdminRole(interaction.member, client.config)) {
      return interaction.reply({
        content: '❌ You need an admin role to run `/setup`.',
        ephemeral: true,
      });
    }

    const panelChannel = interaction.options.getChannel('panel_channel');
    const submissionsChannel = interaction.options.getChannel('submissions_channel');

    if (panelChannel.id === submissionsChannel.id) {
      return interaction.reply({
        content: '❌ The panel channel and submissions channel cannot be the same channel.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Write channel IDs to config.json
    const config = client.config;
    config.partnerChannelId = panelChannel.id;
    config.submissionChannelId = submissionsChannel.id;
    client.config = config;

    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Setup] Failed to write config.json:', err);
      return interaction.editReply({
        content: '❌ Could not save channel IDs to config. Check that the bot has write access to its directory.',
      });
    }

    // Clear old bot messages in the panel channel to avoid duplicate panels
    try {
      const existing = await panelChannel.messages.fetch({ limit: 20 });
      const botMessages = existing.filter(m => m.author.id === client.user.id);
      for (const [, msg] of botMessages) await msg.delete().catch(() => {});
    } catch (_) {}

    // Post the application panel embed
    const embed = buildPartnerEmbed(config);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_partner_application')
        .setLabel('📋 Apply for Partnership')
        .setStyle(ButtonStyle.Primary)
    );

    try {
      await panelChannel.send({ embeds: [embed], components: [row] });
    } catch {
      return interaction.editReply({
        content: `❌ I could not send a message in <#${panelChannel.id}>. Please make sure I have **Send Messages** and **Embed Links** permissions in that channel.`,
      });
    }

    await interaction.editReply({
      content:
        `✅ **Setup complete!**\n\n` +
        `📋 **Panel channel:** <#${panelChannel.id}> — the application embed has been posted.\n` +
        `📬 **Submissions channel:** <#${submissionsChannel.id}> — partner applications will appear here.\n\n` +
        `Make sure I have **Send Messages**, **Embed Links**, **Create Threads**, and **Manage Threads** permissions in <#${submissionsChannel.id}>.`,
    });
  },
};
