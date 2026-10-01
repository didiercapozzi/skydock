import { transfersFileSchema } from '@skydock/scripts'
import type { Transfer } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { routingEngine } from '../helpers/routing'

/* What was sent, copied in and copied off, the latest first (RULES, Transfers): read when the panel
   opens, and again each time a transfer starts or ends — `stamp` is what tells it one did. `null`
   until the first answer, so a panel just opened says it is looking rather than that there is
   nothing. */
const useTransfers = (stamp: string) => {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null)

  useEffect(() => {
    let cancelled = false
    routingEngine
      .loader({ url: '/api/transfers' })
      .then((raw) => {
        const parsed = transfersFileSchema.safeParse(raw)
        if (!cancelled) setTransfers(parsed.success ? parsed.data.transfers : [])
      })
      .catch(() => {
        if (!cancelled) setTransfers([])
      })
    return () => {
      cancelled = true
    }
  }, [stamp])

  return {
    transfers,
    forget: () => setTransfers([]),
    /* one of them forgotten, the others kept */
    forgetOne: (id: string) =>
      setTransfers((now) => (now === null ? now : now.filter((transfer) => transfer.id !== id)))
  }
}

export { useTransfers }
