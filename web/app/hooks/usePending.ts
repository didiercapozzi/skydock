import { useEffect, useState } from 'react'

const PENDING_AFTER_MS = 300

const usePending = (active: boolean, after = PENDING_AFTER_MS) => {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setLate(true), after)
    return () => {
      clearTimeout(timer)
      setLate(false)
    }
  }, [active, after])
  return active && late
}

export { PENDING_AFTER_MS, usePending }
