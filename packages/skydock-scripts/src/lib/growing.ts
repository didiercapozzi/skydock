import * as fs from 'node:fs'

/* How far a file being written by somebody else has got — KDE fetching a clip off a camera — read off
   its size every so often, since that copy says nothing while it works. The first of `files` that is
   there is the one read: a writer may keep its own name for the file until it is whole. Stopped by
   calling what it returns. */
const watchGrowth = (
  files: string[],
  total: number,
  onPart: (part: number) => void,
  everyMs = 250
) => {
  if (total <= 0) return () => {}
  const timer = setInterval(() => {
    const at = files.find((file) => fs.existsSync(file))
    if (!at) return
    fs.stat(at, (error, stats) => {
      if (!error) onPart(Math.min(1, stats.size / total))
    })
  }, everyMs)
  return () => clearInterval(timer)
}

export { watchGrowth }
