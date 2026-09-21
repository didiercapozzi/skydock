import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { hasCommand } from './utils'

/* Opening the editor is the one thing SkyDock does to the machine around it rather than to its own
   folder, so it is kept apart: a single command, run detached, never waited on.

   Which command is a setting, because where SkyDock runs decides what it can reach. Installed on
   the machine someone edits on — the desktop build — `kdenlive` is right there. Running in the
   development container it is not, and there is no kdenlive to reach; SKYDOCK_EDITOR_COMMAND is how
   that case is pointed at something else, and how this is exercised at all from in there.

   It never throws: not being able to open the editor is a thing to be told, not a failed montage. */

const EDITOR_COMMAND = 'SKYDOCK_EDITOR_COMMAND'

/* How long to keep watching after starting it. `spawn` reports nothing synchronously — a command
   that cannot run says so on an `error` event, and one that runs and gives up says so by exiting —
   so claiming success at the call is claiming something nobody checked. An editor still alive after
   this, or gone with nothing to complain about, is as good as it gets without waiting for a window
   to appear.

   Long enough for a command that opens the editor somewhere else to come back with what happened
   over there: SKYDOCK_EDITOR_COMMAND can be a bridge onto the machine around this one, and a
   bridge takes a couple of seconds to hand the project over and see whether it was taken. Cut
   shorter, this says "opening it" and then learns nothing. It only ever waits the whole of it for
   an editor that is still running, which is the case that has already gone right. */
const GRACE_MS = 4000

type OpenResult = { opened: boolean; command: string; reason?: string }

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

/* The setting is a command line, so it is read the way a shell reads one. Splitting on spaces
   instead tears `sh -c "..."` into pieces and hands the program half a quoted string, which fails
   in a way that looks like the editor's fault rather than ours. Quotes group, a backslash takes the
   next character literally, and nothing else is interpreted — no globbing, no variables, no
   pipelines. Unbalanced quotes are a mistake worth naming rather than guessing at. */
const tokenize = (command: string) => {
  const tokens: string[] = []
  let current = ''
  let held = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (quote) {
      if (c === '\\' && quote === '"' && i + 1 < command.length) current += command[++i]
      else if (c === quote) quote = null
      else current += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      held = true
      continue
    }
    if (c === '\\' && i + 1 < command.length) {
      current += command[++i]
      held = true
      continue
    }
    if (/\s/.test(c)) {
      if (held || current) tokens.push(current)
      current = ''
      held = false
      continue
    }
    current += c
    held = true
  }
  if (quote) return null
  if (held || current) tokens.push(current)
  return tokens
}

/* A GUI that cannot find a display is the ordinary way this fails on a machine SkyDock reached over
   a connection, and the message it prints is not always the first thing anyone reads. */
const displayHint = () =>
  process.env.DISPLAY || process.env.WAYLAND_DISPLAY
    ? ''
    : ' — and there is no DISPLAY set here, so a window has nowhere to open'

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
  const [program, ...rest] = parts
  if (!program || !hasCommand(program))
    return {
      opened: false,
      command,
      reason: `${program} is not on this machine — set ${EDITOR_COMMAND} to what should open the project, or open it by hand`
    }

  return await new Promise<OpenResult>((resolve) => {
    let child: childProcess.ChildProcess
    try {
      /* detached so the editor outlives the request that started it; stderr kept rather than
         discarded, because when nothing appears on screen that is the only thing that knows why */
      child = childProcess.spawn(program, [...rest, projectPath], {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe']
      })
    } catch (e) {
      resolve({ opened: false, command, reason: e instanceof Error ? e.message : String(e) })
      return
    }

    let complaint = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      complaint += chunk.toString()
    })

    let settled = false
    const settle = (result: OpenResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      /* still running: it is up, and nothing more is worth waiting for */
      child.unref()
      child.stderr?.destroy()
      settle({ opened: true, command })
    }, GRACE_MS)

    child.on('error', (e) =>
      settle({ opened: false, command, reason: `${command} could not be run: ${e.message}` })
    )

    child.on('exit', (code) => {
      /* Gone already. Leaving straight away with nothing to say is what an editor does when it
         hands the file to a copy of itself that is already open, so that counts as opened. */
      if (code === 0) {
        settle({ opened: true, command })
        return
      }
      const said = complaint.trim().split('\n').filter(Boolean).slice(-2).join(' · ')
      settle({
        opened: false,
        command,
        reason: `${program} stopped straight away${code === null ? '' : ` (code ${code})`}${
          said ? `: ${said}` : ''
        }${displayHint()}`
      })
    })
  })
}

export { editorCommand, editorParts, openInEditor, tokenize }
export type { OpenResult }
