/* Paths as strings, on this machine or on the storage — free of node, so the board can use them. */

/* the last segment: the file's own name */
const lastSegment = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/* the folder a path is in; the root for a path at the root */
const parentOf = (p: string) => {
  const cut = p.lastIndexOf('/')
  return cut <= 0 ? '/' : p.slice(0, cut)
}

export { lastSegment, parentOf }
