import { useState } from 'react'

/* The files ticked in a list, by path: ticked, unticked, or all let go at once. */
const usePicked = () => {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const toggle = (path: string) => {
    const next = new Set(picked)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setPicked(next)
  }
  return { picked, setPicked, toggle }
}

export { usePicked }
