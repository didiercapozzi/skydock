import * as fs from 'node:fs'

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
