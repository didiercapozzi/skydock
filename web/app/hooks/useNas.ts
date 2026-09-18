import type { RemoteListing } from '@skydock/scripts'
import { useState } from 'react'
import { z } from 'zod'
import { useSafeFetcher } from '../helpers/routing'
import type { CheckedListing } from './useBoardState'

const nasSuccessSchema = z.object({
  connected: z.boolean(),
  hostname: z.string().optional(),
  username: z.string().optional(),
  defaultFolder: z.string().nullish(),
  backupFolder: z.string().nullish()
})

const nasErrorSchema = z.object({ globalErrors: z.array(z.string()).optional() }).passthrough()

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
    defaultFolder: string | null
    backupFolder: string | null
  }
  remote: CheckedListing | null
}

/* The storage as the board knows it: the session — derived, never stored; the loader is the first
   paint and the fetcher is the live truth — and what it holds. NAS answers get their own fetcher
   so they never land where the board's data is read from. */
const useNas = (loaded: NasLoaded, remoteAfterUpload: CheckedListing | null) => {
  const nasFetcher = useSafeFetcher()
  /* what the NAS currently holds, so a file deleted over there stops reading as uploaded */
  const remoteFetcher = useSafeFetcher()
  const [dialogOpenedOn, setDialogOpenedOn] = useState<unknown>(null)

  const answer = nasSuccessSchema.safeParse(nasFetcher.data)
  const connected = answer.success ? answer.data.connected : loaded.nas.connected
  const host = answer.success ? (answer.data.hostname ?? null) : loaded.nas.hostname
  const defaultFolder = answer.success
    ? (answer.data.defaultFolder ?? null)
    : loaded.nas.defaultFolder
  const backupFolder = answer.success ? (answer.data.backupFolder ?? null) : loaded.nas.backupFolder
  const refused = nasErrorSchema.safeParse(nasFetcher.data)
  const error = !answer.success && refused.success ? refused.data.globalErrors?.[0] : undefined
  /* the connection dialog closes itself once a *new* answer says we are connected */
  const connectSucceeded =
    answer.success && answer.data.connected && nasFetcher.data !== dialogOpenedOn
  const markDialogOpened = () => setDialogOpenedOn(nasFetcher.data)

  const connect = (hostname: string, user: string, password: string) =>
    nasFetcher.submit({
      url: '/api/nas',
      actionArgs: { intent: 'connect', host: hostname, user, password }
    })
  const disconnect = () =>
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'disconnect' } })
  /* the two session folders — where uploads go and where the originals are kept */
  const selectFolder = (path: string, kind: 'default' | 'backup') =>
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'select-folder', path, kind } })

  /* Only a listing that came back may demote a file; a NAS that was never asked, or that failed,
     leaves every proven upload alone (RULES, File status). The loader took the first look; an
     upload's own listing or a Refresh replaces it, newest wins. */
  const remoteAnswer = remoteFilesSchema.safeParse(remoteFetcher.data)
  const fresh = remoteAnswer.success && remoteAnswer.data.ok ? remoteAnswer.data : null
  const seen: CheckedListing[] = [fresh, remoteAfterUpload, loaded.remote].filter(
    (r): r is CheckedListing => r !== null
  )
  const newest = seen.length === 0 ? null : seen.reduce((a, b) => (a.at >= b.at ? a : b))
  const remote: RemoteListing | null = newest
  const checkRemote = () => remoteFetcher.load({ url: '/api/remote-files' })

  return {
    connected,
    host,
    defaultFolder,
    backupFolder,
    error,
    connectSucceeded,
    markDialogOpened,
    connect,
    disconnect,
    selectFolder,
    remote,
    remoteCheckedAt: newest?.at ?? null,
    checking: remoteFetcher.state !== 'idle',
    checkRemote
  }
}

export { useNas }
