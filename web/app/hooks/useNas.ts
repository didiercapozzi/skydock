import type { RemoteListing } from '@skydock/scripts'
import { useState } from 'react'
import { z } from 'zod'
import { useSafeFetcher } from '../helpers/routing'
import type { CheckedListing } from './useBoardState'

const nasSuccessSchema = z.object({
  connected: z.boolean(),
  hostname: z.string().optional(),
  username: z.string().optional()
})

const nasErrorSchema = z
  .object({
    globalErrors: z.array(z.string()).optional(),
    fieldErrors: z.object({ otp: z.string().optional() }).passthrough().optional()
  })
  .passthrough()

const remoteFilesSchema = z.union([
  z.object({
    ok: z.literal(true),
    dirs: z.array(z.string()),
    sizes: z.record(z.string(), z.number().nullable()),
    at: z.number()
  }),
  z.object({ ok: z.literal(false), reason: z.string() })
])

type NasLoaded = {
  nas: {
    connected: boolean
    hostname: string | null
    username: string | null
  }
  remote: CheckedListing | null
}

const useNas = (loaded: NasLoaded, remoteAfterUpload: CheckedListing | null) => {
  const nasFetcher = useSafeFetcher()
  const remoteFetcher = useSafeFetcher()
  const [dialogOpenedOn, setDialogOpenedOn] = useState<unknown>(null)

  const answer = nasSuccessSchema.safeParse(nasFetcher.data)
  const connected = answer.success ? answer.data.connected : loaded.nas.connected
  const host = answer.success ? (answer.data.hostname ?? null) : loaded.nas.hostname
  const user = answer.success ? (answer.data.username ?? null) : loaded.nas.username
  const refused = nasErrorSchema.safeParse(nasFetcher.data)
  const error = !answer.success && refused.success ? refused.data.globalErrors?.[0] : undefined
  const codeAsked = !answer.success && refused.success ? refused.data.fieldErrors?.otp : undefined
  const connectSucceeded =
    answer.success && answer.data.connected && nasFetcher.data !== dialogOpenedOn
  const markDialogOpened = () => setDialogOpenedOn(nasFetcher.data)

  const connect = (hostname: string, user: string, password: string, otp?: string) =>
    nasFetcher.submit({
      url: '/api/nas',
      actionArgs: { intent: 'connect', host: hostname, user, password, ...(otp ? { otp } : {}) }
    })
  const disconnect = () =>
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'disconnect' } })

  const remoteAnswer = remoteFilesSchema.safeParse(remoteFetcher.data)
  const fresh = remoteAnswer.success && remoteAnswer.data.ok ? remoteAnswer.data : null
  const seen: CheckedListing[] = [fresh, remoteAfterUpload, loaded.remote].filter((r) => r !== null)
  const newest = seen.length === 0 ? null : seen.reduce((a, b) => (a.at >= b.at ? a : b))
  const remote: RemoteListing | null = newest
  const checkRemote = () => remoteFetcher.load({ url: '/api/remote-files' })

  return {
    connected,
    host,
    user,
    error,
    codeAsked,
    connectSucceeded,
    markDialogOpened,
    connect,
    disconnect,
    remote,
    remoteCheckedAt: newest?.at ?? null,
    checking: remoteFetcher.state !== 'idle',
    checkRemote
  }
}

export { useNas }
