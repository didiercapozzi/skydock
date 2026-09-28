import { run } from '../tools'
import { ffprobePath, hasCommand } from '../utils'

/* How long a video or a sound file lasts, in seconds as ffprobe reads it off the file, or null when
   it cannot say — no ffprobe, or a file it cannot read. Asked without holding the server. */
const mediaSeconds = async (target: string) => {
  if (!hasCommand('ffprobe')) return null
  const ran = await run(ffprobePath(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    target
  ])
  if (!ran.ok) return null
  const parsed = Number.parseFloat(ran.stdout.trim())
  return Number.isFinite(parsed) ? parsed : null
}

export { mediaSeconds }
