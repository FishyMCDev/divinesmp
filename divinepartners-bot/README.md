# DivinePartners Bot

A fully-featured Discord partner application bot for the Divine server.

---

## Features

- 📋 Partner application embed auto-posted by `/setup`
- ❓ Fully configurable questions (1–25, paginated 5 per modal)
- 📬 Submissions posted to a private staff channel with all applicant info
- ✅ Accept / ❌ Deny buttons (role-restricted)
- 🔔 6 ping configuration options on accept
- 🧵 Thread created on the submission message with applicant notified
- 👆 `/touch @user` — deletes all their messages in the channel (Admin / Ban Members only)
- `/setup` — auto-creates both channels and posts the panel

---

## Quick Start

### 1. Create a Discord bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → give it a name
3. Go to **Bot** tab → click **Reset Token** → copy the token
4. Enable these **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
5. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Administrator` (easiest) or individually: Send Messages, Manage Messages, Read Message History, Embed Links, Create Public Threads, Manage Threads, View Channel
6. Open the generated URL and invite the bot to your server

### 2. Configure `config.json`

Open `config.json` and fill in:

```json
{
  "partnerChannelId": "auto-set by /setup",
  "submissionChannelId": "auto-set by /setup",
  "divineGuildId": "YOUR SERVER ID (right-click server → Copy ID)",
  "allowedReviewerRoleIds": ["ROLE ID of staff who can accept/deny"],
  "adminRoleIds": ["ROLE ID of admins"],
  ...
}
```

You can customise the embed appearance and questions freely. See the **Questions** section below.

### 3. Set your bot token

Copy `.env.example` to `.env`:
```
BOT_TOKEN=paste_your_token_here
```

### 4. Install and run locally

```bash
npm install
npm start
```

### 5. Run `/setup` in Discord

Type `/setup` in any channel. The bot will:
- Create `📋┃partner-apply` (or use the channel you pass in)
- Create `📬┃partner-submissions` (staff-only, or use the channel you pass in)
- Post the application panel embed
- Save channel IDs to `config.json` automatically

---

## Configuring Questions

Edit the `questions` array in `config.json`. You can have 1–25 questions (auto-paginated 5 per page).

```json
{
  "id": "unique_snake_case_id",
  "label": "The question shown in the modal (max 45 chars)",
  "placeholder": "Hint text shown in the text box (optional)",
  "style": "SHORT",        // or "PARAGRAPH" for multi-line
  "required": true,
  "maxLength": 500
}
```

After editing questions, simply restart the bot and run `/setup` again.

---

## Commands

| Command | Description | Who can use |
|---|---|---|
| `/setup` | Creates channels + posts partner panel | Admin roles |
| `/touch @user` | Deletes all their messages in current channel | Admin or Ban Members perm |

---

## Deploying Free on Render.com + UptimeRobot

> Render's **free Web Service** sleeps after 15 minutes of no HTTP traffic.
> **UptimeRobot** pings it every 5 minutes for free — keeping it awake 24/7.
> This combination = 100% uptime, 100% free, no credit card needed.

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
```

Go to [github.com](https://github.com) → New repository → follow the instructions to push.

> ⚠️ Make sure `.env` is in your `.gitignore` (it already is) — never commit your bot token!

### Step 2 — Deploy on Render

1. Go to [render.com](https://render.com) → sign up free (no credit card)
2. Click **New +** → **Web Service**
3. Connect your GitHub account and select your repo
4. Fill in:
   - **Name:** `divinepartners-bot`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** `Free`
5. Under **Environment Variables**, add:
   - `BOT_TOKEN` → paste your bot token
6. Click **Create Web Service**

Render will build and deploy. Copy the URL it gives you — looks like:
`https://divinepartners-bot.onrender.com`

### Step 3 — Set up UptimeRobot (keeps it awake forever)

1. Go to [uptimerobot.com](https://uptimerobot.com) → sign up free
2. Click **Add New Monitor**
3. Settings:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** DivinePartners Bot
   - **URL:** `https://divinepartners-bot.onrender.com` (your Render URL)
   - **Monitoring Interval:** Every **5 minutes**
4. Click **Create Monitor**

That's it — UptimeRobot pings your bot every 5 minutes, Render never spins it down. ✅

### Auto-deploys

Every time you `git push` to GitHub, Render redeploys automatically.

---

## File Structure

```
divinepartners-bot/
├── index.js                    # Entry point + HTTP keepalive
├── config.json                 # All configuration (auto-updated by /setup)
├── package.json
├── render.yaml                 # Render deployment config
├── .env                        # Your secret token (never commit!)
├── .env.example
├── .gitignore
├── commands/
│   ├── setup.js                # /setup — creates channels + posts panel
│   └── touch.js                # /touch — delete user messages
├── events/
│   ├── ready.js                # On startup — registers slash commands
│   └── interactionCreate.js    # All button/modal/select logic
└── utils/
    ├── embeds.js               # Embed builders
    ├── keepAlive.js            # HTTP server for UptimeRobot
    └── permissions.js          # Role/permission checks
```

---

## Data Storage

Everything is stored in `config.json` on disk — no database needed. This is 100% free and zero-setup. The `/setup` command writes channel IDs back to the file automatically.

If you later want to store application history, the easiest free upgrade is [Supabase](https://supabase.com) (free PostgreSQL, no credit card).
