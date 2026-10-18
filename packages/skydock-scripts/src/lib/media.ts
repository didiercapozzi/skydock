import { run } from '../tools'
import { ffprobePath, hasCommand } from '../utils'

const mediaSeconds = async (target: string) => {
  if (!(await hasCommand('ffprobe'))) return null
  const ran = await run(await ffprobePath(), [
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

const mediaHasSound = async (target: string) => {
  if (!(await hasCommand('ffprobe'))) return false
  const ran = await run(await ffprobePath(), [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index',
    '-of',
    'csv=p=0',
    target
  ])
  return ran.ok && ran.stdout.trim() !== ''
}

export { mediaHasSound, mediaSeconds }
