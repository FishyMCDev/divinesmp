const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
require('dotenv').config();

/**
 * KEEP-ALIVE SERVER LOGIC
 * This must run immediately so Render detects an active web service.
 */
function startKeepAlive() {
    const PORT = process.env.PORT || 3000;

    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('DivinePartners bot is alive ✅');
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 Keep-alive server running on port ${PORT}`);
    });
}

// Start the server
startKeepAlive();

/**
 * DISCORD BOT LOGIC
 */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

client.commands = new Collection();
client.config = require('./config.json');

// Load commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
            console.log(`📌 Loaded command: ${command.data.name}`);
        }
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`🎧 Loaded event: ${event.name}`);
    }
}

// Graceful crash logging
process.on('unhandledRejection', err => {
    console.error('[Unhandled Rejection]', err);
});

process.on('uncaughtException', err => {
    console.error('[Uncaught Exception]', err);
});

// Login
client.login(process.env.BOT_TOKEN);