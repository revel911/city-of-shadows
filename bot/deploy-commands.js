import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required.');
  process.exit(1);
}

const commands = [];
const commandsDir = join(__dirname, 'commands');
for (const file of await readdir(commandsDir)) {
  if (!file.endsWith('.js')) continue;
  const mod = await import(`./commands/${file}`);
  if (mod.data) commands.push(mod.data.toJSON());
}

const rest = new REST().setToken(DISCORD_TOKEN);

const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

const scope = DISCORD_GUILD_ID ? `guild ${DISCORD_GUILD_ID}` : 'global';
const data = await rest.put(route, { body: commands });
console.log(`Registered ${data.length} commands (${scope}).`);
