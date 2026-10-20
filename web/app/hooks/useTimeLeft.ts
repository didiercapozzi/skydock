import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'

type Seen = { at: number; part: number }

const timeLeftOf = (first: Seen, now: Seen) => {
  const gained = now.part - first.part
  const spent = (now.at - first.at) / 1000
  if (gained < 0.02 || spent < 5) return null
  return Math.max(0, Math.round((spent * (1 - now.part)) / gained))
}

const leftWords = (seconds: number) => {
  const minutes = Math.ceil(seconds / 60)
  return seconds >= 60 ? t`${minutes} min left` : t`${seconds} s left`
}

const useTimeLeft = (id: string, part: number, running: boolean) => {
  const [first, setFirst] = useState(() => ({ id, at: Date.now(), part }))
  const [now, setNow] = useState(Date.now)
  if (first.id !== id) setFirst({ id, at: now, part })
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return running ? timeLeftOf(first, { at: Math.max(now, first.at), part }) : null
}

export { leftWords, timeLeftOf, useTimeLeft }
