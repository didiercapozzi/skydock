import * as os from 'node:os'
import * as path from 'node:path'
import { pathExists } from './lib/fs'
import { startDetached, tokenize } from './openOutside'

const EDITOR_COMMAND = 'SKYDOCK_EDITOR_COMMAND'

const MAC_APPS = [
  '/Applications/kdenlive.app',
  path.join(os.homedir(), 'Applications/kdenlive.app')
]

const WINDOWS_PLACES = () =>
  [
    [process.env.ProgramFiles, 'kdenlive', 'bin', 'kdenlive.exe'],
    [process.env['ProgramFiles(x86)'], 'kdenlive', 'bin', 'kdenlive.exe'],
    [process.env.LOCALAPPDATA, 'Programs', 'kdenlive', 'bin', 'kdenlive.exe']
  ].flatMap(([home, ...rest]) => (home ? [path.join(home, ...(rest as string[]))] : []))

const firstThere = async (places: string[]) => {
  for (const place of places) if (await pathExists(place)) return place
  return undefined
}

const editorHere = async () => {
  if (process.platform === 'darwin')
    return ['open', '-a', (await firstThere(MAC_APPS)) ?? 'kdenlive']
  if (process.platform === 'win32') return [(await firstThere(WINDOWS_PLACES())) ?? 'kdenlive.exe']
  return ['kdenlive']
}

const editorCommand = async () =>
  process.env[EDITOR_COMMAND]?.trim() || (await editorHere()).join(' ')

const editorParts = async () => {
  const told = process.env[EDITOR_COMMAND]?.trim()
  return told ? tokenize(told) : editorHere()
}

const openInEditor = async (projectPath: string) => {
  const command = await editorCommand()
  if (!(await pathExists(projectPath)))
    return { opened: false, command, reason: `No project at ${projectPath}` }

  const parts = await editorParts()
  if (!parts)
    return {
      opened: false,
      command,
      reason: `${EDITOR_COMMAND} has an unbalanced quote — it is read as a shell command line`
    }
  return await startDetached(parts, projectPath, command, EDITOR_COMMAND)
}

export { editorCommand, editorParts, openInEditor }
