import { useEffect, useState } from 'react'

/* How long a wait is allowed to stay unannounced: an answer that comes sooner is felt as instant, and
   a spinner that flashes for a moment is noise. */
const PENDING_AFTER_MS = 300

/* Whether something that has been going on for a while is still going on: false for the first
   `after` ms of being active, true from then until it stops. */
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
