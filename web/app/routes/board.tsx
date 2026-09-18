import {
  EDIT_LOCKED,
  ensureNasSession,
  getOutputDir,
  goneFromStorage,
  hasCompletePassenger,
  listRemoteFiles,
  loadManifest,
  passengerName,
  passengerOf,
  processingNow,
  statProcessedOutputs,
  statProxies,
  statTandemArtifacts,
  tandemUploadKey,
  tandemsRemoteDir
} from '@skydock/scripts'
import type { FrameCrop, Rotation, TandemEntry } from '@skydock/scripts'
import { readTandemIndex } from '../../../packages/skydock-scripts/src/tandemIndex'
import { useState } from 'react'
import { BoardHeader } from '../components/board-header'
import type { NasLink } from '../components/board-header'
import { Go, Mini } from '../components/buttons'
import { Callout } from '../components/callout'
import { DialogHost } from '../components/dialog-host'
import type { BoardDialog } from '../components/dialog-host'
import { FileBrowser } from '../components/file-browser'
import { lanesOf, lockReason, shownStatus } from '../components/file-list'
import type { Kind, Modifiers } from '../components/file-list'
import { FolderOwed } from '../components/folder-owed'
import {
  Box,
  FilePanel,
  FolderPanel,
  JumpPanel,
  ManyPanel,
  Shell,
  StepTrail
} from '../components/inspector'
import { PlacePane } from '../components/place-pane'
import type { SortBy } from '../components/place-pane'
import type { Target } from '../components/place-select'
import { PlacesTree } from '../components/places-tree'
import { PreviewHost } from '../components/preview-host'
import { StorageList } from '../components/storage-list'
import type { Passenger } from '../components/tandem-card'
import {
  FilmStrip,
  GoneFromStorage,
  TandemActions,
  UploadStrip,
  UploadedCards
} from '../components/tandem-card'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import { formatSize, formatTime, plural, shortDate } from '../components/utils'
import { importFiles } from '../helpers/import'
import { TANDEMS, folderOnStorage } from '../helpers/jumps'
import { familyOf, filesIn, groupsIn, looseIn, placeKey, placeLabel } from '../helpers/places'
import type { Place } from '../helpers/places'
import { GROUPINGS, jumpLabels, sectionsOf } from '../helpers/sections'
import type { Grouping } from '../helpers/sections'
import { fileFacts } from '../helpers/status'
import { setBackupChoice, useBackupChoice } from '../hooks/useBackupChoice'
import { useBoardState } from '../hooks/useBoardState'
import { useDragAndDrop } from '../hooks/useDragAndDrop'
import type { Move } from '../hooks/useDragAndDrop'
import { useFileView } from '../hooks/useFileView'
import { useNas } from '../hooks/useNas'
import { LOOSE, usePreview } from '../hooks/usePreview'
import { useSelection } from '../hooks/useSelection'
import { useUploadProgress } from '../hooks/useUploadProgress'
import type { Route } from './+types/board'

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
  let storage: { dir: string; tandems: TandemEntry[]; problem: string | null } | null = null
  try {
    const session = await ensureNasSession()
    if (session) {
      nas = {
        connected: true,
        hostname: session.hostname,
        defaultFolder: session.defaultFolder ?? null,
        backupFolder: session.backupFolder ?? null
      }
      if (manifest) {
        remote = await listRemoteFiles(manifest, session)
        /* the storage's own list of tandems — every one it holds, from here or from elsewhere */
        const dir = tandemsRemoteDir(manifest, session.defaultFolder ?? null)
        if (dir)
          storage = await readTandemIndex(session, dir)
            .then((index) => ({ dir, tandems: index.tandems, problem: null as string | null }))
            .catch((e: unknown) => ({
              dir,
              tandems: [],
              problem: e instanceof Error ? e.message : String(e)
            }))
      }
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
       every time the board is drawn (RULES, Workflow) */
    proxies: manifest ? statProxies(manifest, outputDir) : {},
    /* and what each tandem's folder holds: nothing tells SkyDock when the editor finishes, so a
       film is only ever noticed by looking (RULES, Montage) */
    tandems: manifest ? statTandemArtifacts(manifest, outputDir) : {},
    remote,
    storage,
    hasManifest: manifest !== null,
    nas,
    /* what is being processed right now, if anything — a page loaded in the middle of it has to
       show it still running rather than offer to start it again */
    processing: processingNow()
  }
}

/* the order of how far along a file is, for sorting by it: what still needs work first */
const STATUS_RANK = { changed: 0, local: 1, processed: 2, uploaded: 3 }

const Board = ({ loaderData }: Route.ComponentProps) => {
  const [dialog, setDialog] = useState<BoardDialog>(null)
  /* uploaded and freed: the one thing left is to tell the passenger, so that is offered */
  const board = useBoardState(loaderData, (groupId) => setDialog({ kind: 'email', groupId }))
  const { groups, updateGroups, loose, places, setPlaces, busy, note, setNote, send } = board
  const nas = useNas(loaderData, board.remoteAfterUpload)
  const backupChoice = useBackupChoice()
  const view = useFileView()
  const progress = useUploadProgress(board.uploading)
  /* which folder fills the pane */
  const [place, setPlace] = useState<Place>({ kind: 'sort' })
  /* videos, photos or both: one filter for the whole board, so what was chosen in a dropzone still
     holds in a tandem */
  const [kind, setKind] = useState<Kind>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortBy>('time')
  /* how each family of folder groups its files, remembered while the board is open */
  const [groupingBy, setGroupingBy] = useState<Record<'sort' | 'dz' | 'tandems', Grouping>>({
    sort: 'jump',
    dz: 'day',
    tandems: 'jump'
  })

  /* A tandem with an edit is frozen (RULES, Montage), and a freed one lives on the storage only.
     The server refuses any change to either; the board simply never offers it. */
  const frozen = new Set(
    groups.filter((g) => g.freed || board.tandemFacts[g.id]?.project).map((g) => g.id)
  )
  const frozenFiles = new Set(
    groups
      .filter((g) => frozen.has(g.id))
      .flatMap((g) => g.files.flatMap((f) => (f.id ? [f.id] : [])))
  )
  const { statusContext, statusOf, gateFor, deliveredName } = fileFacts({
    outputs: board.outputs,
    remote: nas.remote,
    frozenFiles
  })

  /* A lone file's crop goes through the same save as everything else, on the registry entry — and
     the board's own copy has to be updated with it, because `updateGroups` refreshes `groups` and
     answers on its own fetcher: nothing here would otherwise hear about the saved loose files. */
  const cropLoneFile = (
    file: ManifestFile,
    range: { cropStart: number | null; cropEnd: number | null },
    frame?: FrameCrop | null,
    rotation?: Rotation
  ) => {
    const cropped = {
      ...file,
      cropStart: range.cropStart,
      cropEnd: range.cropEnd,
      ...(frame !== undefined ? { frame } : {}),
      ...(rotation !== undefined ? { rotation } : {})
    }
    board.setLoose((current) => current.map((f) => (f.path === file.path ? cropped : f)))
    updateGroups(groups, [cropped])
  }
  const preview = usePreview(groups, updateGroups, cropLoneFile)

  const groupOfFile = (file: ManifestFile) =>
    groups.find((g) => g.files.some((f) => (f.id ?? f.path) === (file.id ?? file.path)))
  const openFile = (file: ManifestFile) =>
    preview.handlePreview(file, groupOfFile(file)?.id ?? LOOSE)

  /* A tandem is uploaded while the storage still holds what was sent, and not a moment longer —
     the record says what went up, the listing says whether it is still there. Delete it over there
     and the tandem reads as not uploaded again, with what went missing named. */
  const goneById = Object.fromEntries(
    groups.map((g) => [g.id, goneFromStorage(g.uploaded, nas.remote)])
  )
  const asOnStorage = (group: ManifestGroup) =>
    group.uploaded && (goneById[group.id]?.length ?? 0) > 0
      ? { ...group, uploaded: undefined }
      : group

  /* what the open folder holds, narrowed by what is typed in the search box */
  const family = familyOf(place)
  const placeGroups = groupsIn(place, groups).map(asOnStorage)
  const placeLoose = looseIn(place, loose)
  const placeFiles = filesIn(place, groups, loose)
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
  const groupingOptions = family === 'storage' ? GROUPINGS.sort : GROUPINGS[family]
  const grouping =
    family === 'storage'
      ? 'none'
      : groupingOptions.includes(groupingBy[family])
        ? groupingBy[family]
        : (groupingOptions[0] ?? 'none')
  const sections = sectionsOf(place, grouping, shownGroups, shownLoose)
  const sortKey = (file: ManifestFile) =>
    sort === 'name'
      ? (deliveredName(file) ?? file.filename).toLowerCase()
      : sort === 'status'
        ? STATUS_RANK[shownStatus(file, statusContext(file))]
        : file.mtime
  /* every file on screen, in the order it is drawn, for the arrow keys to step through */
  const order = sections.flatMap((s) =>
    s.kind === 'jump' && s.group.freed ? [] : lanesOf(s.files, kind, sortKey).flat()
  )

  const selection = useSelection({
    order,
    paused: preview.preview !== null || dialog !== null,
    onOpen: openFile,
    onDelete: (ids) => moveFiles(ids, { destination: null })
  })
  const { pickedFiles } = selection

  /* Files leave their jump and are re-filed server-side, so the answer is the truth. `newGroup`
     gathers them into a jump of their own — what a tandem needs, since the passenger name lives on
     a group; without it the files would land as lone files and fall back to the sorting area. */
  const moveFiles = (ids: string[], where: Move) => {
    if (ids.length === 0) return
    selection.clear()
    /* a tandem with an edit neither gives files up nor takes them in */
    const free = ids.filter((id) => !frozenFiles.has(id))
    if (free.length === 0 || (where.targetGroupId && frozen.has(where.targetGroupId))) {
      setNote(EDIT_LOCKED)
      return
    }
    send('move', {
      intent: 'move-files',
      fileIds: free,
      ...(where.targetGroupId ? { targetGroupId: where.targetGroupId } : {}),
      ...(where.destination ? { destination: where.destination } : {}),
      ...(where.newGroup ? { newGroup: true } : {})
    })
    if (free.length < ids.length) setNote(`${EDIT_LOCKED} Its files stayed where they were.`)
  }

  const saveDestinations = (next: Destination[]) => {
    setPlaces(next)
    board.manifest({ intent: 'save-groups', groups, destinations: next })
  }

  const addPlace = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || places.some((d) => d.name === trimmed)) return
    saveDestinations([...places, { name: trimmed }])
  }

  /* Filing, and for a tandem naming, in one save — a jump filed under Tandems and then named is two
     saves with a nameless tandem in between, which is exactly the state the menu then has to call
     out as waiting. */
  const assign = (ids: string[], destination: string | null, passenger?: Passenger) => {
    const nextPlaces =
      destination && !places.some((d) => d.name === destination)
        ? [...places, { name: destination }]
        : undefined
    if (nextPlaces) setPlaces(nextPlaces)
    const next = groups.map((g) =>
      ids.includes(g.id)
        ? {
            ...g,
            destination: destination ?? undefined,
            passenger: destination === TANDEMS ? (passenger ?? g.passenger ?? undefined) : undefined
          }
        : g
    )
    updateGroups(next, undefined, nextPlaces)
  }

  /* Files from the computer are copied one by one, the board saying which; once all are in, it
     looks again and hears how the whole drop went. */
  const importDropped = async (list: FileList, target: string, where: string) => {
    if (list.length === 0) return
    board.setBusy('import')
    const tally = await importFiles(list, target, where, (index, total, name) =>
      setNote(`Adding ${index + 1} of ${total} to ${where} — ${name}…`)
    )
    board.manifest({ intent: 'imported', imported: tally })
  }

  const drag = useDragAndDrop({ groups, frozen, pickedFiles, moveFiles, assign, importDropped })

  /* The folder something was just filed under lights up for a moment, so the eye can follow the
     jump there from the line it left. */
  const [flashPlace, setFlashPlace] = useState<string | null>(null)
  const flash = (target: Place) => {
    const key = placeKey(target)
    setFlashPlace(key)
    setTimeout(() => setFlashPlace((current) => (current === key ? null : current)), 1800)
  }

  const makeTandem = (groupId: string, passenger: Passenger) => {
    const who = passengerName(passenger)
    /* joining puts the jump in the folder the edit lives in */
    if (groups.some((g) => frozen.has(g.id) && passengerOf(g) === who)) {
      setNote(`${who}’s tandem has an edit — change it in kdenlive.`)
      return
    }
    const joining = groups.some(
      (g) => g.id !== groupId && g.destination === TANDEMS && passengerOf(g) === who
    )
    assign([groupId], TANDEMS, passenger)
    setNote(
      joining ? `Joined ${who}’s tandem — one passenger is one folder` : `Filed as ${who}’s tandem`
    )
    flash({ kind: 'pax', name: who })
  }

  const setPassenger = (groupId: string, firstname: string, lastname: string) => {
    if (frozen.has(groupId)) return
    const next = groups.map((g) =>
      g.id === groupId
        ? { ...g, passenger: firstname || lastname ? { firstname, lastname } : undefined }
        : g
    )
    updateGroups(next)
  }

  const shiftJump = (groupId: string, anchorEpoch: number) =>
    send('shift', { intent: 'shift-group-time', groupId, anchorEpoch })

  /* each passenger once, however many jumps they have */
  const named = groups.filter((g) => g.destination === TANDEMS && hasCompletePassenger(g.passenger))
  const passengers = [
    ...new Map(
      named.flatMap((g): [string, Passenger][] =>
        g.passenger ? [[passengerOf(g), g.passenger]] : []
      )
    ).values()
  ]
  /* the passengers something can still join: one whose tandem has an edit takes nothing more */
  const joinable = [
    ...new Set(named.filter((g) => !frozen.has(g.id)).map((g) => passengerOf(g)))
  ].sort((a, b) => a.localeCompare(b))
  const hostOf = (who: string) => named.find((g) => passengerOf(g) === who)

  /* where a jump or a loose file is filed now, as the File to list names it */
  const targetOfGroup = (group: ManifestGroup): Target | null =>
    !group.destination
      ? { kind: 'unsorted' }
      : group.destination !== TANDEMS
        ? { kind: 'dz', name: group.destination }
        : passengerOf(group)
          ? { kind: 'pax', name: passengerOf(group) }
          : null
  const targetOfFile = (file: ManifestFile): Target | null => {
    const group = groupOfFile(file)
    if (group) return targetOfGroup(group)
    return file.destination ? { kind: 'dz', name: file.destination } : { kind: 'unsorted' }
  }

  /* one choice from the File to list files the whole jump, as a drag onto that folder would */
  const fileJumpTo = (groupId: string, target: Target) => {
    if (target.kind === 'unsorted') assign([groupId], null)
    else if (target.kind === 'dz') {
      assign([groupId], target.name)
      flash({ kind: 'dz', name: target.name })
    } else if (target.kind === 'pax') {
      const host = hostOf(target.name)
      if (host?.passenger) makeTandem(groupId, host.passenger)
    } else {
      /* a tandem with no name yet: it stays selected, so the name is typed straight away */
      assign([groupId], TANDEMS)
      selection.selectJump(groupId)
      setNote('Filed under Tandems — type the passenger’s name on the right')
    }
  }
  const fileFilesTo = (ids: string[], target: Target) => {
    if (target.kind === 'unsorted') moveFiles(ids, { destination: null })
    else if (target.kind === 'dz') moveFiles(ids, { destination: target.name })
    else if (target.kind === 'pax') {
      const host = hostOf(target.name)
      if (host) moveFiles(ids, { targetGroupId: host.id })
    } else moveFiles(ids, { destination: TANDEMS, newGroup: true })
  }

  const openConnect = () => {
    nas.markDialogOpened()
    setDialog({ kind: 'connect' })
  }

  /* the two session folders go through the NAS session; a dropzone's own folder is part of the
     workspace, so it is saved with the destinations list like any other board edit */
  const chooseFolder = (path: string, destination?: string, target?: 'backup') => {
    if (destination === undefined) nas.selectFolder(path, target ?? 'default')
    else {
      const known = places.some((d) => d.name === destination)
      saveDestinations(
        known
          ? places.map((d) => (d.name === destination ? { ...d, path } : d))
          : [...places, { name: destination, path }]
      )
    }
    setDialog(dialog?.kind === 'folder' && dialog.back ? dialog.back : null)
  }

  const folderFor = (destination: string) => {
    const known = places.find((d) => d.name === destination)
    if (known?.path) return known.path
    return nas.defaultFolder ? `${nas.defaultFolder}/${destination}` : null
  }

  /* the client opens whichever dialog is missing rather than firing a request the server would
     only refuse — but the server still decides, so the client never guesses a path */
  const requestUpload = (scope: { groupIds?: string[]; destination?: string }, key: string) => {
    if (!nas.connected) {
      openConnect()
      return
    }
    if (scope.destination && !folderFor(scope.destination)) {
      setDialog({ kind: 'folder', destination: scope.destination })
      return
    }
    if (!scope.destination && !nas.defaultFolder) {
      setDialog({ kind: 'folder' })
      return
    }
    board.setUploading(key)
    send(key, { intent: 'upload-group', ...scope })
  }

  /* Upload opens what it is about to do — both parcels, both folders, how the originals are kept —
     and only the dialog's own button sends anything. A missing folder is chosen from inside it. */
  const askUpload = (group: ManifestGroup) => {
    if (!nas.connected) {
      openConnect()
      return
    }
    setDialog({ kind: 'upload', groupId: group.id })
  }

  const confirmUpload = (group: ManifestGroup) => {
    setDialog(null)
    const key = tandemUploadKey(group.id)
    board.setUploading(key)
    send(key, { intent: 'upload-tandem', groupId: group.id, backup: backupChoice })
  }

  /* two jumps that turn out to be one: the server merges them and answers with the saved list */
  const mergeTwo = (leftId: string, rightId: string, anchorEpoch: number) => {
    selection.setComparing(null)
    selection.clear()
    send('merge', { intent: 'merge-groups', leftId, rightId, anchorEpoch })
  }

  /* whether the storage's list says this tandem's passenger was sent their link */
  const emailedOn = (group: ManifestGroup) =>
    board.storage?.tandems.find((t) => t.folder === folderOnStorage(group))?.emailed ?? null

  /* A dropzone is processed, then uploaded, as a whole (RULES, Acting). Processing asks only for
     what needs it — the jumps with a file to process, and the dropzone's loose files when one of
     them does — because a dropzone holds every day ever shot there. */
  const dropzoneStep = (name: string) => {
    const files = filesIn({ kind: 'dz', name }, groups, loose)
    if (files.length === 0) return null
    const label = `dz:${name}`
    if (gateFor(files).blocked) {
      const needs = (f: ManifestFile) => statusOf(f) === 'local'
      const jumps = groupsIn({ kind: 'dz', name }, groups).filter((g) => g.files.some(needs))
      const lone = looseIn({ kind: 'dz', name }, loose).some(needs)
      return (
        <Go
          disabled={busy !== null}
          onClick={() =>
            send(
              label,
              lone
                ? { intent: 'process', destination: name }
                : { intent: 'process', groupIds: jumps.map((g) => g.id) }
            )
          }>
          {busy === label ? 'Processing…' : 'Process'}
        </Go>
      )
    }
    if (files.every((f) => statusOf(f) === 'uploaded'))
      return <span className='text-[12px] font-semibold text-up'>✓ all on the storage</span>
    return (
      <Go
        disabled={busy !== null}
        onClick={() => requestUpload({ destination: name }, `dest:${name}`)}>
        {busy === `dest:${name}` ? 'Uploading…' : 'Upload'}
      </Go>
    )
  }

  /* a tandem's line carries its one next step, and its upload while it runs */
  const tandemActions = (group: ManifestGroup) =>
    group.destination !== TANDEMS || group.freed ? null : (
      <>
        <TandemActions
          group={group}
          facts={board.tandemFacts[group.id]}
          busy={busy}
          blocked={gateFor(group.files)}
          named={hasCompletePassenger(group.passenger)}
          onProcess={() => send(group.id, { intent: 'process', groupId: group.id })}
          onMontage={() => send(group.id, { intent: 'montage', groupId: group.id })}
          onOpenMontage={() =>
            send(`open:${group.id}`, { intent: 'open-montage', groupId: group.id })
          }
          onUpload={() => askUpload(group)}
          onFree={() => setDialog({ kind: 'free', groupId: group.id })}
        />
        {board.uploading === tandemUploadKey(group.id) && progress && (
          <span className='mt-0.5 flex-[1_1_100%]'>
            <UploadStrip progress={progress} />
          </span>
        )}
      </>
    )

  /* above a tandem's files: what went missing from the storage, what the storage holds, the film */
  const tandemAbove = (group: ManifestGroup) =>
    group.destination !== TANDEMS ? null : (
      <div className='mb-2'>
        <GoneFromStorage
          gone={goneById[group.id] ?? []}
          at={groups.find((g) => g.id === group.id)?.uploaded?.at}
        />
        {group.uploaded && <UploadedCards group={group} />}
        {!group.uploaded && <FilmStrip facts={board.tandemFacts[group.id]} />}
      </div>
    )

  /* where a file from the computer dropped anywhere on the pane goes — the folder it shows; All
     passengers has no single passenger, and the storage takes nothing */
  const paneHost = place.kind === 'pax' ? hostOf(place.name) : undefined
  const paneTarget =
    place.kind === 'sort' || place.kind === 'day'
      ? { target: 'sort', where: 'Unsorted' }
      : place.kind === 'dz'
        ? { target: `dest:${place.name}`, where: place.name }
        : paneHost && !frozen.has(paneHost.id)
          ? { target: `group:${paneHost.id}`, where: passengerOf(paneHost) }
          : null

  if (!board.hasManifest) {
    return (
      <main className='mx-auto max-w-5xl p-6'>
        <h1 className='text-[15px] font-bold tracking-[-0.02em]'>Nothing here yet</h1>
        <p className='mt-2 text-[12.5px] text-ink-2'>
          Copy the cameras into the output folder, then scan to find the jumps.
        </p>
        {note && <Callout tone='warn'>{note}</Callout>}
        <button
          type='button'
          disabled={board.scanning}
          onClick={board.scan}
          className='mt-4 rounded-md border border-accent bg-accent px-[11px] py-[5px] text-[12.5px] font-medium text-white disabled:opacity-40'>
          {board.scanning ? 'Scanning…' : 'Scan'}
        </button>
      </main>
    )
  }

  const nasLinks: NasLink[] = nas.connected
    ? [
        {
          label: nas.defaultFolder ?? 'no default folder',
          title: 'The folder used by anything without a folder of its own',
          onClick: () => setDialog({ kind: 'folder' })
        },
        {
          label: nas.backupFolder ? `backup ${nas.backupFolder}` : 'no backup folder',
          title: 'Where the original videos are archived — never a folder a passenger can see',
          onClick: () => setDialog({ kind: 'folder', target: 'backup' })
        },
        {
          label: nas.checking
            ? 'checking…'
            : nas.remoteCheckedAt
              ? `⟳ checked ${formatTime(nas.remoteCheckedAt)}`
              : '⟳ check',
          title: 'Ask the NAS what it holds now — a file deleted there stops reading as uploaded',
          disabled: nas.checking,
          onClick: nas.checkRemote
        },
        { label: 'disconnect', onClick: nas.disconnect }
      ]
    : [{ label: 'Connect the NAS', onClick: openConnect }]

  const pickPlace = (next: Place) => {
    setPlace(next)
    setQuery('')
    selection.clear()
  }

  const summary =
    place.kind === 'storage'
      ? plural(board.storage?.tandems.length ?? 0, 'tandem')
      : [
          placeGroups.length && family !== 'dz' ? plural(placeGroups.length, 'jump') : null,
          plural(placeFiles.length, 'file'),
          formatSize(placeFiles.reduce((n, f) => n + f.size, 0))
        ]
          .filter(Boolean)
          .join(' · ')

  /* the passenger's link, by email — once there is a link to send */
  const linked =
    place.kind === 'pax'
      ? groups.find(
          (g) => passengerOf(g) === place.name && (g.uploaded?.shareUrl ?? g.publish?.shareUrl)
        )
      : undefined
  const paxTools = place.kind === 'pax' && (
    <span className='flex items-center gap-1.5'>
      {linked && (
        <Mini
          title={
            emailedOn(linked)
              ? 'The storage’s list says the link was sent — open it to send it again'
              : 'Send the passenger their link'
          }
          onClick={() => setDialog({ kind: 'email', groupId: linked.id })}>
          {emailedOn(linked) ? '✓ Emailed · again…' : `Email ${linked.passenger?.firstname ?? ''}…`}
        </Mini>
      )}
      {/* the two ways back from a tandem, for the whole passenger — each asks first */}
      {!groups.some((g) => passengerOf(g) === place.name && g.freed) && (
        <>
          <Mini
            disabled={busy !== null}
            title='Back to before processing — keeps the name, the crops, the frames and the times'
            onClick={() => setDialog({ kind: 'take-back', mode: 'reset', who: place.name })}>
            Reset…
          </Mini>
          <Mini
            disabled={busy !== null}
            title='Undo the tandem — its jumps go back to Unsorted, without their name or crops'
            onClick={() => setDialog({ kind: 'take-back', mode: 'delete', who: place.name })}>
            Delete…
          </Mini>
        </>
      )}
    </span>
  )

  /* what each jump is called wherever it appears: its place in its day, or its passenger */
  const labels = new Map(
    [...new Set(groups.map((g) => g.destination ?? ''))].flatMap((dest) => [
      ...jumpLabels(groups.filter((g) => (g.destination ?? '') === dest))
    ])
  )
  const labelOf = (group: ManifestGroup) =>
    `${labels.get(group.id) ?? group.label} · ${shortDate(Math.min(...group.files.map((f) => f.mtime)))}`

  const inspector = () => {
    const picked = pickedFiles.flatMap((id) => {
      const found = [...groups.flatMap((g) => g.files), ...loose].find((f) => f.id === id)
      return found ? [found] : []
    })
    const one = picked.length === 1 ? picked[0] : undefined
    if (one) {
      const group = groupOfFile(one)
      const context = statusContext(one)
      return (
        <FilePanel
          key={one.id}
          file={one}
          name={deliveredName(one)}
          jumpLabel={group ? labelOf(group) : null}
          status={shownStatus(one, context)}
          proxy={board.proxies[one.path]}
          locked={lockReason(one, context)}
          fileTo={{
            current: targetOfFile(one),
            places,
            passengers: joinable,
            onFileTo: (target) => fileFilesTo([one.id ?? ''], target)
          }}
          onOpen={() => openFile(one)}
          onSendBack={() => moveFiles([one.id ?? ''], { destination: null })}
        />
      )
    }
    if (picked.length > 1) {
      const movable = picked.filter((f) => !lockReason(f, statusContext(f)))
      const ids = movable.flatMap((f) => (f.id ? [f.id] : []))
      return (
        <ManyPanel
          files={picked}
          statusOf={statusOf}
          lockedCount={picked.length - movable.length}
          fileTo={{
            places,
            passengers: joinable,
            onFileTo: (target) => fileFilesTo(ids, target)
          }}
          onSendBack={() => moveFiles(ids, { destination: null })}
          onClear={selection.clear}
        />
      )
    }
    const jump = selection.pickedJump
      ? groups.find((g) => g.id === selection.pickedJump)
      : undefined
    if (jump) {
      const shown = asOnStorage(jump)
      return (
        <JumpPanel
          key={jump.id}
          group={shown}
          label={labelOf(jump)}
          facts={board.tandemFacts[jump.id]}
          emailed={Boolean(emailedOn(jump))}
          locked={
            jump.freed
              ? 'Freed from this machine — it is on the storage only now.'
              : frozen.has(jump.id)
                ? `${EDIT_LOCKED} Open it in kdenlive, or reset the tandem.`
                : null
          }
          busy={busy !== null}
          statusOf={statusOf}
          passengers={passengers}
          fileTo={{
            current: targetOfGroup(jump),
            places,
            passengers: joinable,
            onFileTo: (target) => fileJumpTo(jump.id, target)
          }}
          compare={groups
            .filter(
              (g) =>
                g.id !== jump.id &&
                (g.destination ?? '') === (jump.destination ?? '') &&
                !frozen.has(g.id) &&
                g.files.length > 0
            )
            .map((g) => ({ id: g.id, label: labelOf(g) }))}
          onShift={(at) => shiftJump(jump.id, at)}
          onMakeTandem={(passenger) => makeTandem(jump.id, passenger)}
          onName={(first, last) => setPassenger(jump.id, first, last)}
          onSelectFiles={() => selection.selectFiles(jump.files)}
          onCompare={(other) => selection.setComparing([jump.id, other])}
        />
      )
    }
    const dz = place.kind === 'dz' ? places.find((d) => d.name === place.name) : undefined
    return (
      <FolderPanel
        title={placeLabel(place)}
        sub={summary}
        files={placeFiles}
        statusOf={statusOf}>
        {place.kind === 'dz' && (
          <Box heading='On the storage'>
            <p className='m-0 font-mono text-[12px] break-all'>
              {folderFor(place.name) ?? 'no folder yet'}
            </p>
            {dz?.shareUrl && (
              <a
                href={dz.shareUrl}
                target='_blank'
                rel='noreferrer'
                className='truncate font-mono text-[11.5px] text-accent underline'>
                {dz.shareUrl}
              </a>
            )}
            <span>
              <Mini onClick={() => setDialog({ kind: 'folder', destination: place.name })}>
                {folderFor(place.name) ? 'Change folder' : 'Choose a folder'}
              </Mini>
            </span>
          </Box>
        )}
        {family === 'tandems' &&
          placeGroups.map((g) => (
            <Box
              key={g.id}
              heading={labelOf(g)}>
              <StepTrail
                group={g}
                facts={board.tandemFacts[g.id]}
                emailed={Boolean(emailedOn(g))}
              />
            </Box>
          ))}
        {place.kind === 'storage' && board.storage && (
          <p className='m-0 font-mono text-[12px] break-all text-ink-2'>{board.storage.dir}</p>
        )}
      </FolderPanel>
    )
  }

  return (
    <main
      onDragEnd={drag.endDrag}
      className='flex h-screen flex-col'>
      <BoardHeader
        scanning={board.scanning}
        onScan={board.scan}
        proxies={board.proxyProgress}
        nas={{ connected: nas.connected, host: nas.host, links: nasLinks }}
      />

      <div className='grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] min-[781px]:grid-cols-[250px_minmax(0,1fr)] min-[781px]:grid-rows-[minmax(0,1fr)] min-[1101px]:grid-cols-[250px_minmax(0,1fr)_300px]'>
        <PlacesTree
          place={place}
          destinations={places}
          groups={groups}
          looseFiles={loose}
          storage={board.storage}
          statusContext={statusContext}
          tandemOpen={(g) => !asOnStorage(g).uploaded}
          onPick={pickPlace}
          onAddPlace={addPlace}
          dropTarget={drag.placeDrop}
          overTarget={drag.overTarget}
          flashPlace={flashPlace}
        />

        <PlacePane
          place={place}
          onPlace={pickPlace}
          summary={summary}
          files={placeFiles}
          query={query}
          onQuery={setQuery}
          grouping={{
            value: grouping,
            options: groupingOptions,
            onChange: (g) => family !== 'storage' && setGroupingBy({ ...groupingBy, [family]: g })
          }}
          sort={{ value: sort, onChange: setSort }}
          kind={{ value: kind, onChange: setKind }}
          step={place.kind === 'dz' ? dropzoneStep(place.name) : undefined}
          tools={paxTools}
          left={
            <FolderOwed
              place={place}
              groups={placeGroups}
              loose={placeLoose}
              files={placeFiles}
              facts={board.tandemFacts}
              statusOf={statusOf}
              busy={busy !== null}
              folder={
                place.kind === 'dz'
                  ? {
                      path: folderFor(place.name),
                      onChoose: () => setDialog({ kind: 'folder', destination: place.name })
                    }
                  : undefined
              }
              onRegroup={() => send('regroup', { intent: 'regroup-loose' })}
              onPlace={pickPlace}
            />
          }
          strip={
            place.kind === 'dz' && board.uploading === `dest:${place.name}` && progress ? (
              <UploadStrip progress={progress} />
            ) : undefined
          }
          note={note}
          incoming={paneTarget}
          onImport={(list, target, where) => void importDropped(list, target, where)}>
          {place.kind === 'storage' ? (
            <div className='pt-3'>
              <StorageList
                storage={board.storage}
                isHere={(entry) => groups.some((g) => folderOnStorage(g) === entry.folder)}
                onOpen={(entry) =>
                  pickPlace({ kind: 'pax', name: `${entry.firstname} ${entry.lastname}`.trim() })
                }
                onEmail={(entry) => setDialog({ kind: 'email', folder: entry.folder })}
              />
            </div>
          ) : (
            <FileBrowser
              sections={sections}
              kind={kind}
              shape={view}
              picked={pickedFiles}
              sortKey={sortKey}
              statusContext={statusContext}
              statusOf={statusOf}
              proxies={board.proxies}
              deliveredName={deliveredName}
              onFile={(file: ManifestFile, lane: ManifestFile[], e: Modifiers) =>
                selection.clickFile(file, lane, e)
              }
              onOpen={openFile}
              onDragFile={drag.startFileDrag}
              empty={
                query.trim()
                  ? 'Nothing here matches that.'
                  : family === 'sort'
                    ? 'Nothing left to sort. Copy more cameras off and rescan to see their jumps here.'
                    : 'Nothing here yet. Drag a jump onto this folder, pick it from a jump’s File to list, or drop files from the computer.'
              }
              jump={{
                selected: selection.pickedJump,
                frozen,
                overTarget: drag.overTarget,
                busy: busy !== null,
                places,
                passengersFor: () => joinable,
                targetOf: targetOfGroup,
                dropTarget: (id) => drag.groupDropTarget(id),
                onSelect: selection.selectJump,
                onDrag: drag.startJumpDrag,
                onShift: shiftJump,
                onFileTo: fileJumpTo,
                actions: tandemActions,
                above: tandemAbove,
                withDay: place.kind !== 'day'
              }}
            />
          )}
        </PlacePane>

        <Shell>{inspector()}</Shell>
      </div>

      <DialogHost
        dialog={dialog}
        onDialog={setDialog}
        nas={nas}
        places={places}
        onChooseFolder={chooseFolder}
        groups={groups}
        asOnStorage={asOnStorage}
        facts={board.tandemFacts}
        folderFor={folderFor}
        backup={backupChoice}
        onBackup={setBackupChoice}
        onUpload={confirmUpload}
        storage={board.storage}
        onEmailed={(folder, sent, to) =>
          send('email', {
            intent: 'mark-emailed',
            emailed: { folder, sent, ...(to.trim() ? { to: to.trim() } : {}) }
          })
        }
        onFree={(group) => {
          setDialog(null)
          send(`free:${group.id}`, { intent: 'free-tandem', groupId: group.id })
        }}
        onTakeBack={(mode, group) => {
          setDialog(null)
          send('take-back', {
            intent: mode === 'reset' ? 'reset-tandem' : 'delete-tandem',
            groupId: group.id
          })
          /* a deleted tandem has no page left; its jumps are in Unsorted now */
          if (mode === 'delete') pickPlace({ kind: 'sort' })
        }}
        comparing={{
          pair: selection.comparing,
          onClose: () => selection.setComparing(null),
          onMerge: mergeTwo
        }}
      />

      <PreviewHost
        preview={preview}
        proxies={board.proxies}
        statusContext={statusContext}
      />
    </main>
  )
}

export { loader }

export default Board
