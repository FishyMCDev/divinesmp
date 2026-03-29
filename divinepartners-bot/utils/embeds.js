const { EmbedBuilder } = require('discord.js');

/**
 * Build the public partner application embed posted in the partner channel.
 */
function buildPartnerEmbed(config) {
  const cfg = config.partnerEmbed;
  const embed = new EmbedBuilder()
    .setTitle(cfg.title)
    .setDescription(cfg.description)
    .setColor(cfg.color || '#5865F2')
    .setTimestamp()
    .setFooter({ text: cfg.footer || 'DivinePartners' });

  if (cfg.thumbnail) embed.setThumbnail(cfg.thumbnail);

  if (cfg.fields && cfg.fields.length > 0) {
    embed.addFields(cfg.fields.map(f => ({
      name: f.name,
      value: f.value,
      inline: f.inline || false,
    })));
  }

  return embed;
}

/**
 * Build the submission embed posted in the staff review channel.
 */
function buildSubmissionEmbed(user, answers, config, appId) {
  const embed = new EmbedBuilder()
    .setTitle('📋 New Partner Application')
    .setColor('#FEE75C')
    .setDescription(`A new partner application has been submitted and is awaiting review.`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 Applicant', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: '🆔 User ID', value: user.id, inline: true },
      { name: '📅 Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `Application ID: ${appId}` });

  // Add each question/answer as a field
  for (const question of config.questions) {
    const answer = answers[question.id];
    if (answer !== undefined) {
      embed.addFields({
        name: `❓ ${question.label}`,
        value: answer?.trim() || '_No answer provided_',
        inline: false,
      });
    }
  }

  return embed;
}

module.exports = { buildPartnerEmbed, buildSubmissionEmbed };
