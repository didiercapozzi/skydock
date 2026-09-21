import * as fs from 'node:fs'
import { startDetached, tokenize } from './openOutside'

/* Handing a clip to the machine's own video player.

   The board plays a clip from its small copy — 640 across, which is what makes dragging a timeline
   answer at once — and the browser plays the clip itself full screen where it can. Often it cannot:
   a jump is 4K HEVC off a DJI or a recent GoPro, and most browsers have no decoder for it. The
   machine does: whatever plays videos there opens it at once, at its full size, with the graphics
   card doing the decoding and nothing copied or converted first.

   Which player is the machine's business, not SkyDock's, so what is asked for is "open this" and
   the machine decides. SKYDOCK_PLAYER_COMMAND is how a machine that answers that badly — or one
   SkyDock is reaching from a container — is pointed somewhere else. */

const PLAYER_COMMAND = 'SKYDOCK_PLAYER_COMMAND'

/* "Open this with whatever opens it", in each system's own words. */
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
