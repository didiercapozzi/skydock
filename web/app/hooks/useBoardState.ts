import { boardAnswerSchema } from '@skydock/scripts'
import type { OutputFact, ProxyFact, TandemEntry, TandemFact } from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import {
  freedNote,
  importNote,
  montageNote,
  restoredNote,
  scanNote,
  uploadedNote
} from '../helpers/notes'
import { useSafeFetcher } from '../helpers/routing'
import type { actionArgs as manifestArgs } from '../routes/api.manifest'
import { useGroups } from './useJumps'
import { useLiveProgress } from './useLiveProgress'

/* every board edit goes to the same endpoint; this is what that endpoint accepts, taken from the
   endpoint itself rather than restated here */
type ManifestArgs = z.infer<typeof manifestArgs>

/* a listing plus when it was taken, so the newest of several answers wins */
type CheckedListing = { dirs: string[]; sizes: Record<string, number | null>; at: number }

type Storage = { dir: string; tandems: TandemEntry[]; problem: string | null } | null

type Loaded = {
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  destinations: Destination[]
  outputs: Record<string, OutputFact>
  proxies: Record<string, ProxyFact>
  tandems: Record<string, TandemFact>
  storage: Storage
  hasManifest: boolean
  processing: { groupIds: string[] } | null
}

const refusalSchema = z
  .object({ success: z.literal(false), globalErrors: z.array(z.string()).optional() })
  .passthrough()

/* The board's picture of the manifest: the loader's for the first paint, then whatever the server
   answered last. The server answers every edit with the board as it saved it, or with the reason it
   refused, and a new answer is adopted the moment it is seen, during the render that sees it: the
   answer already is the next state, and nothing about it needs the screen to have been drawn first. */
const useBoardState = (loaded: Loaded, onFreed: (groupId: string) => void) => {
  const { groups, setGroups, updateGroups } = useGroups(loaded.groups)
  /* A page loaded mid-processing takes the work up where the server has it: that one tandem says it
     is processing, everything else waits, and the board asks to hear when it is done. */
  const running = loaded.processing
  const [busy, setBusy] = useState<string | null>(
    running
      ? running.groupIds.length === 1
        ? (running.groupIds[0] ?? 'process')
        : 'process'
      : null
  )
  const [note, setNote] = useState<string | null>(
    running ? 'Still processing — the board updates itself when it is done' : null
  )
  const [loose, setLoose] = useState<ManifestFile[]>(loaded.looseFiles)
  const [places, setPlaces] = useState<Destination[]>(loaded.destinations)
  const [uploading, setUploading] = useState<string | null>(null)
  /* `?? {}` because a board with no manifest has no clips to know anything about, and one map
     arriving empty is not a reason for the whole screen to fail to draw */
  const [outputs, setOutputs] = useState<Record<string, OutputFact>>(loaded.outputs ?? {})
  const [proxies, setProxies] = useState<Record<string, ProxyFact>>(loaded.proxies ?? {})
  const [tandemFacts, setTandemFacts] = useState<Record<string, TandemFact>>(loaded.tandems)
  /* files being processed or proxied right now, and how far through; a proxy that lands is
     flagged at once, since the event carries what the server read off the disk */
  const liveFiles = useLiveProgress(setProxies, setTandemFacts, setNote)
  const [remoteAfterUpload, setRemoteAfterUpload] = useState<CheckedListing | null>(null)
  /* the storage's list of tandems, as the loader read it or as the last change wrote it */
  const [storage, setStorage] = useState(loaded.storage)
  /* the first scan is what creates the manifest, so this is state and not read from the loader */
  const [hasManifest, setHasManifest] = useState(loaded.hasManifest)
  const fetcher = useSafeFetcher()

  const [seenAnswer, setSeenAnswer] = useState<unknown>(null)
  if (fetcher.data && fetcher.data !== seenAnswer) {
    setSeenAnswer(fetcher.data)
    const answered = boardAnswerSchema.safeParse(fetcher.data)
    setBusy(null)
    setUploading(null)
    if (answered.success) {
      const {
        groups: saved,
        looseFiles,
        destinations,
        outputs: freshOutputs,
        proxies: freshProxies,
        tandems: freshTandems,
        remote: freshRemote,
        uploaded,
        skipped,
        montage,
        scan: scanned,
        freed,
        imported,
        restored,
        storage: listed,
        storageProblem
      } = answered.data
      setGroups(saved)
      if (looseFiles) setLoose(looseFiles)
      if (destinations) setPlaces(destinations)
      if (freshOutputs) setOutputs(freshOutputs)
      if (freshProxies) setProxies(freshProxies)
      if (freshTandems) setTandemFacts(freshTandems)
      /* an upload answers with the listing taken right after it */
      if (freshRemote) setRemoteAfterUpload(freshRemote)
      /* a scan may be the first thing that ever put a manifest there */
      if (scanned) setHasManifest(true)
      if (freed) onFreed(freed.groupId)
      if (listed) setStorage({ ...listed, problem: null })
      const said =
        uploaded !== undefined
          ? uploadedNote(uploaded, skipped)
          : montage
            ? montageNote(montage)
            : scanned
              ? scanNote(scanned)
              : imported
                ? importNote(imported)
                : freed
                  ? freedNote(freed)
                  : restored
                    ? restoredNote(restored)
                    : null
      /* the work stands even when the list could not follow it, and that is said alongside */
      setNote(storageProblem ? [said, storageProblem].filter(Boolean).join(' · ') : said)
    } else {
      const refused = refusalSchema.safeParse(fetcher.data)
      if (refused.success) setNote(refused.data.globalErrors?.[0] ?? 'Request failed')
    }
  }

  /* Arriving while something is being processed: its answer is the board as it ends, asked for
     once. Asking is a request to the machine, which is what an effect is for; the guard is what
     keeps a re-render from asking again. */
  const askedToWait = useRef(false)
  useEffect(() => {
    if (!running || askedToWait.current) return
    askedToWait.current = true
    fetcher.submit({ url: '/api/manifest', actionArgs: { intent: 'process-wait' } })
  }, [running, fetcher])

  /* Every edit is the same three steps — clear the last message, mark what is working, ask the
     server — so they are written once. `label` is what `busy` is compared against to decide which
     button says it is running. */
  const manifest = (actionArgs: ManifestArgs) =>
    fetcher.submit({ url: '/api/manifest', actionArgs })
  const send = (label: string, actionArgs: ManifestArgs) => {
    setNote(null)
    setBusy(label)
    manifest(actionArgs)
  }
  const scan = () => {
    setNote(null)
    setBusy('scan')
    fetcher.submit({ url: '/api/scan', actionArgs: {} })
  }

  /* how many clips have their small copy, out of the ones that want one */
  const proxyFacts = Object.values(proxies)
  const proxyProgress = {
    ready: proxyFacts.filter((f) => f.state !== 'none').length,
    waiting: proxyFacts.filter((f) => f.state === 'none').length,
    total: proxyFacts.length
  }

  return {
    groups,
    setGroups,
    updateGroups,
    loose,
    setLoose,
    places,
    setPlaces,
    outputs,
    proxies,
    proxyProgress,
    liveFiles,
    tandemFacts,
    remoteAfterUpload,
    storage,
    hasManifest,
    busy,
    setBusy,
    note,
    setNote,
    uploading,
    setUploading,
    manifest,
    send,
    scan,
    scanning: busy === 'scan'
  }
}

export { useBoardState }
export type { CheckedListing, ManifestArgs, Storage }
