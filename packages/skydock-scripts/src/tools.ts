import * as childProcess from 'node:child_process'
import * as asyncHooks from 'node:async_hooks'

/* Running ffmpeg, ffprobe and exiftool: the program and its arguments are handed over as they are,
   never as a line for a shell to take apart again — a name with a quote, a space or a backslash in it
   is then just a name, and the same call works on every system. Waited on without holding the thread,
   since one clip is minutes of work and the machine answers the board meanwhile. What the tool said on
   its way out is kept, because when it fails the reason is in there. */

/* The work a command belongs to can be cancelled — a processing run someone stops — and then the
   command running for it is stopped too. Held for that work alone, so a proxy being built beside it
   is not touched. Made on first use rather than when this module loads, since the board's browser
   code loads it too and has no such thing; kept on the global object so a reload of this module
   shares the one a run started under. */
declare global {
  var skydockStoppable: asyncHooks.AsyncLocalStorage<AbortSignal> | undefined
}

const stoppable = () =>
  (globalThis.skydockStoppable ??= new asyncHooks.AsyncLocalStorage<AbortSignal>())

/* Every tool running right now. The app is closed while a card is being transcoded, and a tool
   left behind goes on chewing the machine with nothing to hand its work to — so closing stops
   them. Kept on the global object for the same reason as the cancel above. */
declare global {
  var skydockRunning: Set<childProcess.ChildProcess> | undefined
}

const runningTools = () => (globalThis.skydockRunning ??= new Set())

/* stops every tool running now, and says how many there were */
const stopTools = () => {
  const running = runningTools()
  const stopped = running.size
  for (const child of running) child.kill()
  running.clear()
  return stopped
}

/* what a command prints while it runs, for the one caller that wants to watch */
type Listening = { stdout?: (text: string) => void; stderr?: (text: string) => void }

/* What a program said and whether it ended well. What it printed is kept either way: some say all
   they were asked and still end unhappily, and the caller is the one to judge what that is worth. */
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

/* Where ffmpeg has got to in what it is writing, in seconds: with `-progress` it prints its
   position about twice a second, several to a chunk when it is fast, so the last one counts. */
const positionIn = (text: string) => {
  const found = [...text.matchAll(/out_time_us=(\d+)/g)].pop()
  return found ? Number(found[1]) / 1_000_000 : null
}

/* how long the clip it opened runs for, which ffmpeg says once, on its way in */
const durationIn = (text: string) => {
  const found = /Duration: (\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(text)
  return found ? Number(found[1]) * 3600 + Number(found[2]) * 60 + Number(found[3]) : null
}

/* An ffmpeg run that says how far it has got, as a percentage of what it is writing. How long that
   is comes from the caller when the clip is trimmed — the output is the trim, not the clip — and
   otherwise from ffmpeg itself, so nothing is probed twice. It never says 100: done is the
   command coming back, not the last frame going out. */
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

/* ffmpeg signs off with "Conversion failed!", which says only that it did; the diagnosis is a line
   further up, naming what it would not accept. The sign-offs are dropped and the first line that
   gives a reason is kept: once one stage fails, every stage after it reports its own failure too,
   and those are consequences. */
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
