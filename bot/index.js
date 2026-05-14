import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Events, Partials } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { handleMessage } from './handlers/session.js';
import { handleSelect as handlePlaySelect, SELECT_CUSTOM_ID as PLAY_SELECT_ID } from './commands/play.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();

const commandsDir = join(__dirname, 'commands');
for (const file of await readdir(commandsDir)) {
  if (!file.endsWith('.js')) continue;
  const mod = await import(`./commands/${file}`);
  if (mod.data && mod.execute) client.commands.set(mod.data.name, mod);
}

client.once(Events.ClientReady, c => {
  console.log(`Ready as ${c.user.tag} — ${client.commands.size} commands loaded.`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
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
    const reply = { content: `Error: ${err.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.channel.isThread()) return;
  try {
    await handleMessage(message);
  } catch (err) {
    console.error('[message]', err);
    await message.channel.send(`⚠️ ${err.message}`).catch(() => {});
  }
});

process.on('unhandledRejection', err => console.error('unhandledRejection:', err));

client.login(process.env.DISCORD_TOKEN);
