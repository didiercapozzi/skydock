/* A file being copied in is the one thing the person is watching, and a disk or a processor shared with
   a pass reading every clip for its jump and making its small copy makes that copy crawl, with the board
   stalling beside it. So those passes wait for it: each asks, before the next clip, whether a copy is
   under way, and goes on once none is. Kept on the global object so a reload of this module shares one. */
declare global {
  var skydockCopiesUnderWay: number | undefined
}

/* said when a copy begins; the answer says it has ended */
const copyBegins = () => {
  globalThis.skydockCopiesUnderWay = (globalThis.skydockCopiesUnderWay ?? 0) + 1
  let over = false
  return () => {
    if (over) return
    over = true
    globalThis.skydockCopiesUnderWay = Math.max(0, (globalThis.skydockCopiesUnderWay ?? 1) - 1)
  }
}

/* resolves once no copy is under way */
const untilQuiet = async () => {
  while ((globalThis.skydockCopiesUnderWay ?? 0) > 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
}

export { copyBegins, untilQuiet }
