import * as fs from 'node:fs'
import { startDetached, tokenize } from './openOutside'

const PLAYER_COMMAND = 'SKYDOCK_PLAYER_COMMAND'

const playerHere = () => {
  if (process.platform === 'darwin') return ['open']
  if (process.platform === 'win32') return ['cmd', '/c', 'start', '']
  return ['xdg-open']
}

const playerCommand = () => process.env[PLAYER_COMMAND]?.trim() || playerHere().join(' ')

const playerParts = () => {
  const told = process.env[PLAYER_COMMAND]?.trim()
  return told ? tokenize(told) : playerHere()
}

const openInPlayer = async (filePath: string) => {
  const command = playerCommand()
  if (!fs.existsSync(filePath)) return { opened: false, command, reason: `No file at ${filePath}` }
  const parts = playerParts()
  if (!parts)
    return {
      opened: false,
      command,
      reason: `${PLAYER_COMMAND} has an unbalanced quote — it is read as a shell command line`
    }
  return await startDetached(parts, filePath, command, PLAYER_COMMAND)
}

export { openInPlayer, playerCommand, playerParts }
