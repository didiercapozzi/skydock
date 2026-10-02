/* Whether two values say the same thing as JSON, whatever order their keys were written in: a board
   rebuilt by the server and a board built up from edits on the page are the same board when they hold
   the same facts, and no look at the record should draw it again. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner
  )

const sameJson = (a: unknown, b: unknown) => stable(a) === stable(b)

export { sameJson }
