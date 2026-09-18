import * as childProcess from 'node:child_process'

/* Running ffmpeg, ffprobe and exiftool: a command line is handed to the shell and waited on without
   holding the thread, since one clip is minutes of work and the machine answers the board meanwhile.
   What the tool said on its way out is kept, because when it fails the reason is in there. */

/* a path on a shell command line, whatever it contains */
const quote = (value: string) => `"${value.replace(/(["$`\\])/g, '\\$1')}"`

const run = (line: string) =>
  new Promise<{ ok: true; stdout: string } | { ok: false; stderr: string }>((resolve) => {
    childProcess.exec(line, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve(
        error
          ? { ok: false, stderr: String(stderr ?? '') }
          : { ok: true, stdout: String(stdout ?? '') }
      )
    )
  })

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

export { lastComplaint, quote, run }
