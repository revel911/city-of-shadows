import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Events, Partials } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { handleMessage, handleRollInteraction, handleSessionControl, ROLL_BUTTON_PREFIX, ROLL_MODAL_ID } from './handlers/session.js';
import { handleSelect as handlePlaySelect, SELECT_CUSTOM_ID as PLAY_SELECT_ID } from './commands/play.js';

import { initializeArchive, captureArchiveMessage } from './handlers/archive-runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

const commandsDir = join(__dirname, 'commands');
for (const file of await readdir(commandsDir)) {
  if (!file.endsWith('.js')) continue;
  const mod = await import(`./commands/${file}`);
  if (mod.data && mod.execute) client.commands.set(mod.data.name, mod);
}

client.once(Events.ClientReady, c => {
  initializeArchive(c).catch(error => console.error(`[archive] initialization failed: ${error.message}`));
  console.log(`Ready as ${c.user.tag} — ${client.commands.size} commands loaded. revision=${process.env.APP_REVISION || 'unknown'}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('session:')) {
      await handleSessionControl(interaction);
      return;
    }
    if ((interaction.isButton() && interaction.customId.startsWith(ROLL_BUTTON_PREFIX))
        || (interaction.isModalSubmit() && interaction.customId === ROLL_MODAL_ID)) {
      await handleRollInteraction(interaction);
      return;
    }
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === PLAY_SELECT_ID) {
      await handlePlaySelect(interaction);
      return;
    }
  } catch (err) {
    const label = interaction.isChatInputCommand() ? interaction.commandName : interaction.customId;
    console.error(`[${label}]`, err);
    const reply = { content: 'Something went wrong while handling that command. Please try it once more.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

client.on(Events.MessageCreate, async message => {
  await captureArchiveMessage(message).catch(error => console.error(`[archive] capture failed: ${error.message}`));
  if (message.author.bot) return;
  if (!message.channel.isThread()) return;
  try {
    await handleMessage(message);
  } catch (err) {
    console.error('[message]', err);
    await message.channel.send('⚠️ Something went wrong while preparing that reply. Please try once more.').catch(() => {});
  }
});

client.on(Events.MessageUpdate, async (previous, message) => {
  try {
    if (!previous.partial) await captureArchiveMessage(previous);
    await captureArchiveMessage(message);
  } catch (error) { console.error(`[archive] edit capture failed: ${error.message}`); }
});
client.on(Events.MessageDelete, message => {
  captureArchiveMessage(message, 'deleted').catch(error => console.error(`[archive] deletion capture failed: ${error.message}`));
});
client.on(Events.MessageBulkDelete, messages => {
  for (const message of messages.values()) captureArchiveMessage(message, 'deleted')
    .catch(error => console.error(`[archive] deletion capture failed: ${error.message}`));
});

process.on('unhandledRejection', err => console.error('unhandledRejection:', err));

client.login(process.env.DISCORD_TOKEN);
