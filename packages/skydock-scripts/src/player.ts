import { access } from 'node:fs/promises'
import { startDetached, tokenize } from './openOutside'

const PLAYER_COMMAND = 'SKYDOCK_PLAYER_COMMAND'
const FOLDER_COMMAND = 'SKYDOCK_FOLDER_COMMAND'

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
  if (
    !(await access(filePath).then(
      () => true,
      () => false
    ))
  )
    return { opened: false, command, reason: `No file at ${filePath}` }
  const parts = playerParts()
  if (!parts)
    return {
      opened: false,
      command,
      reason: `${PLAYER_COMMAND} has an unbalanced quote — it is read as a shell command line`
    }
  return await startDetached(parts, filePath, command, PLAYER_COMMAND)
}

/* A folder shown in the machine's own file manager: what opens a folder is what opens a file there — unless
   the person says otherwise, since the player a machine was told to use plays videos and shows no folder. */
const openFolder = async (folder: string) => {
  const told = process.env[FOLDER_COMMAND]?.trim()
  const parts = told ? tokenize(told) : playerHere()
  const command = told || playerHere().join(' ')
  if (!parts)
    return {
      opened: false,
      command,
      reason: `${FOLDER_COMMAND} has an unbalanced quote — it is read as a shell command line`
    }
  return await startDetached(parts, folder, command, FOLDER_COMMAND)
}

export { openFolder, openInPlayer, playerCommand, playerParts }
