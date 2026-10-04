import * as childProcess from 'node:child_process'
import { hasCommand } from './utils'
import { messageOf } from './lib/words'

const GRACE_MS = 4000

type OpenResult = { opened: boolean; command: string; reason?: string }

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

const displayHint = () =>
  process.env.DISPLAY || process.env.WAYLAND_DISPLAY
    ? ''
    : ' — and there is no DISPLAY set here, so a window has nowhere to open'

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
      child.unref()
      child.stderr?.destroy()
      settle({ opened: true, command })
    }, GRACE_MS)

    child.on('error', (e) =>
      settle({ opened: false, command, reason: `${command} could not be run: ${e.message}` })
    )

    child.on('exit', (code) => {
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

export { startDetached, tokenize }
export type { OpenResult }
