'use strict';
// Admin commands: /setup, /panel, /config.
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { runSetup } = require('../setup/runSetup');
const panels = require('../setup/panels');
const { ROLES, CATEGORIES } = require('../setup/blueprint');
const { embed, isAdmin, respond, clip, EPHEMERAL } = require('../lib/util');

const CHANNEL_KEYS = CATEGORIES.flatMap((c) => c.channels.map((ch) => ({ key: ch.key, name: ch.name, voice: !!ch.voice })));
const ROLE_KEYS = ROLES.map((r) => ({ key: r.key, name: r.name }));
const SETTINGS = {
  welcomeEnabled: 'Welcome messages',
  staffApplicationsOpen: 'Team applications open',
  verifyNickname: 'Set nickname to Roblox name on verify',
  autoRoleOnJoin: 'Give Verified on join (when verification is off)',
};

const list = (arr, max = 800) => (arr.length ? clip(arr.join(', '), max) : '—');

function reportEmbed(r) {
  const title = r.preview ? 'Setup preview (nothing changed)' : 'Setup finished';
  const e = embed(r.preview ? 'info' : 'ok').setTitle(title)
    .setDescription(`Studio: **${r.opts.studioName}** · Verification: **${r.opts.verification}**`)
    .addFields(
      { name: r.preview ? 'Would create roles' : 'Created roles', value: list(r.created.roles), inline: false },
      { name: r.preview ? 'Would create channels' : 'Created channels', value: list([...r.created.categories.map((c) => `📁 ${c}`), ...r.created.channels]), inline: false },
    );
  const adopted = [...r.adopted.roles.map((x) => `@${x}`), ...r.adopted.categories.map((c) => `📁 ${c}`), ...r.adopted.channels];
  if (adopted.length) e.addFields({ name: r.preview ? 'Would reuse existing' : 'Reused existing', value: list(adopted) });
  if (r.repaired.length) e.addFields({ name: 'Permissions applied to', value: list(r.repaired) });
  if (r.panels.length) e.addFields({ name: 'Panels', value: r.panels.join('\n') });
  if (r.warnings.length) e.addFields({ name: 'Heads up', value: clip(r.warnings.map((w) => `• ${w}`).join('\n'), 900) });
  if (!r.preview) e.addFields({ name: 'Next', value: '• Drag my role near the top of Server Settings → Roles so I can manage everything.\n• Give your team their roles (Scripter, Builder…).\n• Try `/help` to see everything I do.' });
  return e;
}

const setup = {
  data: new SlashCommandBuilder().setName('setup').setDescription('Build or repair the studio server: roles, channels, permissions and panels.')
    .setDefaultMemberPermissions(P.ManageGuild).setDMPermission(false)
    .addStringOption((o) => o.setName('studio_name').setDescription('Your studio name (shown in panels). Defaults to the server name.').setMaxLength(60))
    .addStringOption((o) => o.setName('verification').setDescription('How new members unlock the server (default: Roblox account link)')
      .addChoices({ name: 'Roblox account link', value: 'roblox' }, { name: 'Agree-to-rules button', value: 'button' }, { name: 'Off (everyone sees everything)', value: 'off' }))
    .addBooleanOption((o) => o.setName('preview').setDescription('Show what would change without changing anything'))
    .addBooleanOption((o) => o.setName('fix_permissions').setDescription('Also reset permissions on existing channels to the studio layout'))
    .addBooleanOption((o) => o.setName('post_panels').setDescription('Post/update the welcome, rules, verify, roles and ticket panels (default: yes)')),
  async execute(interaction, ctx) {
    if (!isAdmin(interaction.member, ctx.config)) return respond(interaction, 'Only the server owner or admins can run /setup.');
    const options = {
      studioName: interaction.options.getString('studio_name') || undefined,
      verification: interaction.options.getString('verification') || undefined,
      preview: interaction.options.getBoolean('preview') ?? false,
      fixPermissions: interaction.options.getBoolean('fix_permissions') ?? false,
      postPanels: interaction.options.getBoolean('post_panels') ?? true,
    };
    // First real run (or a permission reset) changes a lot, so confirm it.
    const firstRun = !ctx.store.get('setup', 'done');
    if (!options.preview && (firstRun || options.fixPermissions)) {
      const preview = await runSetup({ guild: interaction.guild, store: ctx.store, options: { ...options, preview: true } }).catch((e) => e);
      if (preview instanceof Error) return respond(interaction, preview.friendly ? preview.message : `Setup check failed: ${preview.message}`);
      ctx.pendingSetup.set(interaction.user.id, { options, at: Date.now() });
      return interaction.reply({
        flags: EPHEMERAL,
        embeds: [reportEmbed(preview).setFooter({ text: options.fixPermissions ? 'fix_permissions will replace permissions on existing channels.' : 'Nothing is deleted. Existing channels with matching names are reused.' })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pc:setup:go').setLabel('Build it').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('pc:setup:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        )],
      });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    return build(interaction, ctx, options);
  },
};

async function build(interaction, ctx, options) {
  let last = 0;
  const progress = (step) => {
    if (Date.now() - last < 1500) return;
    last = Date.now();
    interaction.editReply({ content: `⚙️ Setting up… ${step}`, embeds: [], components: [] }).catch(() => {});
  };
  try {
    const report = await runSetup({ guild: interaction.guild, store: ctx.store, options, progress });
    await new Promise((r) => setTimeout(r, 300));
    return interaction.editReply({ content: '', embeds: [reportEmbed(report)], components: [] });
  } catch (e) {
    console.error('[setup]', e);
    return interaction.editReply({ content: e.friendly ? `❌ ${e.message}` : `❌ Setup stopped: ${e.message}\nAnything already made is kept; fix the problem and run /setup again to finish.`, embeds: [], components: [] });
  }
}

// Confirm / cancel buttons from the /setup preview.
async function handleSetupButton(interaction, ctx) {
  const action = interaction.customId.split(':')[2];
  const pending = ctx.pendingSetup.get(interaction.user.id);
  ctx.pendingSetup.delete(interaction.user.id);
  if (action === 'cancel' || !pending) return interaction.update({ content: action === 'cancel' ? 'Cancelled. Nothing was changed.' : 'That preview expired. Run /setup again.', embeds: [], components: [] });
  if (!isAdmin(interaction.member, ctx.config)) return respond(interaction, 'Only admins can run setup.');
  await interaction.update({ content: '⚙️ Setting up…', embeds: [], components: [] });
  return build(interaction, ctx, pending.options);
}

const panel = {
  data: new SlashCommandBuilder().setName('panel').setDescription('Re-post or refresh one of the setup panels.')
    .setDefaultMemberPermissions(P.ManageGuild).setDMPermission(false)
    .addStringOption((o) => o.setName('which').setDescription('Which panel').setRequired(true)
      .addChoices({ name: 'All', value: 'all' }, ...Object.keys(panels.PANELS).map((k) => ({ name: k[0].toUpperCase() + k.slice(1), value: k }))))
    .addChannelOption((o) => o.setName('channel').setDescription('Post it here instead (moves the panel)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  async execute(interaction, ctx) {
    if (!isAdmin(interaction.member, ctx.config)) return respond(interaction, 'Only admins can do that.');
    if (!ctx.store.get('setup', 'done')) return respond(interaction, 'Run /setup first.');
    await interaction.deferReply({ flags: EPHEMERAL });
    const which = interaction.options.getString('which', true);
    const target = interaction.options.getChannel('channel');
    const keys = which === 'all' ? Object.keys(panels.PANELS) : [which];
    const done = [];
    for (const k of keys) {
      const p = panels.PANELS[k];
      if (k === 'verify' && ctx.store.get('settings', 'verification') === 'off') continue;
      if (target && which !== 'all') ctx.store.update((d) => { d.setup.channels[p.channel] = target.id; });
      const msg = await panels.postOrEdit(interaction.guild, ctx.store, k, p.channel, p.build(ctx.store, interaction.guild)).catch((e) => ({ error: e.message }));
      done.push(msg?.error ? `❌ ${k}: ${msg.error}` : msg ? `✅ ${k} → ${msg.url}` : `⚠️ ${k}: channel missing`);
    }
    return interaction.editReply(done.join('\n') || 'Nothing to post.');
  },
};

const configCmd = {
  data: new SlashCommandBuilder().setName('config').setDescription('View or change PlayCode settings.')
    .setDefaultMemberPermissions(P.ManageGuild).setDMPermission(false)
    .addSubcommand((s) => s.setName('view').setDescription('Show the current setup'))
    .addSubcommand((s) => s.setName('channel').setDescription('Point a feature at a different channel')
      .addStringOption((o) => o.setName('feature').setDescription('Which channel').setRequired(true).setAutocomplete(true))
      .addChannelOption((o) => o.setName('channel').setDescription('The channel to use').setRequired(true)))
    .addSubcommand((s) => s.setName('role').setDescription('Point a feature at a different role')
      .addStringOption((o) => o.setName('feature').setDescription('Which role').setRequired(true).setAutocomplete(true))
      .addRoleOption((o) => o.setName('role').setDescription('The role to use').setRequired(true)))
    .addSubcommand((s) => s.setName('toggle').setDescription('Turn a setting on or off')
      .addStringOption((o) => o.setName('setting').setDescription('Setting').setRequired(true).addChoices(...Object.entries(SETTINGS).map(([value, name]) => ({ name, value }))))
      .addBooleanOption((o) => o.setName('on').setDescription('On or off').setRequired(true))),
  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const q = interaction.options.getFocused().toLowerCase();
    const src = sub === 'role' ? ROLE_KEYS : CHANNEL_KEYS;
    return interaction.respond(src.filter((x) => x.name.toLowerCase().includes(q) || x.key.toLowerCase().includes(q)).slice(0, 25).map((x) => ({ name: x.name, value: x.key })));
  },
  async execute(interaction, ctx) {
    const { store } = ctx;
    if (!isAdmin(interaction.member, ctx.config)) return respond(interaction, 'Only admins can change settings.');
    const sub = interaction.options.getSubcommand();
    if (sub === 'view') {
      const s = store.get('setup');
      const ch = CHANNEL_KEYS.filter((c) => s.channels[c.key]).map((c) => `${c.name}: <#${s.channels[c.key]}>`);
      const rl = ROLE_KEYS.filter((r) => s.roles[r.key]).map((r) => `<@&${s.roles[r.key]}>`);
      const st = Object.entries(SETTINGS).map(([k, n]) => `${store.get('settings', k) === false ? '⬜' : '✅'} ${n}`);
      return respond(interaction, {
        embeds: [embed('info').setTitle(`${s.studioName || interaction.guild.name} · PlayCode`)
          .setDescription(s.done ? `Set up ${s.ranAt ? `<t:${Math.floor(new Date(s.ranAt) / 1000)}:R>` : ''} · verification: **${store.get('settings', 'verification') || 'roblox'}**` : 'Not set up yet. Run **/setup**.')
          .addFields({ name: 'Settings', value: st.join('\n') }, { name: 'Roles', value: clip(rl.join(' ') || '—', 1024) }, { name: 'Channels', value: clip(ch.join('\n') || '—', 1024) })],
        allowedMentions: { parse: [] },
      });
    }
    if (sub === 'channel') {
      const key = interaction.options.getString('feature', true);
      if (!CHANNEL_KEYS.some((c) => c.key === key)) return respond(interaction, 'Pick a channel from the list.');
      const channel = interaction.options.getChannel('channel', true);
      store.update((d) => { d.setup.channels[key] = channel.id; });
      return respond(interaction, `Done: **${CHANNEL_KEYS.find((c) => c.key === key).name}** now uses ${channel}.`);
    }
    if (sub === 'role') {
      const key = interaction.options.getString('feature', true);
      if (!ROLE_KEYS.some((r) => r.key === key)) return respond(interaction, 'Pick a role from the list.');
      const role = interaction.options.getRole('role', true);
      store.update((d) => { d.setup.roles[key] = role.id; });
      return respond(interaction, { content: `Done: **${ROLE_KEYS.find((r) => r.key === key).name}** is now ${role}.`, allowedMentions: { parse: [] } });
    }
    if (sub === 'toggle') {
      const key = interaction.options.getString('setting', true);
      const on = interaction.options.getBoolean('on', true);
      store.update((d) => { d.settings[key] = on; });
      if (key === 'staffApplicationsOpen') await panels.postOrEdit(interaction.guild, store, 'tickets', 'support', panels.ticketPanel(store)).catch(() => {});
      return respond(interaction, `${SETTINGS[key]}: **${on ? 'on' : 'off'}**`);
    }
    return null;
  },
};

module.exports = { commands: [setup, panel, configCmd], handleSetupButton };
