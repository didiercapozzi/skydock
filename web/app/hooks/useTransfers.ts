import { transfersFileSchema } from '@skydock/scripts'
import type { Transfer } from '@skydock/scripts'
import { useLoaded } from './useLoaded'

const useTransfers = (stamp: string) => {
  const { data, problem, setData } = useLoaded('/api/transfers', transfersFileSchema, {
    failed: '',
    deps: [stamp]
  })
  const transfers: Transfer[] | null = data ? data.transfers : problem !== null ? [] : null

  return {
    transfers,
    forget: () => setData({ transfers: [] }),
    forgetOne: (id: string) =>
      setData((now) =>
        now === null ? now : { transfers: now.transfers.filter((transfer) => transfer.id !== id) }
      )
  }
}

export { useTransfers }
