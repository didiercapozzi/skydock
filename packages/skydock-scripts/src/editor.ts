import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { startDetached, tokenize } from './openOutside'
import type { OpenResult } from './openOutside'

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

const editorHere = () => {
  if (process.platform === 'darwin')
    return ['open', '-a', MAC_APPS.find((app) => fs.existsSync(app)) ?? 'kdenlive']
  if (process.platform === 'win32')
    return [WINDOWS_PLACES().find((place) => fs.existsSync(place)) ?? 'kdenlive.exe']
  return ['kdenlive']
}

const editorCommand = () => process.env[EDITOR_COMMAND]?.trim() || editorHere().join(' ')

const editorParts = () => {
  const told = process.env[EDITOR_COMMAND]?.trim()
  return told ? tokenize(told) : editorHere()
}

const openInEditor = async (projectPath: string) => {
  const command = editorCommand()
  if (!fs.existsSync(projectPath))
    return { opened: false, command, reason: `No project at ${projectPath}` }

  const parts = editorParts()
  if (!parts)
    return {
      opened: false,
      command,
      reason: `${EDITOR_COMMAND} has an unbalanced quote — it is read as a shell command line`
    }
  return await startDetached(parts, projectPath, command, EDITOR_COMMAND)
}

export { editorCommand, editorParts, openInEditor, tokenize }
export type { OpenResult }
