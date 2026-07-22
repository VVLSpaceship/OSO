import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

export async function registerCommands(token: string, clientId: string): Promise<void> {
  const commands: any[] = [];
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js') && !file.endsWith('.map'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
      const command = await import(pathToFileURL(filePath).href);
      if (command.data && command.execute) {
        commands.push(command.data.toJSON());
      }
    } catch (e) {
      console.error(`Failed to register command ${file}:`, e);
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log(`Registering ${commands.length} commands...`);

    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Commands registered globally');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

export async function loadCommands() {
  const commands = new Map();
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js') && !file.endsWith('.map'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
      const command = await import(pathToFileURL(filePath).href);
      if (command.data && command.execute) {
        commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name} (from ${file})`);
      } else {
        console.warn(`Skipped ${file}: missing data or execute export`);
      }
    } catch (e) {
      console.error(`Failed to load command ${file}:`, e);
    }
  }

  return commands;
}