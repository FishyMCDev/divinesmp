const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const { buildPartnerEmbed, buildSubmissionEmbed } = require('../utils/embeds');
const { hasReviewerRole } = require('../utils/permissions');

// In-memory store for modal answers keyed by userId
const pendingApplications = new Map();

// Tracks users with an open (unresolved) application: userId -> appId
const activeApplications = new Map();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    const config = client.config;

    // ─── Slash Commands ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error('[Command Error]', err);
        const msg = { content: '❌ An error occurred running that command.', ephemeral: true };
        try {
          interaction.replied || interaction.deferred
            ? await interaction.followUp(msg)
            : await interaction.reply(msg);
        } catch (_) {}
      }
      return;
    }

    // ─── Button: Open Application ─────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'open_partner_application') {
      // Block if user already has an open application
      if (activeApplications.has(interaction.user.id)) {
        return interaction.reply({
          content: '⚠️ You already have an open partner application. Please wait for it to be reviewed before applying again.',
          ephemeral: true,
        });
      }
      await showApplicationModal(interaction, config, 0);
      return;
    }

    // ─── Button: Next Modal Page ──────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('partner_next_')) {
      const pageIndex = parseInt(interaction.customId.split('_').pop(), 10);
      await showApplicationModal(interaction, config, pageIndex);
      return;
    }

    // ─── Modal Submit: Application ────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('partner_modal_')) {
      await handleModalSubmit(interaction, client, config);
      return;
    }

    // ─── Button: Accept ───────────────────────────────────────────────────────
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('accept_app_') &&
      !interaction.customId.endsWith('_done')
    ) {
      if (!hasReviewerRole(interaction.member, config)) {
        return interaction.reply({
          content: '❌ You do not have permission to accept applications.',
          ephemeral: true,
        });
      }
      const appId = interaction.customId.slice('accept_app_'.length);
      await showAcceptOptions(interaction, appId);
      return;
    }

    // ─── Button: Deny ─────────────────────────────────────────────────────────
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('deny_app_') &&
      !interaction.customId.endsWith('_done')
    ) {
      if (!hasReviewerRole(interaction.member, config)) {
        return interaction.reply({
          content: '❌ You do not have permission to deny applications.',
          ephemeral: true,
        });
      }
      const appId = interaction.customId.slice('deny_app_'.length);
      await showDenyModal(interaction, appId);
      return;
    }

    // ─── Button: Discuss ──────────────────────────────────────────────────────
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('discuss_app_') &&
      !interaction.customId.endsWith('_done')
    ) {
      if (!hasReviewerRole(interaction.member, config)) {
        return interaction.reply({
          content: '❌ You do not have permission to use this.',
          ephemeral: true,
        });
      }
      const appId = interaction.customId.slice('discuss_app_'.length);
      await handleDiscuss(interaction, client, appId);
      return;
    }

    // ─── StringSelect: Accept Option ─────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('accept_option_')) {
      await handleAcceptOption(interaction, client, config);
      return;
    }

    // ─── Modal Submit: Deny Reason ────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('deny_modal_')) {
      await handleDenySubmit(interaction, client, config);
      return;
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Show modal — up to 5 questions per page (Discord hard limit)
// ─────────────────────────────────────────────────────────────────────────────
async function showApplicationModal(interaction, config, pageIndex) {
  const questions = config.questions;
  const pageSize = 5;
  const start = pageIndex * pageSize;
  const pageQuestions = questions.slice(start, start + pageSize);
  if (pageQuestions.length === 0) return;

  const totalPages = Math.ceil(questions.length / pageSize);
  const modal = new ModalBuilder()
    .setCustomId(`partner_modal_${pageIndex}`)
    .setTitle(
      totalPages > 1
        ? `Partner Application (${pageIndex + 1}/${totalPages})`
        : 'Partner Application'
    );

  for (const q of pageQuestions) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label.slice(0, 45))
      .setPlaceholder((q.placeholder || '').slice(0, 100))
      .setStyle(q.style === 'PARAGRAPH' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required !== false)
      .setMaxLength(q.maxLength || 1024);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  await interaction.showModal(modal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle modal submit — paginate then post submission
// ─────────────────────────────────────────────────────────────────────────────
async function handleModalSubmit(interaction, client, config) {
  const pageIndex = parseInt(interaction.customId.split('_').pop(), 10);
  const questions = config.questions;
  const pageSize = 5;
  const totalPages = Math.ceil(questions.length / pageSize);

  // Collect this page's answers
  const existing = pendingApplications.get(interaction.user.id) || {};
  for (const q of questions.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)) {
    try {
      existing[q.id] = interaction.fields.getTextInputValue(q.id);
    } catch (_) {}
  }
  pendingApplications.set(interaction.user.id, existing);

  const nextPage = pageIndex + 1;

  // More pages to show
  if (nextPage < totalPages) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`partner_next_${nextPage}`)
        .setLabel(`Continue → Page ${nextPage + 1}`)
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({
      content: `✅ Page ${pageIndex + 1} saved! Click below to continue.`,
      components: [row],
      ephemeral: true,
    });
    return;
  }

  // All pages done — post submission
  await interaction.deferReply({ ephemeral: true });

  const answers = pendingApplications.get(interaction.user.id) || {};
  pendingApplications.delete(interaction.user.id);

  const freshConfig = reloadConfig();
  const submissionChannelId = freshConfig.submissionChannelId || config.submissionChannelId;

  if (!submissionChannelId || submissionChannelId === 'YOUR_SUBMISSION_CHANNEL_ID') {
    return interaction.editReply({
      content: '❌ The submission channel has not been configured. Please ask an admin to run `/setup`.',
    });
  }

  let submissionChannel;
  try {
    submissionChannel = await client.channels.fetch(submissionChannelId);
  } catch {
    return interaction.editReply({
      content: '❌ Could not find the submission channel. Ask an admin to run `/setup` again.',
    });
  }

  const appId = `${interaction.user.id}_${Date.now()}`;

  // Register this user as having an active application
  activeApplications.set(interaction.user.id, appId);

  const embed = buildSubmissionEmbed(interaction.user, answers, freshConfig, appId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_app_${appId}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`deny_app_${appId}`)
      .setLabel('❌ Deny')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`discuss_app_${appId}`)
      .setLabel('💬 Discuss')
      .setStyle(ButtonStyle.Secondary)
  );

  await submissionChannel.send({ embeds: [embed], components: [row] });

  await interaction.editReply({
    content: '🎉 Your partner application has been submitted! Our team will review it and get back to you soon.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Show accept ping options dropdown
// ─────────────────────────────────────────────────────────────────────────────
async function showAcceptOptions(interaction, appId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`accept_option_${appId}`)
    .setPlaceholder('Choose ping configuration...')
    .addOptions([
      { label: '@everyone ping in their server only',          value: 'their_everyone',              emoji: '📢' },
      { label: '@here ping in their server only',              value: 'their_here',                  emoji: '📣' },
      { label: '@here in Divine + @everyone in their server', value: 'divine_here__their_everyone', emoji: '🔔' },
      { label: '@here ping in both servers',                   value: 'both_here',                   emoji: '🔈' },
      { label: '@everyone ping in both servers',               value: 'both_everyone',               emoji: '📯' },
      { label: '@everyone in Divine + @here in their server', value: 'divine_everyone__their_here', emoji: '🔊' },
    ]);

  await interaction.reply({
    content: '**Select the ping configuration for this partnership:**',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle accept option selected
// ─────────────────────────────────────────────────────────────────────────────
async function handleAcceptOption(interaction, client, config) {
  await interaction.deferUpdate();

  const appId = interaction.customId.slice('accept_option_'.length);
  const choice = interaction.values[0];
  const applicantId = appId.split('_')[0];

  let applicant = null;
  try {
    applicant = await client.users.fetch(applicantId);
  } catch (_) {}

  const pingText = buildPingText(choice);
  const submissionMsg = await findSubmissionMessage(interaction.channel, appId);

  // Remove from active applications — they can apply again
  activeApplications.delete(applicantId);

  if (submissionMsg) {
    await submissionMsg.edit({
      components: [buildDisabledRow('✅ Accepted', '❌ Deny', '💬 Discuss', true, false)],
    }).catch(() => {});

    let thread = submissionMsg.thread || null;
    if (!thread) {
      try {
        thread = await submissionMsg.startThread({
          name: `✅ Accepted — ${applicant?.username || applicantId}`,
          autoArchiveDuration: 1440,
        });
      } catch (err) {
        console.error('[Accept Thread Error]', err);
      }
    }

    if (thread) {
      if (applicant) await thread.members.add(applicant.id).catch(() => {});

      const freshConfig = reloadConfig();
      const customMessage = freshConfig.acceptMessage || config.acceptMessage || 'Thank you for partnering with DivineSMP.';

      const acceptEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🎉 Partner Application — Accepted!')
        .setDescription(
          `Your partner application has been: **[Accepted]** ✅\n\n` +
          `**Next Steps:**\n${pingText}\n\n` +
          customMessage
        )
        .setTimestamp()
        .setFooter({ text: `Accepted by ${interaction.user.username}` });

      await thread.send({
        content: applicant ? `<@${applicant.id}>` : '',
        embeds: [acceptEmbed],
      });
    }
  }

  await interaction.editReply({ content: `✅ Application accepted!`, components: [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// Show deny reason modal
// ─────────────────────────────────────────────────────────────────────────────
async function showDenyModal(interaction, appId) {
  const modal = new ModalBuilder()
    .setCustomId(`deny_modal_${appId}`)
    .setTitle('Deny Partner Application');

  const reasonInput = new TextInputBuilder()
    .setCustomId('deny_reason')
    .setLabel('Reason for Denial')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Provide a clear reason so the applicant knows what to improve...')
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle deny modal submission
// ─────────────────────────────────────────────────────────────────────────────
async function handleDenySubmit(interaction, client, config) {
  await interaction.deferReply({ ephemeral: true });

  const appId = interaction.customId.slice('deny_modal_'.length);
  const reason = interaction.fields.getTextInputValue('deny_reason');
  const applicantId = appId.split('_')[0];

  let applicant = null;
  try {
    applicant = await client.users.fetch(applicantId);
  } catch (_) {}

  // Remove from active applications — they can apply again
  activeApplications.delete(applicantId);

  const submissionMsg = await findSubmissionMessage(interaction.channel, appId);

  if (submissionMsg) {
    await submissionMsg.edit({
      components: [buildDisabledRow('✅ Accept', '❌ Denied', '💬 Discuss', false, true)],
    }).catch(() => {});

    // Create a thread for internal record
    let thread = submissionMsg.thread || null;
    if (!thread) {
      try {
        thread = await submissionMsg.startThread({
          name: `❌ Denied — ${applicant?.username || applicantId}`,
          autoArchiveDuration: 1440,
        });
      } catch (err) {
        console.error('[Deny Thread Error]', err);
      }
    }

    if (thread) {
      await thread.send({
        content: `Application denied by ${interaction.user.username}. Reason: ${reason}`,
      });
    }
  }

  // Send denial via DM to the applicant
  if (applicant) {
    const denyEmbed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('❌ Partner Application — Denied')
      .setDescription(
        `Your partner application to **DivineSMP** has been: **[Denied]** ❌\n\n` +
        `**Reason:**\n> ${reason}\n\n` +
        `You're welcome to apply again once the above has been addressed.`
      )
      .setTimestamp()
      .setFooter({ text: `Denied by ${interaction.user.username}` });

    try {
      await applicant.send({ embeds: [denyEmbed] });
    } catch {
      // DMs closed — silently fail, staff thread still has the record
      console.warn(`[Deny] Could not DM ${applicant.username} — DMs may be closed.`);
    }
  }

  await interaction.editReply({
    content: `❌ Application denied. The applicant has been notified via DM.`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle discuss button — opens/finds thread, pings both parties
// ─────────────────────────────────────────────────────────────────────────────
async function handleDiscuss(interaction, client, appId) {
  await interaction.deferReply({ ephemeral: true });

  const applicantId = appId.split('_')[0];

  let applicant = null;
  try {
    applicant = await client.users.fetch(applicantId);
  } catch (_) {}

  const submissionMsg = await findSubmissionMessage(interaction.channel, appId);

  if (!submissionMsg) {
    return interaction.editReply({ content: '❌ Could not find the original application message.' });
  }

  // Open thread if it doesn't exist yet
  let thread = submissionMsg.thread || null;
  if (!thread) {
    try {
      thread = await submissionMsg.startThread({
        name: `💬 Discussion — ${applicant?.username || applicantId}`,
        autoArchiveDuration: 1440,
      });
    } catch (err) {
      console.error('[Discuss Thread Error]', err);
      return interaction.editReply({ content: '❌ Could not create a discussion thread.' });
    }
  }

  // Add both members to thread
  if (applicant) await thread.members.add(applicant.id).catch(() => {});
  await thread.members.add(interaction.user.id).catch(() => {});

  // Ping both in the thread
  await thread.send({
    content:
      `<@${interaction.user.id}> wants to speak with ${applicant ? `<@${applicant.id}>` : `<@${applicantId}>`} regarding their Partnership application.`,
  });

  await interaction.editReply({
    content: `💬 Discussion thread opened: ${thread.url}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: find submission message by appId in button customIds
// ─────────────────────────────────────────────────────────────────────────────
async function findSubmissionMessage(channel, appId) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    return (
      messages.find(m =>
        m.components?.some(row =>
          row.components?.some(c => c.customId?.includes(appId))
        )
      ) || null
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build disabled button row after accept/deny
// ─────────────────────────────────────────────────────────────────────────────
function buildDisabledRow(acceptLabel, denyLabel, discussLabel, accepted, denied) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accept_done')
      .setLabel(acceptLabel)
      .setStyle(accepted ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('deny_done')
      .setLabel(denyLabel)
      .setStyle(denied ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('discuss_done')
      .setLabel(discussLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: reload config.json from disk
// ─────────────────────────────────────────────────────────────────────────────
function reloadConfig() {
  try {
    delete require.cache[require.resolve('../config.json')];
    return require('../config.json');
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: ping instruction string
// ─────────────────────────────────────────────────────────────────────────────
function buildPingText(choice) {
  const map = {
    their_everyone:              '📢 You must ping **@everyone** in your server.',
    their_here:                  '📣 You must ping **@here** in your server.',
    divine_here__their_everyone: '🔔 You must ping **@everyone** in your server, and we will ping **@here** in Divine.',
    both_here:                   '🔈 You must ping **@here** in your server, and we will ping **@here** in Divine.',
    both_everyone:               '📯 You must ping **@everyone** in your server, and we will ping **@everyone** in Divine.',
    divine_everyone__their_here: '🔊 You must ping **@here** in your server, and we will ping **@everyone** in Divine.',
  };
  return map[choice] || 'Please coordinate the ping with the admin team.';
}
