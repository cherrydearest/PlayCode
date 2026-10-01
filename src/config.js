'use strict';
// Environment settings. Everything the bot needs to run comes from here.
require('dotenv').config({ quiet: true });

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  // Discord user IDs that can always run admin commands (/setup, /config), even before roles exist.
  ownerIds: list(process.env.OWNER_IDS),
  // Where the bot keeps its data file. On Railway, mount a volume here so it survives redeploys.
  dataDir: process.env.DATA_DIR || './data',
  // Leave any server that isn't GUILD_ID. Set to "false" to only ignore them instead.
  leaveOtherGuilds: String(process.env.LEAVE_OTHER_GUILDS ?? 'true').toLowerCase() !== 'false',
};

function assertConfig() {
  const missing = ['token', 'clientId', 'guildId'].filter((k) => !config[k]);
  if (missing.length) {
    const names = { token: 'DISCORD_TOKEN', clientId: 'CLIENT_ID', guildId: 'GUILD_ID' };
    throw new Error(`Missing environment variables: ${missing.map((k) => names[k]).join(', ')}. Copy .env.example to .env and fill them in.`);
  }
}

module.exports = { config, assertConfig };
