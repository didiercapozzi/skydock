import { t } from '@lingui/core/macro'
import { boardAnswerSchema } from '@skydock/scripts'
import type {
  OutputFact,
  ProxyFact,
  MontageEntry,
  MontageLost,
  MontageFact
} from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import {
  broughtBackNote,
  copiedBackNote,
  fromBinNote,
  copiedNote,
  freedNote,
  freedPlaceNote,
  importNote,
  cameraNote,
  montageNote,
  resetNote,
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

type Storage = {
  dir: string
  montages: MontageEntry[]
  lost: MontageLost
  problem: string | null
} | null

type Loaded = {
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  destinations: Destination[]
  outputs: Record<string, OutputFact>
  proxies: Record<string, ProxyFact>
  montages: Record<string, MontageFact>
  storage: Storage
  hasManifest: boolean
  processing: { groupIds: string[] } | null
  uploading: { key: string; label: string } | null
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
  /* A page loaded mid-processing takes the work up where the server has it: that one montage says it
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
    running ? t`Still processing — the board updates itself when it is done` : null
  )
  const [loose, setLoose] = useState<ManifestFile[]>(loaded.looseFiles)
  const [places, setPlaces] = useState<Destination[]>(loaded.destinations)
  /* A page loaded mid-upload takes it up the same way: the upload shows as going, no Upload is
     offered on top of it, and the board asks to hear when it is done. */
  const [upload, setUpload] = useState(loaded.uploading)
  const [cancelling, setCancelling] = useState(false)
  /* `?? {}` because a board with no manifest has no clips to know anything about, and one map
     arriving empty is not a reason for the whole screen to fail to draw */
  const [outputs, setOutputs] = useState<Record<string, OutputFact>>(loaded.outputs ?? {})
  const [proxies, setProxies] = useState<Record<string, ProxyFact>>(loaded.proxies ?? {})
  const [montageFacts, setMontageFacts] = useState<Record<string, MontageFact>>(loaded.montages)
  /* files being processed or proxied right now, and how far through; a proxy that lands is
     flagged at once, since the event carries what the server read off the disk */
  const live = useLiveProgress(setProxies, setMontageFacts, setNote)
  const liveFiles = live.files
  const [remoteAfterUpload, setRemoteAfterUpload] = useState<CheckedListing | null>(null)
  /* the storage's list of montages, as the loader read it or as the last change wrote it */
  const [storage, setStorage] = useState(loaded.storage)
  /* the first scan is what creates the manifest, so this is state and not read from the loader */
  const [hasManifest, setHasManifest] = useState(loaded.hasManifest)
  const fetcher = useSafeFetcher()
  /* An upload goes by a request of its own, and so does stopping it or waiting for it: an edit made
     meanwhile — a clip played, a file moved — neither drops it nor reads as its end. */
  const jobs = useSafeFetcher()

  /* a board answer, whichever request it answers */
  /* `quiet`: a look taken for the eyes only — the board as it is, with nothing said about it */
  const adopt = (data: unknown, quiet = false) => {
    const answered = boardAnswerSchema.safeParse(data)
    if (answered.success) {
      const {
        groups: saved,
        looseFiles,
        destinations,
        outputs: freshOutputs,
        proxies: freshProxies,
        montages: freshMontages,
        remote: freshRemote,
        uploaded,
        skipped,
        montage,
        scan: scanned,
        freed,
        freedPlace,
        processCancelled,
        uploadCancelled,
        imported,
        restored,
        copied: copiedFiles,
        cameraCopied,
        reset: resetTo,
        played,
        copiedBack,
        broughtBack,
        fromBin,
        storage: listed,
        storageProblem
      } = answered.data
      setGroups(saved)
      if (looseFiles) setLoose(looseFiles)
      if (destinations) setPlaces(destinations)
      if (freshOutputs) setOutputs(freshOutputs)
      if (freshProxies) setProxies(freshProxies)
      if (freshMontages) setMontageFacts(freshMontages)
      /* an upload answers with the listing taken right after it */
      if (freshRemote) setRemoteAfterUpload(freshRemote)
      /* a scan may be the first thing that ever put a manifest there */
      if (scanned) setHasManifest(true)
      if (freed) onFreed(freed.groupId)
      if (listed) setStorage({ ...listed, problem: null })
      const playing = played?.filename ?? ''
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
                  : freedPlace
                    ? freedPlaceNote(freedPlace)
                    : processCancelled
                      ? t`Processing cancelled. What was finished stays; the rest is left to process again.`
                      : uploadCancelled
                        ? t`Upload cancelled — nothing was recorded; what already went up is found there next time.`
                        : restored
                          ? restoredNote(restored)
                          : copiedFiles
                            ? copiedNote(copiedFiles)
                            : resetTo
                              ? resetNote(resetTo)
                              : cameraCopied
                                ? cameraNote(cameraCopied)
                                : played
                                  ? t`${playing} is playing in this machine’s own player`
                                  : copiedBack
                                    ? copiedBackNote(copiedBack)
                                    : broughtBack
                                      ? broughtBackNote(broughtBack)
                                      : fromBin
                                        ? fromBinNote(fromBin)
                                        : null
      /* the work stands even when the list could not follow it, and that is said alongside */
      if (!quiet)
        setNote(storageProblem ? [said, storageProblem].filter(Boolean).join(' · ') : said)
    } else {
      const refused = refusalSchema.safeParse(data)
      if (refused.success) setNote(refused.data.globalErrors?.[0] ?? t`Request failed`)
    }
  }

  const [seenAnswer, setSeenAnswer] = useState<unknown>(null)
  if (fetcher.data && fetcher.data !== seenAnswer) {
    setSeenAnswer(fetcher.data)
    setBusy(null)
    adopt(fetcher.data)
  }
  /* only the upload's own answer — sent, refused, cancelled, or waited for — ends it here */
  const [seenJob, setSeenJob] = useState<unknown>(null)
  if (jobs.data && jobs.data !== seenJob) {
    setSeenJob(jobs.data)
    setUpload(null)
    setCancelling(false)
    adopt(jobs.data)
  }

  /* While a camera is copied off, each file it brings goes on the board as it lands, and the board
     looks again after each — quietly, on a request of its own, so that nothing said and nothing
     under way is disturbed by it. One look at a time: the next file brings the next one. */
  const arrivals = useSafeFetcher()
  const [seenArrivals, setSeenArrivals] = useState<unknown>(null)
  if (arrivals.data && arrivals.data !== seenArrivals) {
    setSeenArrivals(arrivals.data)
    adopt(arrivals.data, true)
  }
  /* by camera as well as by count: a second camera's fifth file is not the first camera's fifth */
  const landed =
    live.camera && live.camera.copied > 0 ? `${live.camera.camera}:${live.camera.copied}` : ''
  const lookedAt = useRef('')
  useEffect(() => {
    if (!landed || landed === lookedAt.current || arrivals.state !== 'idle') return
    lookedAt.current = landed
    /* the same look the board takes after files dropped in, taken quietly */
    arrivals.submit({ url: '/api/manifest', actionArgs: { intent: 'imported' } })
  }, [landed, arrivals])

  /* A camera's copy has ended — its files are copied and scanned on the machine — so the board asks
     for itself again, and hears what came off. A request to the machine is what an effect is for;
     the number of the ending is the guard, so each ending asks once. */
  const askedAfter = useRef(0)
  useEffect(() => {
    const ended = live.ended
    if (!ended || askedAfter.current === ended.seq) return
    askedAfter.current = ended.seq
    fetcher.submit({
      url: '/api/manifest',
      actionArgs: {
        intent: 'camera-copied',
        cameraCopied: {
          camera: ended.camera,
          state: ended.state,
          copied: ended.copied,
          skipped: ended.skipped,
          ...(ended.reason ? { reason: ended.reason } : {})
        }
      }
    })
  }, [live.ended, fetcher])

  /* Arriving while something is being processed: its answer is the board as it ends, asked for
     once. Asking is a request to the machine, which is what an effect is for; the guard is what
     keeps a re-render from asking again. */
  const askedToWait = useRef(false)
  useEffect(() => {
    if (!running || askedToWait.current) return
    askedToWait.current = true
    fetcher.submit({ url: '/api/manifest', actionArgs: { intent: 'process-wait' } })
  }, [running, fetcher])

  /* Arriving while something is being uploaded: the same, for the upload. */
  const askedToWaitUpload = useRef(false)
  useEffect(() => {
    if (!loaded.uploading || askedToWaitUpload.current) return
    askedToWaitUpload.current = true
    jobs.submit({ url: '/api/manifest', actionArgs: { intent: 'upload-wait' } })
  }, [loaded.uploading, jobs])

  /* An upload asked for: one at a time, so none is sent while another is going. */
  const sendUpload = (going: { key: string; label: string }, actionArgs: ManifestArgs) => {
    if (upload) return
    setNote(null)
    setUpload(going)
    jobs.submit({ url: '/api/manifest', actionArgs })
  }
  /* stopped at any moment; the answer comes once it has stopped */
  const cancelUpload = () => {
    if (!upload || cancelling) return
    setCancelling(true)
    jobs.submit({ url: '/api/manifest', actionArgs: { intent: 'cancel-upload' } })
  }

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
    /* a clip whose proxy failed is not waiting for one */
    waiting: proxyFacts.filter((f) => f.state === 'none' && !f.reason).length,
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
    /* a camera being copied off right now, as it goes */
    cameraCopy: live.camera,
    cameras: live.cameras,
    disk: live.disk,
    /* how far through the one file a drop is copying in right now */
    importing: live.importing,
    montageFacts,
    remoteAfterUpload,
    storage,
    hasManifest,
    busy,
    setBusy,
    note,
    setNote,
    /* the key of what is being uploaded, and how the board names it */
    uploading: upload?.key ?? null,
    uploadLabel: upload?.label ?? null,
    cancelling,
    sendUpload,
    cancelUpload,
    manifest,
    send,
    scan,
    scanning: busy === 'scan'
  }
}

export { refusalSchema, useBoardState }
export type { CheckedListing, ManifestArgs, Storage }
