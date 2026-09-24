import * as childProcess from 'node:child_process'
import { hasCommand } from './utils'
import { messageOf } from './lib/words'

/* Starting something on the machine around SkyDock — the editor with a project, the player with a
   clip. It is the one thing SkyDock does outside its own folder, so it is kept in one place and
   done the same way both times.

   Which command is a setting, because where SkyDock runs decides what it can reach. Installed on
   the machine somebody works at, the editor and the player are simply there. Running in the
   development container neither is, and the setting points at a bridge onto the machine outside.

   It never throws: not being able to open something is a thing to be told. */

/* How long to keep watching after starting it. `spawn` reports nothing synchronously — a command
   that cannot run says so on an `error` event, and one that runs and gives up says so by exiting —
   so claiming success at the call is claiming something nobody checked. Still alive after this, or
   gone with nothing to complain about, is as good as it gets without waiting for a window.

   Long enough for a bridge onto another machine to hand the file over and see whether it was
   taken. Cut shorter, this says "opening it" and then learns nothing. It only ever waits the whole
   of it for something still running, which is the case that has already gone right. */
const GRACE_MS = 4000

type OpenResult = { opened: boolean; command: string; reason?: string }

/* A command line is read the way a shell reads one. Splitting on spaces instead tears
   `sh -c "..."` into pieces and hands the program half a quoted string, which fails in a way that
   looks like the editor's fault rather than ours. Quotes group, a backslash takes the next
   character literally, and nothing else is interpreted — no globbing, no variables, no pipelines.
   Unbalanced quotes are a mistake worth naming rather than guessing at. */
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

/* A window that cannot find a display is the ordinary way this fails on a machine SkyDock reached
   over a connection, and the message it prints is not always the first thing anyone reads. */
const displayHint = () =>
  process.env.DISPLAY || process.env.WAYLAND_DISPLAY
    ? ''
    : ' — and there is no DISPLAY set here, so a window has nowhere to open'

/* Runs it, detached, and waits a moment to see whether it stayed. `parts` is the program and
   however it wants to be invoked, `target` the one file it is being given, and `setting` the name
   of the setting that would point this somewhere else — which is the thing to do about it. */
const startDetached = (parts: string[], target: string, command: string, setting: string) => {
  const [program, ...rest] = parts
  if (!program || !hasCommand(program))
    return Promise.resolve({
      opened: false,
      command,
      reason: `${program} is not on this machine — set ${setting} to what should open it, or open it by hand`
    })

  return new Promise<OpenResult>((resolve) => {
    let child: childProcess.ChildProcess
    try {
      /* detached so what was opened outlives the request that started it; stderr kept rather than
         discarded, because when nothing appears on screen that is the only thing that knows why */
      child = childProcess.spawn(program, [...rest, target], {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe']
      })
    } catch (e) {
      resolve({ opened: false, command, reason: messageOf(e) })
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
      /* Gone already. Leaving straight away with nothing to say is what a program does when it
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

export { GRACE_MS, startDetached, tokenize }
export type { OpenResult }
