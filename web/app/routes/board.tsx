import {
  destinationSchema,
  ensureNasSession,
  fileStatus,
  getOutputDir,
  hasCompletePassenger,
  isoDay,
  listRemoteFiles,
  loadManifest,
  manifestFileSchema,
  manifestGroupSchema,
  statProcessedOutputs,
  statProxies,
  statTandemArtifacts,
  uploadGate
} from '@skydock/scripts'
import type { OutputFact, ProxyFact, RemoteListing } from '@skydock/scripts'
import { Fragment, useEffect, useState } from 'react'
import { z } from 'zod'
import { Go, Mini, Seg } from '../components/buttons'
import { Callout } from '../components/callout'
import { ComparisonDialog } from '../components/comparison-dialog'
import { ConnectionDialog } from '../components/connection-dialog'
import { DayRow } from '../components/day-row'
import { FileList, KindBadges } from '../components/file-list'
import type { Kind } from '../components/file-list'
import { NasFolderBrowser } from '../components/nas-folder-browser'
import { PlacesTree, placeKey, placeLabel, passengerOf } from '../components/places-tree'
import type { Place } from '../components/places-tree'
import { PreviewDrawer } from '../components/preview-drawer'
import {
  DeliveredCards,
  PassengerCard,
  TandemActions,
  UploadStrip
} from '../components/tandem-card'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import { formatTime, minFileMtime } from '../components/utils'
import { useSafeFetcher } from '../helpers/routing'
import { setFileView, useFileView } from '../hooks/useFileView'
import { useGroups } from '../hooks/useJumps'
import { LOOSE, usePreview } from '../hooks/usePreview'
import { useTheme, setTheme } from '../hooks/useTheme'
import { useUploadProgress } from '../hooks/useUploadProgress'
import type { actionArgs as manifestArgs } from './api.manifest'
import type { Route } from './+types/board'

/* every board edit goes to the same endpoint; this is what that endpoint accepts, taken from the
   endpoint itself rather than restated here */
type ManifestArgs = z.infer<typeof manifestArgs>

const TANDEMS = 'Tandems'

const VIEWS = [
  ['rows', 'Rows'],
  ['grid', 'Thumbnails']
] as const

/* Auto is what the machine says. The other two exist because that signal is invisible and is not
   always the machine you think it is — a browser preview inside an editor follows the editor's
   theme, not the desktop's, which is enough to make two windows of the same design disagree. */
const THEMES = [
  ['auto', 'Auto'],
  ['light', 'Light'],
  ['dark', 'Dark']
] as const

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

/* a listing plus when it was taken, so the newest of several answers wins */
type CheckedListing = RemoteListing & { at: number }

/* what a tandem's folder holds, taken fresh by the server every time it answers — the film is
   rendered outside SkyDock, so nothing else can know it has appeared */
const tandemFactSchema = z.object({
  project: z.boolean(),
  projectPath: z.string(),
  film: z.object({ size: z.number(), mtime: z.number() }).nullable(),
  baseName: z.string()
})

type TandemFacts = Record<string, z.infer<typeof tandemFactSchema>>

const scanResultSchema = z.object({
  added: z.number(),
  removed: z.number(),
  moved: z.number(),
  unchanged: z.boolean(),
  fileCount: z.number(),
  groupCount: z.number()
})

/* what a scan found, in the words the board uses for it */
/* A template that came without its music and logos still produces a project, and the holes only
   show up at the render — so they are said out loud the moment the montage is made. */
const montageNote = ({
  clips,
  missingAssets,
  opened,
  openCommand,
  openReason
}: {
  clips: number
  missingAssets: string[]
  opened?: boolean
  openCommand?: string
  openReason?: string
}) => {
  /* naming the command is what turns "nothing happened" into something that can be looked into:
     it is the one part of this the board knows and the person at the screen cannot see */
  const with_ = openCommand ? ` with ${openCommand}` : ''
  if (clips === 0 && opened) return `Opening it${with_}…`
  const made = `Montage ready — ${clips} clip${clips === 1 ? '' : 's'} on the timeline`
  const holes =
    missingAssets.length === 0
      ? ''
      : `, but the template is missing ${missingAssets.length} file${
          missingAssets.length === 1 ? '' : 's'
        }: ${missingAssets.join(', ')}`
  /* whether the editor came up is part of what just happened, not a separate thing to go and check */
  const editor = opened ? ` · opening it${with_}` : openReason ? ` · ${openReason}` : ''
  return `${made}${holes}${editor}`
}

const scanNote = (scan: z.infer<typeof scanResultSchema>) =>
  scan.unchanged
    ? `Scan: nothing new — ${scan.fileCount} files in ${scan.groupCount} jumps`
    : `Scan: +${scan.added} new, −${scan.removed} gone, ${scan.moved} moved — ${scan.fileCount} files in ${scan.groupCount} jumps`

const loader = async (_args: Route.LoaderArgs) => {
  const outputDir = getOutputDir()
  let manifest = null
  try {
    manifest = loadManifest(`${outputDir}/manifest.json`)
  } catch {
    manifest = null
  }
  /* a session file is not a session: ask DSM whether the id still works (and let it refresh
     itself if it does not), so the board never shows a connection that is already dead */
  let nas: {
    connected: boolean
    hostname: string | null
    defaultFolder: string | null
    backupFolder: string | null
  } = { connected: false, hostname: null, defaultFolder: null, backupFolder: null }
  /* the first look at the NAS happens here rather than on mount: the page then arrives already
     correct, and the Refresh button re-runs the same check through /api/remote-files */
  let remote: { dirs: string[]; sizes: Record<string, number | null>; at: number } | null = null
  try {
    const session = await ensureNasSession()
    if (session) {
      nas = {
        connected: true,
        hostname: session.hostname,
        defaultFolder: session.defaultFolder ?? null,
        backupFolder: session.backupFolder ?? null
      }
      if (manifest) remote = await listRemoteFiles(manifest, session)
    }
  } catch {
    nas = { connected: false, hostname: null, defaultFolder: null, backupFolder: null }
  }
  const grouped = new Set(
    (manifest?.groups ?? []).flatMap((g) => g.files.map((f) => f.id ?? f.path))
  )
  const looseFiles = (manifest?.files ?? []).filter((f) => !grouped.has(f.id ?? f.path))
  return {
    groups: manifest?.groups ?? [],
    looseFiles,
    destinations: manifest?.destinations ?? [],
    /* what the disk says about each processed copy — the record alone cannot know someone
       emptied processed/ (RULES, File status) */
    outputs: manifest ? statProcessedOutputs(manifest) : {},
    /* which clips have their small copy yet — built behind the scan, so this is a fresh look
       every time the board is drawn (RULES, The workflow) */
    proxies: manifest ? statProxies(manifest, outputDir) : {},
    /* and what each tandem's folder holds: nothing tells SkyDock when the editor finishes, so a
       film is only ever noticed by looking (RULES, Delivery) */
    tandems: manifest ? statTandemArtifacts(manifest, outputDir) : {},
    remote,
    hasManifest: manifest !== null,
    nas
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const pad = (n: number) => String(n).padStart(2, '0')

/* local calendar day, and a label built without Intl so the server and the client agree */
const dayOfMtime = (mtime: number) => {
  const d = new Date(mtime * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* A jump is filed under the day it started, which the jump carries. It is not worked out from the
   files here: a file dragged in from another day joins the jump, and a jump that swallowed one
   would otherwise jump to that file's day and take everything in it along (RULES, Jumps). Only a
   jump with no day recorded falls back to its earliest file. */
const dayOf = (group: ManifestGroup) => isoDay(group.day) || dayOfMtime(minFileMtime(group.files))

const dayOfFile = (file: ManifestFile) => dayOfMtime(file.mtime)

const dayLabel = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  return `${date} ${MONTHS[month - 1]} ${year}`
}

/* which card a jump is shown in — not the same question as whether it is a passenger's tandem,
   which needs a name and is what the server gates montage and delivery on */
const inTandemsCard = (group: ManifestGroup) => group.destination === TANDEMS

/* the name the file has once a copy exists — what goes to the NAS and what the passenger sees.
   A file whose source moved on shows its camera name again, because the name it will get is
   derived from the time and the crop that just changed. */
const baseName = (full: string) => full.slice(full.lastIndexOf('/') + 1)

const Board = ({ loaderData }: Route.ComponentProps) => {
  const { groups, setGroups, updateGroups } = useGroups(loaderData.groups)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string[]>([])
  const [draggedFiles, setDraggedFiles] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [pickedFiles, setPickedFiles] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  /* which place fills the pane, and which of its days is open — one at a time, remembered per
     place so switching back lands where you left it */
  const [place, setPlace] = useState<Place>({ kind: 'sort' })
  const [openDays, setOpenDays] = useState<Record<string, string | null>>({})
  /* Folding jumps is a standing choice, not something remembered per jump: collapse them once and
     every day opened afterwards opens folded too. `foldJumps` is that choice and `unfolded` holds
     the jumps told to differ from it, so one jump opened by hand does not undo the rest. */
  const [foldJumps, setFoldJumps] = useState(false)
  const [unfolded, setUnfolded] = useState<string[]>([])
  /* videos, photos or both: one filter for the whole board, so the badge pressed in a dropzone is
     still pressed in a tandem */
  const [kind, setKind] = useState<Kind>('all')
  const [query, setQuery] = useState('')
  const [overTarget, setOverTarget] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  /* which tandem's name is being typed — a named passenger reads as a title, not a form */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [loose, setLoose] = useState<ManifestFile[]>(loaderData.looseFiles)
  const [places, setPlaces] = useState<Destination[]>(loaderData.destinations)
  /* one value, so two dialogs can never be open at once; `destination` set means the folder is
     being chosen for that card rather than as the global default */
  const [dialog, setDialog] = useState<
    null | { kind: 'connect' } | { kind: 'folder'; destination?: string; target?: 'backup' }
  >(null)
  const [dialogOpenedOn, setDialogOpenedOn] = useState<unknown>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Record<string, OutputFact>>(loaderData.outputs ?? {})
  /* `?? {}` because a board with no manifest has no clips to know anything about, and one map
     arriving empty is not a reason for the whole screen to fail to draw */
  const [proxies, setProxies] = useState<Record<string, ProxyFact>>(loaderData.proxies ?? {})
  const [tandemFacts, setTandemFacts] = useState<TandemFacts>(loaderData.tandems)
  const [remoteAfterUpload, setRemoteAfterUpload] = useState<CheckedListing | null>(null)
  /* the first scan is what creates the manifest, so this is state and not read from the loader */
  const [hasManifest, setHasManifest] = useState(loaderData.hasManifest)
  const view = useFileView()
  const theme = useTheme()
  const fetcher = useSafeFetcher()
  /* NAS answers must not land in the groups effect below, so they get their own fetcher */
  const nasFetcher = useSafeFetcher()
  /* what the NAS currently holds, so a file deleted over there stops reading as uploaded */
  const remoteFetcher = useSafeFetcher()
  /* A lone file's crop goes through the same save as everything else, on the registry entry — and
     the board's own copy has to be updated with it. `updateGroups` refreshes `groups` optimistically
     but answers on its own fetcher, so nothing here ever hears about the saved loose files: without
     this the crop was invisible until a reload, and re-opening the preview read back the stale
     uncropped file. */
  const cropLoneFile = (
    file: ManifestFile,
    range: { cropStart: number | null; cropEnd: number | null }
  ) => {
    const cropped = { ...file, cropStart: range.cropStart, cropEnd: range.cropEnd }
    setLoose((current) => current.map((f) => (f.path === file.path ? cropped : f)))
    updateGroups(groups, [cropped])
  }
  const preview = usePreview(groups, updateGroups, cropLoneFile)
  const progress = useUploadProgress(uploading)

  /* derived, never stored: the loader is the first paint and the fetcher is the live truth */
  const nasAnswer = nasSuccessSchema.safeParse(nasFetcher.data)
  const nasConnected = nasAnswer.success ? nasAnswer.data.connected : loaderData.nas.connected
  const nasHost = nasAnswer.success ? (nasAnswer.data.hostname ?? null) : loaderData.nas.hostname
  const defaultFolder = nasAnswer.success
    ? (nasAnswer.data.defaultFolder ?? null)
    : loaderData.nas.defaultFolder
  const backupFolder = nasAnswer.success
    ? (nasAnswer.data.backupFolder ?? null)
    : loaderData.nas.backupFolder
  const nasRefused = nasErrorSchema.safeParse(nasFetcher.data)
  const nasError =
    !nasAnswer.success && nasRefused.success ? nasRefused.data.globalErrors?.[0] : undefined
  /* the dialog closes itself once a *new* answer says we are connected */
  const connectSucceeded =
    nasAnswer.success && nasAnswer.data.connected && nasFetcher.data !== dialogOpenedOn

  /* the server answers with the groups it saved, or with the reason it refused */
  useEffect(() => {
    if (!fetcher.data) return
    const answered = z
      .object({
        groups: z.array(manifestGroupSchema),
        looseFiles: z.array(manifestFileSchema).optional(),
        destinations: z.array(destinationSchema).optional(),
        outputs: z
          .record(z.string(), z.object({ exists: z.boolean(), size: z.number() }))
          .optional(),
        proxies: z
          .record(
            z.string(),
            z.object({ state: z.enum(['ready', 'own', 'none']), play: z.string() })
          )
          .optional(),
        tandems: z.record(z.string(), tandemFactSchema).optional(),
        remote: z
          .object({
            dirs: z.array(z.string()),
            sizes: z.record(z.string(), z.number().nullable()),
            at: z.number()
          })
          .optional(),
        uploaded: z.number().optional(),
        skipped: z.number().optional(),
        montage: z
          .object({
            clips: z.number(),
            missingAssets: z.array(z.string()),
            opened: z.boolean().optional(),
            openCommand: z.string().optional(),
            openReason: z.string().optional()
          })
          .optional(),
        scan: scanResultSchema.optional()
      })
      .safeParse(fetcher.data)
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
        scan: scanned
      } = answered.data
      queueMicrotask(() => {
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
        setBusy(null)
        setUploading(null)
        setNote(
          uploaded !== undefined
            ? `Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'}${
                skipped ? ` · ${skipped} already on the NAS` : ''
              }`
            : montage
              ? montageNote(montage)
              : scanned
                ? scanNote(scanned)
                : null
        )
      })
      return
    }
    const refused = z
      .object({ success: z.literal(false), globalErrors: z.array(z.string()).optional() })
      .passthrough()
      .safeParse(fetcher.data)
    queueMicrotask(() => {
      setBusy(null)
      setUploading(null)
      if (refused.success) setNote(refused.data.globalErrors?.[0] ?? 'Request failed')
    })
  }, [fetcher.data, setGroups])

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

  const scanning = busy === 'scan'
  const scan = () => {
    setNote(null)
    setBusy('scan')
    fetcher.submit({ url: '/api/scan', actionArgs: {} })
  }

  const unsorted = groups.filter((g) => !g.destination)
  const tandems = groups.filter(inTandemsCard)
  /* a loose file that carries a destination is shown inside that card, not in the sorting area —
     it is a real lone file destined for that folder (RULES, Dropzones and tandems), not something still to sort */
  const sorting = loose.filter((f) => !f.destination)
  const looseIn = (destination: string) => loose.filter((f) => f.destination === destination)

  const saveDestinations = (next: Destination[]) => {
    setPlaces(next)
    manifest({ intent: 'save-groups', groups, destinations: next })
  }

  const addPlace = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || places.some((d) => d.name === trimmed)) return
    saveDestinations([...places, { name: trimmed }])
  }

  const assign = (ids: string[], destination: string | null) => {
    if (destination && !places.some((d) => d.name === destination)) {
      saveDestinations([...places, { name: destination }])
    }
    const next = groups.map((g) =>
      ids.includes(g.id)
        ? {
            ...g,
            destination: destination ?? undefined,
            passenger: destination === TANDEMS ? (g.passenger ?? undefined) : undefined
          }
        : g
    )
    setPicked([])
    updateGroups(next)
  }

  const shiftJump = (groupId: string, anchorEpoch: number) =>
    send('shift', { intent: 'shift-group-time', groupId, anchorEpoch })

  const setPassenger = (groupId: string, firstname: string, lastname: string) => {
    const next = groups.map((g) =>
      g.id === groupId
        ? { ...g, passenger: firstname || lastname ? { firstname, lastname } : undefined }
        : g
    )
    updateGroups(next)
  }

  const openConnect = () => {
    setDialogOpenedOn(nasFetcher.data)
    setDialog({ kind: 'connect' })
  }

  const connect = (host: string, user: string, password: string) =>
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'connect', host, user, password } })

  const disconnect = () =>
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'disconnect' } })

  /* the two session folders — where uploads go and where the originals are kept — go through the
     NAS session; a destination's own folder is part of the workspace, so it is saved with the
     destinations list like any other board edit */
  const chooseFolder = (path: string, destination?: string, target?: 'backup') => {
    if (destination === undefined) {
      nasFetcher.submit({
        url: '/api/nas',
        actionArgs: { intent: 'select-folder', path, kind: target ?? 'default' }
      })
    } else {
      const known = places.some((d) => d.name === destination)
      saveDestinations(
        known
          ? places.map((d) => (d.name === destination ? { ...d, path } : d))
          : [...places, { name: destination, path }]
      )
    }
    setDialog(null)
  }

  const folderFor = (destination: string) => {
    const place = places.find((d) => d.name === destination)
    if (place?.path) return place.path
    return defaultFolder ? `${defaultFolder}/${destination}` : null
  }

  /* the client opens whichever dialog is missing rather than firing a request the server would
     only refuse — but the server still decides, so the client never guesses a path */
  const requestUpload = (scope: { groupIds?: string[]; destination?: string }, key: string) => {
    if (!nasConnected) {
      openConnect()
      return
    }
    if (scope.destination && !folderFor(scope.destination)) {
      setDialog({ kind: 'folder', destination: scope.destination })
      return
    }
    if (!scope.destination && !defaultFolder) {
      setDialog({ kind: 'folder' })
      return
    }
    setUploading(key)
    send(key, { intent: 'upload-group', ...scope })
  }

  const createMontage = (group: ManifestGroup) =>
    send(group.id, { intent: 'montage', groupId: group.id })

  const openMontage = (group: ManifestGroup) =>
    send(`open:${group.id}`, { intent: 'open-montage', groupId: group.id })

  /* the same shape as an upload: open whichever choice is missing rather than firing a request the
     server would only refuse. The backup folder has no fallback — putting the rushes in a
     passenger's folder is the failure keeping them apart exists to prevent. */
  const deliver = (group: ManifestGroup) => {
    if (!nasConnected) {
      openConnect()
      return
    }
    if (!defaultFolder) {
      setDialog({ kind: 'folder' })
      return
    }
    if (!backupFolder) {
      setDialog({ kind: 'folder', target: 'backup' })
      return
    }
    const key = `deliver:${group.id}`
    setUploading(key)
    send(key, { intent: 'deliver', groupId: group.id })
  }

  /* two jumps that turn out to be one: the server merges them and answers with the saved list */
  const mergeTwo = (leftId: string, rightId: string, anchorEpoch: number) => {
    setComparing(false)
    setPicked([])
    send('merge', { intent: 'merge-groups', leftId, rightId, anchorEpoch })
  }

  /* files leave their jump and are re-filed server-side, so the answer is the truth.
     `newGroup` gathers them into a jump of their own — what a tandem needs, since the passenger
     name lives on a group; without it the files would land as lone files and fall back to the
     sorting area, which is not what dropping them on Tandems means. */
  const moveFiles = (
    ids: string[],
    where: { destination?: string | null; targetGroupId?: string; newGroup?: boolean }
  ) => {
    if (ids.length === 0) return
    setPickedFiles([])
    setAnchor(null)
    send('move', {
      intent: 'move-files',
      fileIds: ids,
      ...(where.targetGroupId ? { targetGroupId: where.targetGroupId } : {}),
      ...(where.destination ? { destination: where.destination } : {}),
      ...(where.newGroup ? { newGroup: true } : {})
    })
  }

  /* plain click previews while nothing is picked, and extends the picking once it started */
  const clickFile = (
    file: ManifestFile,
    lane: ManifestFile[],
    e: React.MouseEvent,
    onPreview: () => void
  ) => {
    const id = file.id
    if (!id) {
      onPreview()
      return
    }
    const ids = lane.flatMap((f) => (f.id ? [f.id] : []))
    if (e.shiftKey && anchor && ids.includes(anchor)) {
      const from = ids.indexOf(anchor)
      const to = ids.indexOf(id)
      const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1)
      setPickedFiles([...new Set([...pickedFiles, ...range])])
      return
    }
    if (e.ctrlKey || e.metaKey || pickedFiles.length > 0) {
      setPickedFiles(
        pickedFiles.includes(id) ? pickedFiles.filter((x) => x !== id) : [...pickedFiles, id]
      )
      setAnchor(id)
      return
    }
    setAnchor(id)
    onPreview()
  }

  const clearFiles = () => {
    setPickedFiles([])
    setAnchor(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      /* never steal Delete or Backspace from the passenger name fields */
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      /* while comparing, Escape closes the dialog and nothing else reaches the board */
      if (comparing) {
        if (e.key === 'Escape') queueMicrotask(() => setComparing(false))
        return
      }
      if (e.key === 'Escape') {
        queueMicrotask(clearFiles)
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (pickedFiles.length === 0) return
      e.preventDefault()
      queueMicrotask(() => moveFiles(pickedFiles, { destination: null }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* a whole jump, picked up by its line: dropping it on a place files every file in it at once,
     and on Tandems that is what makes the jump a passenger's (RULES, Dropzones and tandems) */
  const startJumpDrag = (groupId: string) => {
    setDraggedFiles([])
    setDragged([groupId])
  }

  const startFileDrag = (file: ManifestFile, e?: React.DragEvent) => {
    if (!file.id) return
    /* a thumbnail sits inside a draggable jump card — only the file must travel */
    e?.stopPropagation()
    setDragged([])
    setDraggedFiles(pickedFiles.includes(file.id) ? pickedFiles : [file.id])
  }

  /* Only a listing that came back may demote a file; a NAS that was never asked, or that failed,
     leaves every proven upload alone (RULES, File status). */
  const remoteAnswer = remoteFilesSchema.safeParse(remoteFetcher.data)
  const fresh = remoteAnswer.success && remoteAnswer.data.ok ? remoteAnswer.data : null
  /* the loader took the first look; an upload's own listing or a Refresh replaces it, newest wins */
  const seen: CheckedListing[] = [fresh, remoteAfterUpload, loaderData.remote].filter(
    (r): r is CheckedListing => r !== null
  )
  const newest = seen.length === 0 ? null : seen.reduce((a, b) => (a.at >= b.at ? a : b))
  const remote: RemoteListing | null = newest
  const remoteCheckedAt = newest?.at ?? null

  const statusContext = (file: ManifestFile) => ({
    crop: { cropStart: file.cropStart, cropEnd: file.cropEnd },
    output: outputs[file.path],
    remote
  })
  /* how many clips have their small copy, out of the ones that want one */
  const proxyFacts = Object.values(proxies)
  const proxyProgress = {
    ready: proxyFacts.filter((f) => f.state !== 'none').length,
    waiting: proxyFacts.filter((f) => f.state === 'none').length,
    total: proxyFacts.length
  }
  const statusOf = (file: ManifestFile) => fileStatus(file, statusContext(file))
  const gateFor = (files: ManifestFile[]) => uploadGate(files, statusContext)

  const checkRemote = () => remoteFetcher.load({ url: '/api/remote-files' })

  /* Only the zone under the pointer lights up, and only when it takes what is being carried.
     onDragLeave also fires when the pointer crosses a child, so `contains` stops the flicker. */
  const leaveTarget = (key: string) => (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setOverTarget((current) => (current === key ? null : current))
  }

  /* A jump accepts files dropped from anywhere, so a photo can change jump. The same jump is a
     target in more than one place at once — its line and its chip in the day header — so each says
     which it is: one key per thing on screen, or lighting one would light them all. */
  const groupDropTarget = (groupId: string, scope: 'group' | 'chip' = 'group') => {
    const key = `${scope}:${groupId}`
    return {
      onDragOver: (e: React.DragEvent) => {
        if (draggedFiles.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        setOverTarget(key)
      },
      onDragLeave: leaveTarget(key),
      onDrop: (e: React.DragEvent) => {
        setOverTarget(null)
        if (draggedFiles.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        moveFiles(draggedFiles, { targetGroupId: groupId })
        setDraggedFiles([])
      }
    }
  }

  /* `key` names the thing on screen that lights up, which is not always the destination: the same
     dropzone is a target in the menu and on its own card, and each has to light on its own. */
  const dropTarget = (destination: string | null, named?: string) => {
    const key = named ?? (destination === null ? 'sort' : `dest:${destination}`)
    /* the sorting area takes files back; a destination card takes whole jumps as well */
    const accepts =
      destination === null ? draggedFiles.length > 0 : dragged.length > 0 || draggedFiles.length > 0
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!accepts) return
        e.preventDefault()
        setOverTarget(key)
      },
      onDragLeave: leaveTarget(key),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        setOverTarget(null)
        if (draggedFiles.length > 0)
          moveFiles(draggedFiles, { destination, newGroup: destination === TANDEMS })
        else if (dragged.length > 0) assign(dragged, destination)
        setDragged([])
        setDraggedFiles([])
      }
    }
  }
  /* what a file is called on disk once a copy exists; null while there is none to name */
  const deliveredName = (file: ManifestFile) =>
    file.processed && statusOf(file) !== 'local' ? baseName(file.processed.path) : null

  const fileLane = (file: ManifestFile, lane: ManifestFile[], e: React.MouseEvent) =>
    clickFile(file, lane, e, () => preview.handlePreview(file, groupOfFile(file)?.id ?? LOOSE))

  const groupOfFile = (file: ManifestFile) =>
    groups.find((g) => g.files.some((f) => (f.id ?? f.path) === (file.id ?? file.path)))

  const selectAll = (files: ManifestFile[]) => {
    const ids = files.flatMap((f) => (f.id ? [f.id] : []))
    const every = ids.length > 0 && ids.every((id) => pickedFiles.includes(id))
    setPickedFiles(
      every ? pickedFiles.filter((id) => !ids.includes(id)) : [...new Set([...pickedFiles, ...ids])]
    )
  }

  /* a day is the unit everywhere: one open at a time, remembered for the place you are in */
  const key = placeKey(place)
  const openDay = openDays[key]
  const setOpenDay = (day: string | null) => setOpenDays({ ...openDays, [key]: day })

  /* A jump chip opens its day and lands on that jump. The scroll waits two frames because the
     jump it is scrolling to does not exist until the day it is in has been drawn. */
  const openAt = (day: string, anchor: string) => {
    setOpenDay(day)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(`at-${anchor}`)?.scrollIntoView({ block: 'start' })
      )
    )
  }

  const placeGroups =
    place.kind === 'sort'
      ? unsorted
      : place.kind === 'dz'
        ? groups.filter((g) => g.destination === place.name)
        : place.kind === 'tandems'
          ? tandems
          : tandems.filter((g) => passengerOf(g) === place.name)
  const placeLoose =
    place.kind === 'sort' ? sorting : place.kind === 'dz' ? looseIn(place.name) : []

  /* Finding one file among a day's worth of them. It narrows what is drawn and nothing else — a
     jump left with no match drops out of view rather than showing as empty, and the counts in the
     menu go on counting everything, because what is there has not changed. */
  const matches = (file: ManifestFile) => {
    if (!query.trim()) return true
    const needle = query.trim().toLowerCase()
    const out = deliveredName(file)
    return (
      file.filename.toLowerCase().includes(needle) ||
      Boolean(out && out.toLowerCase().includes(needle))
    )
  }
  const shownGroups = query.trim()
    ? placeGroups
        .map((g) => ({ ...g, files: g.files.filter(matches) }))
        .filter((g) => g.files.length > 0)
    : placeGroups
  const shownLoose = placeLoose.filter(matches)

  const days = [...new Set([...shownGroups.map(dayOf), ...shownLoose.map(dayOfFile)])]
    .sort()
    .reverse()
  /* the newest day with work left is the one worth opening; a place with nothing to do opens closed */
  const defaultDay = days.find((d) =>
    [
      ...shownGroups.filter((g) => dayOf(g) === d).flatMap((g) => g.files),
      ...shownLoose.filter((f) => dayOfFile(f) === d)
    ].some((f) => statusOf(f) !== 'uploaded')
  )
  const shownDay = key in openDays ? openDay : (defaultDay ?? days[0] ?? null)

  const jumpShut = (groupId: string) => foldJumps !== unfolded.includes(groupId)
  /* the jumps of whichever day is open — what tells Collapse and Expand whether there is anything
     left for them to do */
  const openDayJumps =
    place.kind === 'sort' && shownDay
      ? shownGroups.filter((g) => dayOf(g) === shownDay).map((g) => g.id)
      : []
  const foldAll = (fold: boolean) => {
    setFoldJumps(fold)
    setUnfolded([])
  }

  const unnamed = tandems.filter((g) => !passengerOf(g))
  const named = tandems.filter((g) => passengerOf(g))

  const placeDrop = (target: Place) => {
    const key = placeKey(target)
    const props =
      target.kind === 'sort'
        ? dropTarget(null, key)
        : target.kind === 'dz'
          ? dropTarget(target.name, key)
          : dropTarget(TANDEMS, key)
    return { ...props, 'data-place': key }
  }

  const dayAction = (day: string, dayGroups: ManifestGroup[], dayLoose: ManifestFile[]) => {
    if (place.kind !== 'dz') return null
    const files = [...dayGroups.flatMap((g) => g.files), ...dayLoose]
    const gate = gateFor(files)
    const label = `${place.name}:${day}`
    if (gate.blocked)
      return (
        <Go
          disabled={busy !== null}
          onClick={() =>
            send(
              label,
              dayLoose.length > 0
                ? { intent: 'process', destination: place.name }
                : { intent: 'process', groupIds: dayGroups.map((g) => g.id) }
            )
          }>
          {busy === label ? 'Preparing…' : 'Prepare'}
        </Go>
      )
    if (files.every((f) => statusOf(f) === 'uploaded'))
      return <span className='text-[12px] font-semibold text-up'>✓ sent</span>
    return (
      <Go
        disabled={busy !== null}
        onClick={() => requestUpload({ destination: place.name }, `dest:${place.name}`)}>
        {busy === `dest:${place.name}` ? 'Sending…' : 'Send to the club'}
      </Go>
    )
  }

  if (!hasManifest) {
    return (
      <main className='mx-auto max-w-5xl p-6'>
        <h1 className='text-[15px] font-bold tracking-[-0.02em]'>Nothing here yet</h1>
        <p className='mt-2 text-[12.5px] text-ink-2'>
          Copy the cameras into the output folder, then scan to find the jumps.
        </p>
        {note && <Callout tone='warn'>{note}</Callout>}
        <button
          type='button'
          disabled={scanning}
          onClick={scan}
          className='mt-4 rounded-md border border-accent bg-accent px-[11px] py-[5px] text-[12.5px] font-medium text-white disabled:opacity-40'>
          {scanning ? 'Scanning…' : 'Scan'}
        </button>
      </main>
    )
  }

  /* the storage strip: one row of links, all of which look and behave alike, so they are described
     once and drawn in a loop rather than written out five times */
  const nasLinks: {
    label: string
    title?: string
    disabled?: boolean
    onClick: () => void
  }[] = nasConnected
    ? [
        {
          label: defaultFolder ?? 'no default folder',
          title: 'The folder used by anything without a folder of its own',
          onClick: () => setDialog({ kind: 'folder' })
        },
        {
          label: backupFolder ? `backup ${backupFolder}` : 'no backup folder',
          title: 'Where the original videos are archived — never a folder a passenger can see',
          onClick: () => setDialog({ kind: 'folder', target: 'backup' })
        },
        {
          label:
            remoteFetcher.state !== 'idle'
              ? 'checking…'
              : remoteCheckedAt
                ? `⟳ checked ${formatTime(remoteCheckedAt)}`
                : '⟳ check',
          title: 'Ask the NAS what it holds now — a file deleted there stops reading as uploaded',
          disabled: remoteFetcher.state !== 'idle',
          onClick: checkRemote
        },
        { label: 'disconnect', onClick: disconnect }
      ]
    : [{ label: 'Connect the NAS', onClick: openConnect }]

  const placeFiles = placeGroups.reduce((n, g) => n + g.files.length, 0) + placeLoose.length

  return (
    <main
      /* dragend bubbles, so one handler clears the highlight however a drag ends */
      onDragEnd={() => {
        setOverTarget(null)
        setDraggedFiles([])
        setDragged([])
      }}
      className='flex h-screen flex-col'>
      <header className='flex flex-wrap items-center gap-[13px] border-b border-line bg-pane px-4 py-[9px]'>
        <span className='text-[15px] font-bold tracking-[-0.02em]'>
          Sky<span className='text-accent'>Dock</span>
        </span>
        <span className='ml-auto flex flex-wrap items-center gap-2'>
          <button
            type='button'
            disabled={scanning}
            onClick={scan}
            title='Look through the output folder for files the manifest does not know about yet'
            className='rounded-md border border-line bg-pane px-[11px] py-[5px] text-[12.5px] font-medium hover:border-ink-3 disabled:opacity-40'>
            {scanning ? 'Scanning…' : 'Rescan cameras'}
          </button>
          {/* Only while some clip is still without one. They are built behind whatever asked for
              them and nothing watches them arrive, so this is how far along the last look was —
              a card where none of them ever build used to be indistinguishable from one still
              working. */}
          {proxyProgress.waiting > 0 && (
            <span
              title={`${proxyProgress.ready} of ${proxyProgress.total} clips have their small copy. They are built in the background; the count catches up whenever the board is redrawn.`}
              className='inline-flex items-center gap-1.5 rounded-full border border-line bg-pane px-2.5 py-[3px] font-mono text-[12px] text-ink-2 tabular-nums'>
              proxies {proxyProgress.ready}/{proxyProgress.total}
            </span>
          )}
          <span className='inline-flex items-center gap-[7px] rounded-full border border-line bg-pane py-[3px] pr-2.5 pl-2 text-[12px]'>
            <span
              className={`h-[7px] w-[7px] flex-none rounded-full ${
                nasConnected ? 'bg-up' : 'bg-ink-3'
              }`}
            />
            {nasConnected && <b className='font-semibold'>{nasHost ?? 'NAS'}</b>}
            {nasLinks.map((link, i) => (
              <Fragment key={link.label}>
                {(i > 0 || nasConnected) && <span className='text-line'>|</span>}
                <button
                  type='button'
                  title={link.title}
                  disabled={link.disabled}
                  onClick={link.onClick}
                  className='border-0 bg-transparent p-0 text-[12px] text-accent underline disabled:opacity-40'>
                  {link.label}
                </button>
              </Fragment>
            ))}
          </span>
          <Seg
            label='How files are shown'
            value={view}
            options={VIEWS}
            onPick={setFileView}
          />
          <Seg
            label='Theme'
            value={theme}
            options={THEMES}
            onPick={setTheme}
          />
        </span>
      </header>

      <div className='grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] min-[781px]:grid-cols-[262px_minmax(0,1fr)] min-[781px]:grid-rows-[minmax(0,1fr)]'>
        <PlacesTree
          place={place}
          destinations={places}
          groups={groups}
          looseFiles={loose}
          statusContext={statusContext}
          unnamedTandems={unnamed.length}
          onPick={(next) => {
            setPlace(next)
            setQuery('')
            clearFiles()
          }}
          onAddPlace={addPlace}
          dropTarget={placeDrop}
          overTarget={overTarget}
        />

        <section className='flex min-h-0 min-w-0 flex-col bg-ground'>
          <div className='flex flex-wrap items-center gap-[9px] border-b border-line bg-pane px-[18px] pt-2.5 pb-[9px]'>
            {place.kind === 'pax' && (
              <button
                type='button'
                onClick={() => setPlace({ kind: 'tandems' })}
                className='rounded-[5px] border border-line bg-pane px-2 py-0.5 text-[12px] text-ink-2'>
                ↰ Tandems
              </button>
            )}
            <span className='text-[12.5px] text-ink-3'>
              {place.kind === 'pax' && 'Tandems / '}
              <b className='text-[15px] font-semibold text-ink'>{placeLabel(place)}</b>
            </span>
            <span className='text-[12px] text-ink-2'>
              {place.kind === 'dz'
                ? `${days.length} day${days.length === 1 ? '' : 's'} · ${placeFiles} files`
                : place.kind === 'sort'
                  ? `${placeGroups.length} jump${placeGroups.length === 1 ? '' : 's'} · ${placeFiles} files`
                  : `${placeFiles} file${placeFiles === 1 ? '' : 's'}`}
            </span>
            <span className='flex-1' />
            <label className='flex items-center gap-1.5 rounded-md border border-line bg-ground px-[9px] py-[3px]'>
              <span
                aria-hidden='true'
                className='text-[12px] text-ink-3'>
                ⌕
              </span>
              <input
                type='text'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Find a file'
                aria-label='Find a file'
                className='w-[140px] border-0 bg-transparent text-[12.5px] outline-none placeholder:text-ink-3 max-[780px]:w-[100px]'
              />
            </label>
          </div>

          {place.kind === 'dz' && (
            <div className='flex flex-wrap items-center gap-[9px] border-b border-line bg-pane px-[18px] py-[7px] text-[12px] text-ink-2'>
              <span>
                Goes to{' '}
                <code className='rounded-[3px] bg-line-2 px-[5px] py-px font-mono text-[11.5px] text-ink'>
                  {folderFor(place.name) ?? 'no folder yet'}
                </code>
              </span>
              <span className='ml-auto flex items-center gap-2'>
                <Mini onClick={() => setDialog({ kind: 'folder', destination: place.name })}>
                  {folderFor(place.name) ? 'Change folder' : 'Choose a folder'}
                </Mini>
              </span>
            </div>
          )}

          {note && (
            <p className='border-b border-line bg-accent-soft px-[18px] py-[7px] text-[12.5px] text-ink-2'>
              {note}
            </p>
          )}

          <div className='flex-1 overflow-y-auto px-[18px] pt-1 pb-10'>
            {(place.kind === 'sort' || place.kind === 'dz') && (
              <div className='mt-2'>
                {days.length > 0 && (
                  <div className='mb-2 flex flex-wrap items-center gap-1.5'>
                    <span className='mr-auto text-[12px] text-ink-2'>
                      {place.kind === 'sort'
                        ? `${placeGroups.length} jump${placeGroups.length === 1 ? '' : 's'}`
                        : `${days.length} day${days.length === 1 ? '' : 's'}`}{' '}
                      · {shownDay ? `${dayLabel(shownDay)} open` : 'all closed'}
                    </span>
                    <Mini
                      disabled={openDayJumps.length === 0 || openDayJumps.every(jumpShut)}
                      title='Fold jumps down to their names — days opened afterwards open folded too'
                      onClick={() => foldAll(true)}>
                      Collapse jumps
                    </Mini>
                    <Mini
                      disabled={openDayJumps.length === 0 || !openDayJumps.some(jumpShut)}
                      title='Show the files of every jump, and of days opened afterwards'
                      onClick={() => foldAll(false)}>
                      Expand jumps
                    </Mini>
                    <Mini
                      disabled={shownDay === null}
                      title='Fold every day down to one line'
                      onClick={() => setOpenDay(null)}>
                      Close all days
                    </Mini>
                    {place.kind === 'sort' && sorting.length > 0 && (
                      <Mini
                        disabled={busy !== null}
                        title='Run the gap rule again over every loose file here'
                        onClick={() => send('regroup', { intent: 'regroup-loose' })}>
                        {busy === 'regroup' ? 'Regrouping…' : `Regroup ${sorting.length} loose`}
                      </Mini>
                    )}
                  </div>
                )}
                {days.length === 0 && (
                  <div className='rounded-[9px] border border-dashed border-line bg-pane px-4 py-7 text-center text-ink-3'>
                    {query.trim()
                      ? 'Nothing here matches that.'
                      : 'Nothing here. Drag a jump onto this place in the menu to file it.'}
                  </div>
                )}
                {days.map((day) => {
                  const dayGroups = shownGroups.filter((g) => dayOf(g) === day)
                  const dayLoose = shownLoose.filter((f) => dayOfFile(f) === day)
                  return (
                    <DayRow
                      key={day}
                      day={day}
                      label={dayLabel(day)}
                      groups={dayGroups}
                      looseFiles={dayLoose}
                      open={shownDay === day}
                      grouped={place.kind === 'sort'}
                      kind={kind}
                      shape={view}
                      picked={pickedFiles}
                      statusContext={statusContext}
                      proxies={proxies}
                      deliveredName={deliveredName}
                      onToggle={() => setOpenDay(shownDay === day ? null : day)}
                      onKind={setKind}
                      onFile={fileLane}
                      onDragFile={startFileDrag}
                      onSelectAll={selectAll}
                      onShiftJump={shiftJump}
                      onOpenAt={openAt}
                      overTarget={overTarget}
                      isJumpShut={jumpShut}
                      onDragJump={startJumpDrag}
                      onToggleJump={(id) =>
                        setUnfolded(
                          unfolded.includes(id)
                            ? unfolded.filter((x) => x !== id)
                            : [...unfolded, id]
                        )
                      }
                      groupDropTarget={groupDropTarget}
                      dragging={draggedFiles.length > 0}
                      action={dayAction(day, dayGroups, dayLoose)}
                      strip={
                        place.kind === 'dz' && uploading === `dest:${place.name}` && progress ? (
                          <UploadStrip progress={progress} />
                        ) : null
                      }
                      busy={busy !== null}
                    />
                  )
                })}
              </div>
            )}

            {place.kind === 'tandems' && (
              <>
                {unnamed.length > 0 && (
                  <Callout tone='warn'>
                    <b className='text-ink'>
                      {unnamed.length} tandem{unnamed.length === 1 ? '' : 's'} with no passenger
                      yet.
                    </b>{' '}
                    Open one to give it a name — it is the folder the passenger gets.
                  </Callout>
                )}
                <div className='my-2.5 grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-2.5'>
                  {[...unnamed, ...named].map((group) => {
                    const who = passengerOf(group)
                    return (
                      <PassengerCard
                        key={group.id}
                        group={group}
                        who={who}
                        naming={renaming === group.id}
                        dropTarget={groupDropTarget(group.id)}
                        onOpen={() =>
                          who ? setPlace({ kind: 'pax', name: who }) : setRenaming(group.id)
                        }
                        onName={(firstname, lastname) => {
                          setPassenger(group.id, firstname, lastname)
                          setRenaming(null)
                        }}
                      />
                    )
                  })}
                </div>
              </>
            )}

            {place.kind === 'pax' &&
              named
                .filter((g) => passengerOf(g) === place.name)
                .map((group) => (
                  <div key={group.id}>
                    {group.delivered && <DeliveredCards group={group} />}
                    <div
                      {...groupDropTarget(group.id)}
                      className='mt-2 mb-3.5 rounded-[9px] border border-line bg-pane'>
                      <div className='flex flex-wrap items-center gap-[9px] border-b border-line-2 px-3 py-[9px]'>
                        <span className='font-mono text-[12.5px] font-semibold tabular-nums'>
                          {formatTime(minFileMtime(group.files) ?? 0)}
                        </span>
                        <KindBadges
                          files={group.files}
                          kind={kind}
                          withAll={false}
                          onPick={setKind}
                        />
                        <Mini onClick={() => selectAll(group.files)}>Select all</Mini>
                        <TandemActions
                          group={group}
                          facts={tandemFacts[group.id]}
                          busy={busy}
                          blocked={gateFor(group.files)}
                          named={hasCompletePassenger(group.passenger)}
                          onProcess={() => send(group.id, { intent: 'process', groupId: group.id })}
                          onMontage={() => createMontage(group)}
                          onOpenMontage={() => openMontage(group)}
                          onDeliver={() => deliver(group)}
                        />
                        {uploading === `deliver:${group.id}` && progress && (
                          <span className='mt-0.5 flex-[1_1_100%]'>
                            <UploadStrip progress={progress} />
                          </span>
                        )}
                      </div>
                      <div className='p-[9px]'>
                        <FileList
                          files={group.files}
                          kind={kind === 'all' ? 'video' : kind}
                          shape={view}
                          picked={pickedFiles}
                          statusContext={statusContext}
                          proxies={proxies}
                          onFile={fileLane}
                          onDragFile={startFileDrag}
                          deliveredName={deliveredName}
                          selecting={pickedFiles.length > 0}
                        />
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        </section>
      </div>

      {pickedFiles.length > 0 && (
        <div className='fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-2.5 bg-ink px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] text-ground'>
          <b className='font-semibold'>
            {pickedFiles.length} file{pickedFiles.length > 1 ? 's' : ''} selected
          </b>
          <span className='text-[11.5px] opacity-60'>
            drag them onto a place in the menu · ⌘/ctrl-click to add · shift-click for a range ·
            Delete sends them back
          </span>
          <span className='ml-auto flex gap-2'>
            <button
              type='button'
              onClick={clearFiles}
              className='rounded-[5px] border border-white/30 bg-white/10 px-2.5 py-1 text-[12px] hover:bg-white/20'>
              Clear (Esc)
            </button>
          </span>
        </div>
      )}

      {dialog?.kind === 'connect' && !connectSucceeded && (
        <ConnectionDialog
          onConnect={connect}
          onCancel={() => setDialog(null)}
          error={nasError}
        />
      )}

      {dialog?.kind === 'folder' && (
        <NasFolderBrowser
          open
          initialPath={
            dialog.destination
              ? (places.find((d) => d.name === dialog.destination)?.path ?? undefined)
              : (defaultFolder ?? undefined)
          }
          title={
            dialog.destination
              ? `NAS folder for ${dialog.destination}`
              : dialog.target === 'backup'
                ? 'Folder for the original videos'
                : 'Default NAS upload folder'
          }
          onSelect={(path) => chooseFolder(path, dialog.destination, dialog.target)}
          onClose={() => setDialog(null)}
        />
      )}

      {comparing && picked.length === 2 && (
        <ComparisonDialog
          groups={groups}
          leftGroupId={picked[0]}
          rightGroupId={picked[1]}
          onClose={() => setComparing(false)}
          onMerge={mergeTwo}
        />
      )}

      {preview.preview && preview.preview.files[preview.preview.index] && (
        <PreviewDrawer
          files={preview.preview.files}
          index={preview.preview.index}
          status={statusOf(preview.preview.files[preview.preview.index])}
          proxy={proxies[preview.preview.files[preview.preview.index]?.path ?? '']}
          onClose={preview.closePreview}
          onPrevious={() =>
            preview.setPreview((p) => (p ? { ...p, index: Math.max(0, p.index - 1) } : p))
          }
          onNext={() =>
            preview.setPreview((p) =>
              p ? { ...p, index: Math.min(p.files.length - 1, p.index + 1) } : p
            )
          }
          cropStart={preview.videoState.crop.cropStart}
          cropEnd={preview.videoState.crop.cropEnd}
          zoom={preview.videoState.zoom}
          currentTime={preview.videoState.currentTime}
          duration={preview.videoState.duration}
          onSeek={preview.handleVideoSeek}
          onCropChange={(crop) => preview.setVideoState({ crop })}
          onApply={preview.handleVideoApply}
          onZoomChange={(zoom) => preview.setVideoState({ zoom })}
          onDurationChange={(duration) => preview.setVideoState({ duration })}
          onVideoRef={preview.handleVideoRef}
        />
      )}
    </main>
  )
}

export { loader }

export default Board
