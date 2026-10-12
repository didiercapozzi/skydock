const singleFlight = <Args extends unknown[], T>(pass: (...args: Args) => Promise<T>) => {
  let running: Promise<T> | null = null
  return (...args: Args) =>
    (running ??= pass(...args).finally(() => {
      running = null
    }))
}

export { singleFlight }
