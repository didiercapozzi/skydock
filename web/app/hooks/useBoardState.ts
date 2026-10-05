import { t } from '@lingui/core/macro'
import { boardAnswerSchema, isVideoFile, ORIGINAL_MISSING } from '@skydock/scripts'
import type {
  JumpMoments,
  OutputFact,
  ProxyFact,
  MontageEntry,
  MontageLost,
  MontageFact
} from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { useCameraLanded } from './liveStore'
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
import { sameJson } from '../helpers/sameJson'
import type { actionArgs as manifestArgs } from '../routes/api.manifest'
import { useGroups } from './useJumps'
import { useLiveProgress } from './useLiveProgress'

type ManifestArgs = z.infer<typeof manifestArgs>

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

const LOOK_EVERY_MS = 2000

const useBoardState = (loaded: Loaded, onFreed: (groupId: string) => void) => {
  const { groups, setGroups, updateGroups, saving } = useGroups(loaded.groups)
  const running = loaded.processing
  const [busy, setBusy] = useState<string | null>(
    running
      ? running.groupIds.length === 1
        ? (running.groupIds[0] ?? 'process')
        : 'process'
      : null
  )
  const [spoken, setSpoken] = useState<{ text: string; problem: boolean } | null>(
    running
      ? { text: t`Still processing — the board updates itself when it is done`, problem: false }
      : null
  )
  const setNote = (text: string | null) => setSpoken(text ? { text, problem: false } : null)
  const setProblem = (text: string) => setSpoken({ text, problem: true })
  const [loose, setLoose] = useState<ManifestFile[]>(loaded.looseFiles)
  const [places, setPlaces] = useState<Destination[]>(loaded.destinations)
  const [upload, setUpload] = useState(loaded.uploading)
  const [outputs, setOutputs] = useState<Record<string, OutputFact>>(loaded.outputs ?? {})
  const [proxies, setProxies] = useState<Record<string, ProxyFact>>(loaded.proxies ?? {})
  const [montageFacts, setMontageFacts] = useState<Record<string, MontageFact>>(loaded.montages)
  const foundJump = (fileId: string, moments: JumpMoments | null) => {
    const found = (file: ManifestFile) => (file.id === fileId ? { ...file, moments } : file)
    setGroups((now) =>
      now.map((g) =>
        g.files.some((f) => f.id === fileId) ? { ...g, files: g.files.map(found) } : g
      )
    )
    setLoose((now) => now.map(found))
  }
  const live = useLiveProgress(setProxies, setMontageFacts, setSpoken, foundJump)
  const [remoteAfterUpload, setRemoteAfterUpload] = useState<CheckedListing | null>(null)
  const [storage, setStorage] = useState(loaded.storage)
  const [storageLoaded, setStorageLoaded] = useState(loaded.storage)
  if (loaded.storage !== storageLoaded) {
    setStorageLoaded(loaded.storage)
    setStorage(loaded.storage)
  }
  const [hasManifest, setHasManifest] = useState(loaded.hasManifest)
  const fetcher = useSafeFetcher()
  const jobs = useSafeFetcher()

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
        wentBack,
        storage: listed,
        storageProblem
      } = answered.data
      setGroups(saved)
      if (looseFiles) setLoose(looseFiles)
      if (destinations) setPlaces(destinations)
      if (freshOutputs) setOutputs(freshOutputs)
      if (freshProxies) setProxies(freshProxies)
      if (freshMontages) setMontageFacts(freshMontages)
      if (freshRemote) setRemoteAfterUpload(freshRemote)
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
                                        : wentBack
                                          ? t`The board is back as it was — Settings › History can undo this too.`
                                          : null
      if (!quiet && storageProblem) setProblem([said, storageProblem].filter(Boolean).join(' · '))
      else if (!quiet) setNote(said)
    } else {
      const refused = refusalSchema.safeParse(data)
      if (refused.success) setProblem(refused.data.globalErrors?.[0] ?? t`Request failed`)
    }
  }

  const [seenAnswer, setSeenAnswer] = useState<unknown>(null)
  if (fetcher.data && fetcher.data !== seenAnswer) {
    setSeenAnswer(fetcher.data)
    setBusy(null)
    adopt(fetcher.data)
  }
  const [seenJob, setSeenJob] = useState<unknown>(null)
  if (jobs.data && jobs.data !== seenJob) {
    setSeenJob(jobs.data)
    setUpload(null)
    adopt(jobs.data)
  }

  const arrivals = useSafeFetcher()
  const [seenArrivals, setSeenArrivals] = useState<unknown>(null)
  if (arrivals.data && arrivals.data !== seenArrivals) {
    setSeenArrivals(arrivals.data)
    adopt(arrivals.data, true)
  }
  const landed = useCameraLanded()
  const lookedAt = useRef({ landed: '', at: 0 })
  useEffect(() => {
    if (landed.endsWith(':0') || !landed || landed === lookedAt.current.landed) return
    if (arrivals.state !== 'idle' || Date.now() - lookedAt.current.at < LOOK_EVERY_MS) return
    lookedAt.current = { landed, at: Date.now() }
    arrivals.submit({ url: '/api/manifest', actionArgs: { intent: 'imported' } })
  }, [landed, arrivals])

  const looks = useSafeFetcher()
  const [seenLook, setSeenLook] = useState<unknown>(null)
  if (looks.data && looks.data !== seenLook) {
    setSeenLook(looks.data)
    const found = boardAnswerSchema.safeParse(looks.data)
    const same =
      found.success &&
      sameJson(found.data.groups, groups) &&
      sameJson(found.data.looseFiles ?? [], loose) &&
      sameJson(found.data.destinations ?? [], places)
    if (!same) adopt(looks.data, true)
  }
  const occupied = fetcher.state !== 'idle' || jobs.state !== 'idle' || saving
  const [peer, setPeer] = useState(0)
  const channel = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const made = new BroadcastChannel('skydock-board')
    made.onmessage = () => setPeer((n) => n + 1)
    channel.current = made
    return () => {
      made.close()
      channel.current = null
    }
  }, [])
  const wasOccupied = useRef(false)
  useEffect(() => {
    if (wasOccupied.current && !occupied) channel.current?.postMessage('saved')
    wasOccupied.current = occupied
  }, [occupied])
  const lookedAfter = useRef<string | null>(null)
  const changedKey = peer > 0 ? `${live.changed ?? ''}|${peer}` : live.changed
  useEffect(() => {
    if (!changedKey || lookedAfter.current === changedKey) return
    if (occupied || looks.state !== 'idle') return
    lookedAfter.current = changedKey
    looks.submit({ url: '/api/manifest', actionArgs: { intent: 'look-at-board' } })
  }, [changedKey, occupied, looks])

  const ends = useSafeFetcher()
  const [seenEnd, setSeenEnd] = useState<unknown>(null)
  if (ends.data && ends.data !== seenEnd) {
    setSeenEnd(ends.data)
    adopt(ends.data)
  }
  const askedAfter = useRef(0)
  useEffect(() => {
    const ended = live.ended
    if (!ended || askedAfter.current === ended.seq) return
    askedAfter.current = ended.seq
    ends.submit({
      url: '/api/manifest',
      actionArgs: {
        intent: 'camera-copied',
        cameraCopied: {
          camera: ended.camera,
          state: ended.state,
          copied: ended.copied,
          skipped: ended.skipped,
          ...(ended.reason ? { reason: ended.reason } : {}),
          ...(ended.unreadable?.length ? { unreadable: ended.unreadable } : {})
        }
      }
    })
  }, [live.ended, ends])

  const askedToWait = useRef(false)
  useEffect(() => {
    if (!running || askedToWait.current) return
    askedToWait.current = true
    fetcher.submit({ url: '/api/manifest', actionArgs: { intent: 'process-wait' } })
  }, [running, fetcher])

  const askedToWaitUpload = useRef(false)
  useEffect(() => {
    if (!loaded.uploading || askedToWaitUpload.current) return
    askedToWaitUpload.current = true
    jobs.submit({ url: '/api/manifest', actionArgs: { intent: 'upload-wait' } })
  }, [loaded.uploading, jobs])

  const sendUpload = (going: { key: string; label: string }, actionArgs: ManifestArgs) => {
    if (upload) return
    setNote(null)
    setUpload(going)
    jobs.submit({ url: '/api/manifest', actionArgs })
  }
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
  const firstScan = () => {
    setNote(null)
    setBusy('scan')
    fetcher.submit({ url: '/api/scan', actionArgs: { cameras: false } })
  }

  const proxyFacts = Object.values(proxies)
  const clips = [...groups.flatMap((g) => g.files), ...loose].filter(
    (f) => isVideoFile(f.path) && f.id && !f.freed && proxies[f.path]?.reason !== ORIGINAL_MISSING
  )
  const jumpProgress = {
    read: clips.filter((f) => f.moments !== undefined || (f.id && live.unreadable.has(f.id)))
      .length,
    total: clips.length
  }
  const proxyProgress = {
    ready: proxyFacts.filter((f) => f.state !== 'none').length,
    waiting: proxyFacts.filter((f) => f.state === 'none' && !f.reason).length,
    total: proxyFacts.length
  }

  return {
    groups,
    setGroups,
    updateGroups,
    saving,
    loose,
    setLoose,
    places,
    setPlaces,
    outputs,
    proxies,
    proxyProgress,
    jumpProgress,
    cameras: live.cameras,
    knownCameras: live.known,
    cameraPrompts: live.prompts,
    disk: live.disk,
    montageFacts,
    remoteAfterUpload,
    storage,
    hasManifest,
    busy,
    setBusy,
    note: spoken?.text ?? null,
    noteIsProblem: spoken?.problem ?? false,
    setNote,
    setProblem,
    uploading: upload?.key ?? null,
    uploadLabel: upload?.label ?? null,
    sendUpload,
    manifest,
    send,
    scan,
    firstScan,
    scanning: busy === 'scan'
  }
}

export { refusalSchema, useBoardState }
export type { CheckedListing, Storage }
