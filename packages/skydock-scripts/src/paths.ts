const lastSegment = (p: string) => p.slice(p.lastIndexOf('/') + 1)

const parentOf = (p: string) => {
  const cut = p.lastIndexOf('/')
  return cut <= 0 ? '/' : p.slice(0, cut)
}

export { lastSegment, parentOf }
