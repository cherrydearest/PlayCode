# PlayCode

A Discord bot for one Roblox game studio's server. Run `/setup` once and it builds the whole server: roles, channels, permissions, a Roblox verification gate, ping-role menu and a ticket panel. After that it runs the day-to-day: bug reports, suggestions, devlogs and update posts, playtests with RSVPs, tickets and moderation.

It only works in the one server you point it at and leaves any other server it gets added to.

## What /setup builds

**Roles** (top to bottom): Studio Owner, Lead Developer, Moderator, Scripter, Builder, Modeler, UI Designer, Animator, Audio & SFX, QA Tester, Content Creator, Verified, plus four self-assign ping roles (Update, Devlog, Playtest, Event).

**Channels**

| Category | Channels | Who sees it |
|---|---|---|
| START HERE | welcome, rules, verify, roles | Everyone. #verify disappears once you're verified |
| NEWS | announcements, game-updates, devlogs, playtests | Members read, staff post |
| COMMUNITY | general, media, off-topic, suggestions, bug-reports, bot-commands | Members. Suggestions and bug reports are bot posts with discussion threads |
| SUPPORT | support (ticket panel) | Members |
| STUDIO TEAM | team-chat, tasks, scripting, building, modeling, ui-design, animation, audio, assets, playtest-notes, git-feed | Dev roles and staff |
| STAFF | staff-chat, mod-log, applications | Staff |
| VOICE | Lounge, Playtest, Dev Meeting, Staff | Members / team / staff |
| TICKETS | (ticket channels are created here) | Staff and the ticket owner |

**Panels** posted automatically: welcome guide, rules, verify button, ping-role menu, ticket buttons.

`/setup` options:

- `studio_name`: shown on the panels. Defaults to the server name.
- `verification`: `Roblox account link` (default), `Agree-to-rules button`, or `Off`.
- `preview`: show what would change without touching anything.
- `fix_permissions`: also reset permissions on channels that already existed.
- `post_panels`: post/refresh the panels (default yes).

It's safe to run again. Anything it already made is found by ID, and existing channels or roles with the same name are reused instead of duplicated. Nothing is ever deleted. The first run shows a preview with a **Build it** button before changing anything. To change names, colours or the channel list, edit `src/setup/blueprint.js`.

## Commands

| Who | Commands |
|---|---|
| Everyone | `/bug`, `/suggest`, `/roblox`, `/whois`, `/ticket close`, `/help` |
| Studio team | `/post` (devlog, sneak peek), `/playtest schedule`, `/playtest cancel` |
| Staff | `/post` (announcement, game update), `/note`, `/ticket add/remove`, status menus on bug and suggestion posts |
| Moderation | `/warn`, `/warnings`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/unban`, `/purge`, `/slowmode`, `/lock`, `/unlock` |
| Admin | `/setup`, `/panel`, `/config` |

How the main features work:

- **Roblox verification**: the member enters their username, pastes a five-word code into their Roblox profile About section and presses Check. They get the Verified role and their nickname is set to their Roblox name. Members who leave and rejoin are re-verified automatically. Word codes are used because Roblox's filter often hides random letters and numbers.
- **Bug reports and suggestions**: `/bug` and `/suggest` open a form, post to the right channel with a discussion thread, and get a number. Staff change the status from a menu on the post (Confirmed, Fixed, Planned, Denied…), and the author gets a DM when it's resolved. Suggestions have up/down vote buttons.
- **Tickets**: Get help, Report a player, Join the team (applications also copy to #applications) and Business. Each opens a private channel. Closing one saves a transcript to #mod-log and DMs a copy to the member.
- **Posts**: `/post` opens a form so line breaks work. Game updates turn each line into a bullet and ping Update Ping; devlogs ping Devlog Ping. Posts in announcement channels are auto-published to following servers.
- **Playtests**: `/playtest schedule starts_in:2h` posts a card with Going/Maybe/Can't buttons, pings Playtest Ping, reminds the Going list 15 minutes before and at start.
- **Moderation**: every action gets a case number in #mod-log and the member is DM'd when possible. Joins (with a new-account warning) and leaves are logged too.
- **Git feed**: for commit messages in #git-feed, make a webhook in that channel and add it to your GitHub repo with `/github` on the end of the URL and content type `application/json`.

## Setting it up

### 1. Create the Discord application

1. Go to https://discord.com/developers/applications and click **New Application**. Name it whatever the studio bot should be called.
2. **Bot** tab: click **Reset Token** and copy it (this is `DISCORD_TOKEN`). Turn on **Server Members Intent**.
3. **General Information**: copy the **Application ID** (this is `CLIENT_ID`).
4. Invite it with this link (put your application ID in):
   `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=8`
   Permission 8 is Administrator, which `/setup` needs to build private channels and the Studio Owner role. If you'd rather not, give it Manage Roles, Manage Channels, Manage Messages, Manage Nicknames, Moderate Members, Kick Members, Ban Members and Mention Everyone, and `/setup` will tell you what it had to leave out.
5. In Server Settings → Roles, drag the bot's role **to the top** so it can manage every role it creates.

### 2. Run it locally

Needs Node.js 18.17 or newer.

```bash
npm install
cp .env.example .env    # then fill in DISCORD_TOKEN, CLIENT_ID and GUILD_ID
npm start
```

Then type `/setup` in your server.

`npm test` runs `/setup` against a fake in-memory server to check the layout and permissions without connecting to Discord.

### 3. Host it on Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** and pick it. Railway runs `npm start` automatically.
3. Add the variables `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` (and `OWNER_IDS` if you want).
4. Add a **Volume** to the service mounted at `/data`, and set `DATA_DIR=/data`. Without a volume, warnings, verification links, ticket numbers and the setup map are lost on every redeploy.

Any host that runs Node works the same way. If the host needs an open port, set `PORT` and the bot answers health checks on it.

## Files

```
src/
  index.js              starts the bot, registers commands, routes buttons/forms
  config.js             environment variables
  setup/blueprint.js    the server layout: roles, channels, rules (edit this to customise)
  setup/runSetup.js     builds/repairs the server from the blueprint
  setup/panels.js       welcome, rules, verify, roles and ticket panels
  commands/             admin, moderation and community slash commands
  features/             verification, ping roles, tickets, bugs/suggestions, posts, playtests, join/leave
  lib/                  data store, Roblox API, shared helpers
test/mock-setup.test.js
```

Data is kept in `data/data.json`.
