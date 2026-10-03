import { transfersFileSchema } from '@skydock/scripts'
import type { Transfer } from '@skydock/scripts'
import { useLoaded } from './useLoaded'

/* What was sent, copied in and copied off, the latest first (RULES, Transfers): read when the panel
   opens, and again each time a transfer starts or ends — `stamp` is what tells it one did. `null`
   until the first answer, so a panel just opened says it is looking rather than that there is
   nothing. */
const useTransfers = (stamp: string) => {
  const { data, problem, setData } = useLoaded('/api/transfers', transfersFileSchema, {
    failed: '',
    deps: [stamp]
  })
  /* a book that cannot be read is a book with nothing in it */
  const transfers: Transfer[] | null = data ? data.transfers : problem !== null ? [] : null

  return {
    transfers,
    forget: () => setData({ transfers: [] }),
    /* one of them forgotten, the others kept */
    forgetOne: (id: string) =>
      setData((now) =>
        now === null ? now : { transfers: now.transfers.filter((transfer) => transfer.id !== id) }
      )
  }
}

export { useTransfers }
