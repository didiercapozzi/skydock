import { bookingSchema } from '@skydock/scripts'
import type { Booking } from '@skydock/scripts'
import { useEffect, useSyncExternalStore } from 'react'
import { z } from 'zod'
import { t } from '@lingui/core/macro'
import { routingEngine } from '../helpers/routing'
import { refusalSchema } from './useBoardState'

/* The day's booking list, read once for the whole board and shared by everything that names or
   addresses a montage (RULES, The booking list). Brought in again, it is the new list at once
   everywhere. */
const answerSchema = z.object({ list: z.array(bookingSchema) })

const NONE: Booking[] = []
let held: Booking[] = NONE
let asked = false
const listeners = new Set<() => void>()

const hold = (list: Booking[]) => {
  held = list
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readList = async () => {
  const raw = await routingEngine.loader({ url: '/api/bookings' }).catch(() => null)
  const answer = answerSchema.safeParse(raw)
  if (answer.success) hold(answer.data.list)
}

const useBookingList = () => {
  const list = useSyncExternalStore(
    subscribe,
    () => held,
    () => NONE
  )
  useEffect(() => {
    if (asked) return
    asked = true
    void readList()
  }, [])
  return list
}

/* a CSV's text, or the list itself — empty to clear it; answers with what was kept, or why not */
const bringInBookings = async (body: { csv: string } | { list: Booking[] }) => {
  const raw = await routingEngine
    .action({ url: '/api/bookings', actionArgs: body })
    .catch(() => null)
  const answer = answerSchema.safeParse(raw)
  if (answer.success) {
    hold(answer.data.list)
    return { list: answer.data.list }
  }
  const refused = refusalSchema.safeParse(raw)
  return {
    error:
      (refused.success && refused.data.globalErrors?.[0]) || t`The list could not be brought in.`
  }
}

export { bringInBookings, useBookingList }
