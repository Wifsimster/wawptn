import { REST, Routes } from 'discord.js'
import { validateEnv, env } from './env.js'
import { data as setupCommand } from './commands/setup.js'
import { data as linkCommand } from './commands/link.js'
import { data as gamesCommand } from './commands/games.js'
import { data as voteCommand } from './commands/vote.js'
import { data as randomCommand } from './commands/random.js'

validateEnv()

const commands = [
  setupCommand.toJSON(),
  linkCommand.toJSON(),
  gamesCommand.toJSON(),
  voteCommand.toJSON(),
  randomCommand.toJSON(),
]

const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN)

try {
  console.log(`Registering ${commands.length} slash commands...`)

  await rest.put(
    Routes.applicationCommands(env.DISCORD_APPLICATION_ID),
    { body: commands },
  )

  console.log('Slash commands registered successfully!')
} catch (error) {
  console.error('Failed to register slash commands:', error)
  process.exit(1)
}
