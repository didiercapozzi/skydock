import { run } from '../tools'
import { ffprobePath, hasCommand } from '../utils'

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
