import { stat } from 'node:fs/promises'

const watchGrowth = (
  files: string[],
  total: number,
  onPart: (part: number) => void,
  everyMs = 250
) => {
  if (total <= 0) return () => {}
  let looking = false
  const timer = setInterval(async () => {
    if (looking) return
    looking = true
    for (const file of files) {
      const stats = await stat(file).catch(() => null)
      if (stats) {
        onPart(Math.min(1, stats.size / total))
        break
      }
    }
    looking = false
  }, everyMs)
  return () => clearInterval(timer)
}

export { watchGrowth }
