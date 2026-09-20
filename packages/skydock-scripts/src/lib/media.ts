import * as childProcess from 'node:child_process'
import { ffprobePath, hasCommand } from '../utils'

/* How long a video or a sound file lasts, in seconds as ffprobe reads it off the file, or null when
   it cannot say — no ffprobe, or a file it cannot read. */
const mediaSeconds = (target: string) => {
  if (!hasCommand('ffprobe')) return null
  try {
    const out = childProcess.execFileSync(
      ffprobePath(),
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', target],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const parsed = Number.parseFloat(out.trim())
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export { mediaSeconds }
