'use strict';
// Verification. "roblox" mode links a Roblox account by having the member put a word code in their
// profile About section (word codes survive Roblox's chat filter; random letters often get ####'d).
// "button" mode is a simple "I agree to the rules" button.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const roblox = require('../lib/roblox');
const { embed, modLog, respond, EPHEMERAL } = require('../lib/util');

const WORDS = ['apple', 'banjo', 'cactus', 'dragon', 'ember', 'falcon', 'garden', 'harbor', 'igloo', 'jungle', 'kettle', 'lantern', 'meadow', 'nectar', 'orbit', 'pepper', 'quartz', 'river', 'sunset', 'tiger', 'umbrella', 'velvet', 'walrus', 'yellow', 'zebra', 'comet', 'pickle', 'rocket', 'maple', 'pixel', 'violet', 'cobalt', 'marble', 'thunder', 'waffle', 'canyon'];
const CODE_TTL = 30 * 60e3;

const makeCode = () => Array.from({ length: 5 }, () => WORDS[Math.floor(Math.random() * WORDS.length)]).join(' ');
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

async function grantVerified(member, store, config, rbx) {
  const roleId = store.roleId('verified');
  if (!roleId) throw Object.assign(new Error('Verification isn\'t set up yet. Ask staff to run /setup.'), { friendly: true });
  await member.roles.add(roleId, rbx ? `Verified as Roblox ${rbx.name} (${rbx.id})` : 'Agreed to rules');
  let nickNote = '';
  if (rbx) {
    const otherOwner = Object.entries(store.get('verify', 'links')).find(([d, l]) => d !== member.id && String(l.robloxId) === String(rbx.id));
    store.update((d) => {
      d.verify.links[member.id] = { robloxId: rbx.id, name: rbx.name, displayName: rbx.displayName, at: new Date().toISOString() };
      delete d.verify.pending[member.id];
    });
    if (store.get('settings', 'verifyNickname') !== false && member.manageable) {
      const nick = rbx.displayName && rbx.displayName !== rbx.name ? `${rbx.displayName} (@${rbx.name})` : rbx.name;
      await member.setNickname(nick.slice(0, 32), 'Roblox verification').catch(() => {});
    } else if (!member.manageable) nickNote = ' (I couldn\'t change your nickname because your role is above mine.)';
    await modLog(member.guild, store, { embeds: [embed('ok').setTitle('Member verified').setDescription(`${member} linked **[${rbx.name}](${roblox.profileUrl(rbx.id)})** (${rbx.id})${otherOwner ? `\n⚠️ This Roblox account is also linked to <@${otherOwner[0]}>.` : ''}`).setTimestamp()] });
  } else {
    await modLog(member.guild, store, { embeds: [embed('ok').setDescription(`${member} agreed to the rules and was verified.`).setTimestamp()] });
  }
  return nickNote;
}

function checkRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pc:verify:check').setLabel('Check').setStyle(ButtonStyle.Success).setEmoji('🔎'));
}

async function handle(interaction, { store, config }) {
  const [, , action] = interaction.customId.split(':');
  const member = interaction.member;
  const verifiedId = store.roleId('verified');
  const already = verifiedId && member.roles.cache.has(verifiedId);

  if (action === 'simple') {
    if (already) return respond(interaction, 'You\'re already verified.');
    await grantVerified(member, store, config, null);
    return respond(interaction, '✅ You\'re verified. Welcome in!');
  }

  if (action === 'start') {
    if (already && store.get('verify', 'links', member.id)) return respond(interaction, `You're already verified as **${store.get('verify', 'links', member.id).name}**. To switch accounts, press Verify again after staff remove your Verified role.`);
    const modal = new ModalBuilder().setCustomId('pc:verify:modal').setTitle('Verify with Roblox').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('username').setLabel('Your Roblox username').setPlaceholder('Builderman').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (action === 'modal') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const user = await roblox.findUser(interaction.fields.getTextInputValue('username'));
    if (!user) return interaction.editReply('I couldn\'t find that Roblox user. Check the spelling (it\'s your username, not your display name) and try again.');
    const code = makeCode();
    store.update((d) => { d.verify.pending[member.id] = { robloxId: user.id, name: user.name, displayName: user.displayName, code, at: Date.now() }; });
    const avatar = await roblox.getHeadshot(user.id);
    return interaction.editReply({
      embeds: [embed('info').setTitle(`Is this you, ${user.displayName}?`).setURL(roblox.profileUrl(user.id)).setThumbnail(avatar)
        .setDescription(`Paste this into the **About** section of your Roblox profile, save it, then press **Check**:\n\`\`\`${code}\`\`\`On roblox.com: your profile → the pencil next to About. The code works for 30 minutes and you can delete it once you're verified.`)],
      components: [checkRow()],
    });
  }

  if (action === 'check') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const pending = store.get('verify', 'pending', member.id);
    if (!pending) return interaction.editReply(already ? 'You\'re already verified.' : 'Press **Verify** first so I can give you a code.');
    if (Date.now() - pending.at > CODE_TTL) {
      store.update((d) => { delete d.verify.pending[member.id]; });
      return interaction.editReply('That code expired. Press **Verify** to get a new one.');
    }
    const profile = await roblox.getUser(pending.robloxId);
    if (!squash(profile.description).includes(squash(pending.code))) {
      return interaction.editReply({ content: `I don't see the code on **${pending.name}**'s profile yet. Make sure you saved it, wait a few seconds and press Check again.\n\`\`\`${pending.code}\`\`\``, components: [checkRow()] });
    }
    const note = await grantVerified(member, store, config, { id: profile.id, name: profile.name, displayName: profile.displayName });
    return interaction.editReply({ content: `✅ Verified as **${profile.name}**. Welcome in! You can remove the code from your profile now.${note}`, embeds: [], components: [] });
  }
  return null;
}

module.exports = { handle, grantVerified, makeCode, squash };
