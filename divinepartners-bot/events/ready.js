const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Register slash commands
    try {
      const commands = [...client.commands.values()].map(c => c.data.toJSON());
      await client.application.commands.set(commands);
      console.log(`📝 Registered ${commands.length} slash command(s).`);
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }
  },
};
