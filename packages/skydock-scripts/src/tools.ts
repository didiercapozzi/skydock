import * as childProcess from 'node:child_process'
import * as asyncHooks from 'node:async_hooks'

declare global {
  var skydockStoppable: asyncHooks.AsyncLocalStorage<AbortSignal> | undefined
}

const stoppable = () =>
  (globalThis.skydockStoppable ??= new asyncHooks.AsyncLocalStorage<AbortSignal>())

declare global {
  var skydockRunning: Set<childProcess.ChildProcess> | undefined
}

const runningTools = () => (globalThis.skydockRunning ??= new Set())

const stopTools = () => {
  const running = runningTools()
  const stopped = running.size
  for (const child of running) child.kill()
  running.clear()
  return stopped
}

type Listening = { stdout?: (text: string) => void; stderr?: (text: string) => void }

const run = (program: string, args: string[], listening?: Listening) =>
  new Promise<{ ok: true; stdout: string } | { ok: false; stdout: string; stderr: string }>(
    (resolve) => {
      const child = childProcess.execFile(
        program,
        args,
        { maxBuffer: 64 * 1024 * 1024, signal: stoppable().getStore() },
        (error, stdout, stderr) =>
          resolve(
            error
              ? { ok: false, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }
              : { ok: true, stdout: String(stdout ?? '') }
          )
      )
      if (child) {
        runningTools().add(child)
        child.on('close', () => runningTools().delete(child))
      }
      if (listening?.stdout) child?.stdout?.on('data', (chunk) => listening.stdout?.(String(chunk)))
      if (listening?.stderr) child?.stderr?.on('data', (chunk) => listening.stderr?.(String(chunk)))
    }
  )

const positionIn = (text: string) => {
  const found = [...text.matchAll(/out_time_us=(\d+)/g)].pop()
  return found ? Number(found[1]) / 1_000_000 : null
}

const durationIn = (text: string) => {
  const found = /Duration: (\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(text)
  return found ? Number(found[1]) * 3600 + Number(found[2]) * 60 + Number(found[3]) : null
}

const runWatched = (
  program: string,
  args: string[],
  onPercent?: (percent: number) => void,
  seconds?: number | null
) => {
  if (!onPercent) return run(program, args)
  let total = seconds != null && seconds > 0 ? seconds : null
  return run(program, ['-progress', 'pipe:1', '-nostats', ...args], {
    stderr: (text) => {
      total ??= durationIn(text)
    },
    stdout: (text) => {
      const at = positionIn(text)
      if (at !== null && total) onPercent(Math.max(0, Math.min(99, Math.floor((at / total) * 100))))
    }
  })
}

const NOISE = [
  /^Conversion failed!?$/i,
  /^Error opening output file/i,
  /^Terminating thread/i,
  /^Task finished with error code/i
]

const NAMES_A_REASON = /failed|invalid|unable|impossible|not (supported|implemented)/i

const lastComplaint = (stderr: string) => {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim().replace(/^\[[^\]]+\]\s*/, ''))
    .filter((l) => l !== '' && !NOISE.some((n) => n.test(l)))
  const named = lines.filter((l) => NAMES_A_REASON.test(l))
  return named[0] ?? lines[lines.length - 1] ?? 'ffmpeg failed with no output'
}

export { durationIn, lastComplaint, positionIn, run, runWatched, stoppable, stopTools }
