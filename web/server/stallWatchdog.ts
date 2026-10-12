const watchStalls = (
  report: (lagMs: number) => void,
  everyMs = 100,
  limitMs = 250
): NodeJS.Timeout => {
  let expected = Date.now() + everyMs
  return setInterval(() => {
    const now = Date.now()
    const lag = now - expected
    expected = now + everyMs
    if (lag > limitMs) report(lag)
  }, everyMs).unref()
}

export { watchStalls }
