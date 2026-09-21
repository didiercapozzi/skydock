import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { startDetached, tokenize } from './openOutside'
import type { OpenResult } from './openOutside'

/* Opening the editor is the one thing SkyDock does to the machine around it rather than to its own
   folder, so it is kept apart: a single command, run detached, never waited on.

   Which command is a setting, because where SkyDock runs decides what it can reach. Installed on
   the machine someone edits on — the desktop build — `kdenlive` is right there. Running in the
   development container it is not, and there is no kdenlive to reach; SKYDOCK_EDITOR_COMMAND is how
   that case is pointed at something else, and how this is exercised at all from in there.

   It never throws: not being able to open the editor is a thing to be told, not a failed montage. */

const EDITOR_COMMAND = 'SKYDOCK_EDITOR_COMMAND'

/* Where the editor is when nobody has said, which is a different thing on each system. On Linux
   kdenlive is a command like any other. On a Mac it is an application rather than a program on the
   PATH, and the system opens it by name — which also hands the project to a copy already running.
   On Windows it installs under whichever Program Files this machine has. */
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

/* the program and its arguments, as found on this machine — nothing to read as a command line */
const editorHere = () => {
  if (process.platform === 'darwin')
    return ['open', '-a', MAC_APPS.find((app) => fs.existsSync(app)) ?? 'kdenlive']
  if (process.platform === 'win32')
    return [WINDOWS_PLACES().find((place) => fs.existsSync(place)) ?? 'kdenlive.exe']
  return ['kdenlive']
}

const editorCommand = () => process.env[EDITOR_COMMAND]?.trim() || editorHere().join(' ')

/* What to run: the setting read the way a shell reads a command line, or, when there is none, the
   editor as it was found here — which is a program and its arguments already, and would only be
   torn apart by reading it again. */
const editorParts = () => {
  const told = process.env[EDITOR_COMMAND]?.trim()
  return told ? tokenize(told) : editorHere()
}

const openInEditor = async (projectPath: string) => {
  const command = editorCommand()
  if (!fs.existsSync(projectPath))
    return { opened: false, command, reason: `No project at ${projectPath}` }

  /* the first word is the program; the rest is however it wants to be invoked */
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
