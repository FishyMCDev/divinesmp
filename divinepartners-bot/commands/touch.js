const { SlashCommandBuilder } = require('discord.js');
const { canTouch } = require('../utils/permissions');

// Parse time range string like "1h", "30m", "2d", "1w" into milliseconds
function parseTimeRange(str) {
  const units = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  const match = str.trim().toLowerCase().match(/^(\d+)(m|h|d|w)$/);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  if (amount <= 0) return null;
  return amount * units[unit];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('touch')
    .setDescription('Delete messages from a user in this channel within a time range.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user whose messages to delete')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('time_range')
        .setDescription('How far back to delete — e.g. 30m, 2h, 1d, 1w (max 2 weeks)')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    if (!canTouch(interaction.member, client.config)) {
      return interaction.reply({
        content: '❌ You need **Ban Members** permission or an admin role to use this command.',
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const timeStr = interaction.options.getString('time_range');
    const rangeMs = parseTimeRange(timeStr);

    if (!rangeMs) {
      return interaction.reply({
        content: '❌ Invalid time range. Use a format like `30m`, `2h`, `1d`, or `1w`.',
        ephemeral: true,
      });
    }

    // Discord bulk delete only works for messages under 14 days old — cap there
    const maxMs = 14 * 24 * 60 * 60 * 1000;
    const effectiveRange = Math.min(rangeMs, maxMs);
    const cutoff = Date.now() - effectiveRange;

    const channel = interaction.channel;
    await interaction.deferReply();

    let deleted = 0;
    let lastId = null;
    let keepFetching = true;

    while (keepFetching) {
      const fetchOptions = { limit: 100 };
      if (lastId) fetchOptions.before = lastId;

      let messages;
      try {
        messages = await channel.messages.fetch(fetchOptions);
      } catch {
        break;
      }

      if (messages.size === 0) break;

      // Stop fetching once messages are older than our cutoff
      const oldest = messages.last();
      if (oldest.createdTimestamp < cutoff) keepFetching = false;

      // Filter to this user's messages within the time window
      const toDelete = messages.filter(
        m => m.author.id === target.id && m.createdTimestamp >= cutoff
      );

      if (toDelete.size > 1) {
        try {
          const result = await channel.bulkDelete(toDelete, true);
          deleted += result.size;
        } catch (err) {
          // bulkDelete fails if any message is >14 days — fall back to individual
          for (const [, msg] of toDelete) {
            try { await msg.delete(); deleted++; } catch (_) {}
          }
        }
      } else if (toDelete.size === 1) {
        try { await toDelete.first().delete(); deleted++; } catch (_) {}
      }

      lastId = messages.last().id;
      if (messages.size < 100) break;
    }

    const rangeLabel = timeStr.toLowerCase();
    await interaction.editReply({
      content: `👆 **${target.username}** has been touched! *(${deleted} message${deleted !== 1 ? 's' : ''} deleted from the last **${rangeLabel}**)*`,
    });
  },
};
