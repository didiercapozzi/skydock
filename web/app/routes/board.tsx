import {
  EDIT_LOCKED,
  ensureNasSession,
  getOutputDir,
  goneFromStorage,
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
import { Go } from '../components/buttons'
import { Callout } from '../components/callout'
import { DaysPane } from '../components/days-pane'
import { DialogHost } from '../components/dialog-host'
import type { BoardDialog } from '../components/dialog-host'
import type { Kind, Modifiers } from '../components/file-list'
import { PlacePane } from '../components/place-pane'
import { PlacesTree, placeKey } from '../components/places-tree'
import type { Place } from '../components/places-tree'
import { PreviewHost } from '../components/preview-host'
import { SelectionBar } from '../components/selection-bar'
import type { Passenger } from '../components/tandem-card'
import { UploadStrip } from '../components/tandem-card'
import { TandemPage } from '../components/tandem-page'
import { TandemsGrid } from '../components/tandems-grid'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import { formatTime, plural } from '../components/utils'
import { importFiles } from '../helpers/import'
import { TANDEMS, folderOnStorage, inTandemsCard } from '../helpers/jumps'
import { fileFacts } from '../helpers/status'
import { setBackupChoice, useBackupChoice } from '../hooks/useBackupChoice'
import { useBoardState } from '../hooks/useBoardState'
import { useDaysAndJumps } from '../hooks/useDaysAndJumps'
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

const Board = ({ loaderData }: Route.ComponentProps) => {
  const [dialog, setDialog] = useState<BoardDialog>(null)
  /* uploaded and freed: the one thing left is to tell the passenger, so that is offered */
  const board = useBoardState(loaderData, (groupId) => setDialog({ kind: 'email', groupId }))
  const { groups, updateGroups, loose, places, setPlaces, busy, note, setNote, send } = board
  const nas = useNas(loaderData, board.remoteAfterUpload)
  const backupChoice = useBackupChoice()
  const view = useFileView()
  const progress = useUploadProgress(board.uploading)
  /* which place fills the pane */
  const [place, setPlace] = useState<Place>({ kind: 'sort' })
  /* videos, photos or both: one filter for the whole board, so the badge pressed in a dropzone is
     still pressed in a tandem */
  const [kind, setKind] = useState<Kind>('all')
  const [query, setQuery] = useState('')
  /* which tandem's name is being typed — a named passenger reads as a title, not a form */
  const [renaming, setRenaming] = useState<string | null>(null)

  /* A tandem with an edit is frozen (RULES, Montage). The server refuses any change to one; the
     board simply never offers it. */
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

  const selection = useSelection({
    onDelete: (ids) => moveFiles(ids, { destination: null })
  })
  const { pickedFiles } = selection

  /* files leave their jump and are re-filed server-side, so the answer is the truth. `newGroup`
     gathers them into a jump of their own — what a tandem needs, since the passenger name lives on
     a group; without it the files would land as lone files and fall back to the sorting area,
     which is not what dropping them on Tandems means. */
  const moveFiles = (ids: string[], where: Move) => {
    if (ids.length === 0) return
    selection.clearFiles()
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
    selection.setPicked([])
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

  /* The menu entry something was just filed under lights up for a moment, so the eye can follow the
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

  const shiftJump = (groupId: string, anchorEpoch: number) =>
    send('shift', { intent: 'shift-group-time', groupId, anchorEpoch })

  const setPassenger = (groupId: string, firstname: string, lastname: string) => {
    if (frozen.has(groupId)) return
    const next = groups.map((g) =>
      g.id === groupId
        ? { ...g, passenger: firstname || lastname ? { firstname, lastname } : undefined }
        : g
    )
    updateGroups(next)
  }

  const openConnect = () => {
    nas.markDialogOpened()
    setDialog({ kind: 'connect' })
  }

  /* the two session folders go through the NAS session; a destination's own folder is part of the
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
    selection.setComparing(false)
    selection.setPicked([])
    send('merge', { intent: 'merge-groups', leftId, rightId, anchorEpoch })
  }

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

  const groupOfFile = (file: ManifestFile) =>
    groups.find((g) => g.files.some((f) => (f.id ?? f.path) === (file.id ?? file.path)))
  const fileLane = (file: ManifestFile, lane: ManifestFile[], e: Modifiers) =>
    selection.clickFile(file, lane, e, () =>
      preview.handlePreview(file, groupOfFile(file)?.id ?? LOOSE)
    )

  const unsorted = groups.filter((g) => !g.destination)
  const tandems = groups.filter(inTandemsCard)
  /* a loose file that carries a destination is shown inside that card, not in the sorting area —
     it is a real lone file destined for that folder (RULES, Places), not something still to sort */
  const sorting = loose.filter((f) => !f.destination)
  const unnamed = tandems.filter((g) => !passengerOf(g))
  const named = tandems.filter((g) => passengerOf(g))
  /* each passenger once, however many jumps they have */
  const passengers = [
    ...new Map(
      named.flatMap((g): [string, Passenger][] =>
        g.passenger ? [[passengerOf(g), g.passenger]] : []
      )
    ).values()
  ]

  const placeGroups =
    place.kind === 'sort'
      ? unsorted
      : place.kind === 'dz'
        ? groups.filter((g) => g.destination === place.name)
        : place.kind === 'tandems'
          ? tandems
          : tandems.filter((g) => passengerOf(g) === place.name)
  const placeLoose =
    place.kind === 'sort'
      ? sorting
      : place.kind === 'dz'
        ? loose.filter((f) => f.destination === place.name)
        : []

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

  const daysAndJumps = useDaysAndJumps({
    place,
    groups,
    shownGroups,
    shownLoose,
    hasWorkLeft: (file) => statusOf(file) !== 'uploaded'
  })

  /* where a file from the computer dropped anywhere on the page goes — the place it shows; the
     Tandems grid has no single passenger, so it takes nothing there */
  const paneHost =
    place.kind === 'pax' ? named.find((g) => passengerOf(g) === place.name) : undefined
  const paneTarget =
    place.kind === 'sort'
      ? { target: 'sort', where: 'Unsorted jumps' }
      : place.kind === 'dz'
        ? { target: `dest:${place.name}`, where: place.name }
        : paneHost && !frozen.has(paneHost.id)
          ? { target: `group:${paneHost.id}`, where: passengerOf(paneHost) }
          : null

  /* whether the storage's list says this tandem's passenger was sent their link */
  const emailedOn = (group: ManifestGroup) =>
    board.storage?.tandems.find((t) => t.folder === folderOnStorage(group))?.emailed ?? null

  /* a dropzone's day is processed, then uploaded, as one (RULES, Workflow) */
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
          {busy === label ? 'Processing…' : 'Process'}
        </Go>
      )
    if (files.every((f) => statusOf(f) === 'uploaded'))
      return <span className='text-[12px] font-semibold text-up'>✓ sent</span>
    return (
      <Go
        disabled={busy !== null}
        onClick={() => requestUpload({ destination: place.name }, `dest:${place.name}`)}>
        {busy === `dest:${place.name}` ? 'Uploading…' : 'Upload'}
      </Go>
    )
  }

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

  const placeFiles = placeGroups.reduce((n, g) => n + g.files.length, 0) + placeLoose.length
  const summary =
    place.kind === 'dz'
      ? `${plural(daysAndJumps.days.length, 'day')} · ${placeFiles} files`
      : place.kind === 'sort'
        ? `${plural(placeGroups.length, 'jump')} · ${placeFiles} files`
        : plural(placeFiles, 'file')
  /* the passenger's link, by email — once there is a link to send */
  const linked =
    place.kind === 'pax'
      ? groups.find(
          (g) => passengerOf(g) === place.name && (g.uploaded?.shareUrl ?? g.publish?.shareUrl)
        )
      : undefined

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
            selection.clearFiles()
          }}
          onAddPlace={addPlace}
          dropTarget={drag.placeDrop}
          overTarget={drag.overTarget}
          flashPlace={flashPlace}
        />

        <PlacePane
          place={place}
          onPlace={setPlace}
          summary={summary}
          query={query}
          onQuery={setQuery}
          note={note}
          folder={
            place.kind === 'dz'
              ? {
                  path: folderFor(place.name),
                  onChoose: () => setDialog({ kind: 'folder', destination: place.name })
                }
              : undefined
          }
          passenger={
            place.kind === 'pax'
              ? {
                  linked,
                  emailed: Boolean(linked && emailedOn(linked)),
                  onEmail: () => linked && setDialog({ kind: 'email', groupId: linked.id }),
                  /* the two ways back from a tandem, for the whole passenger — each asks first */
                  canTakeBack: !groups.some((g) => passengerOf(g) === place.name && g.freed),
                  busy: busy !== null,
                  onReset: () => setDialog({ kind: 'take-back', mode: 'reset', who: place.name }),
                  onDelete: () => setDialog({ kind: 'take-back', mode: 'delete', who: place.name })
                }
              : undefined
          }
          incoming={paneTarget}
          onImport={(list, target, where) => void importDropped(list, target, where)}>
          {(place.kind === 'sort' || place.kind === 'dz') && (
            <DaysPane
              grouped={place.kind === 'sort'}
              days={daysAndJumps.days}
              shownDays={daysAndJumps.shownDays}
              groups={shownGroups}
              looseFiles={shownLoose}
              query={query}
              jumps={{
                count: placeGroups.length,
                open: daysAndJumps.openDayJumps,
                isShut: daysAndJumps.jumpShut,
                foldAll: daysAndJumps.foldAll
              }}
              regroup={
                place.kind === 'sort'
                  ? {
                      loose: sorting.length,
                      busy: busy !== null,
                      running: busy === 'regroup',
                      onRegroup: () => send('regroup', { intent: 'regroup-loose' })
                    }
                  : undefined
              }
              row={{
                kind,
                shape: view,
                picked: pickedFiles,
                statusContext,
                proxies: board.proxies,
                deliveredName,
                onKind: setKind,
                onFile: fileLane,
                onDragFile: drag.startFileDrag,
                onSelectAll: selection.selectAll,
                onShiftJump: shiftJump,
                onOpenAt: daysAndJumps.openAt,
                overTarget: drag.overTarget,
                isJumpShut: daysAndJumps.jumpShut,
                onDragJump: drag.startJumpDrag,
                passengers,
                onMakeTandem: makeTandem,
                onToggleJump: daysAndJumps.toggleJump,
                groupDropTarget: drag.groupDropTarget,
                dragging: drag.dragging,
                busy: busy !== null
              }}
              onToggleDay={daysAndJumps.toggleDay}
              onCloseAll={daysAndJumps.closeAll}
              action={dayAction}
              strip={
                place.kind === 'dz' && board.uploading === `dest:${place.name}` && progress ? (
                  <UploadStrip progress={progress} />
                ) : null
              }
            />
          )}

          {place.kind === 'tandems' && (
            <TandemsGrid
              unnamed={unnamed}
              named={named}
              asOnStorage={asOnStorage}
              renaming={renaming}
              frozen={frozen}
              storage={board.storage}
              groupDropTarget={drag.groupDropTarget}
              onOpen={(who) => setPlace({ kind: 'pax', name: who })}
              onPreview={preview.handlePreview}
              onRename={setRenaming}
              onName={setPassenger}
              onEmail={(folder) => setDialog({ kind: 'email', folder })}
            />
          )}

          {place.kind === 'pax' && (
            <TandemPage
              groups={named.filter((g) => passengerOf(g) === place.name).map(asOnStorage)}
              gone={goneById}
              uploadedAt={(groupId) => groups.find((g) => g.id === groupId)?.uploaded?.at}
              facts={board.tandemFacts}
              busy={busy}
              uploading={board.uploading}
              progress={progress}
              kind={kind}
              onKind={setKind}
              shape={view}
              picked={pickedFiles}
              proxies={board.proxies}
              statusContext={statusContext}
              gateFor={gateFor}
              deliveredName={deliveredName}
              groupDropTarget={drag.groupDropTarget}
              onSelectAll={selection.selectAll}
              onFile={fileLane}
              onDragFile={drag.startFileDrag}
              onProcess={(group) => send(group.id, { intent: 'process', groupId: group.id })}
              onMontage={(group) => send(group.id, { intent: 'montage', groupId: group.id })}
              onOpenMontage={(group) =>
                send(`open:${group.id}`, { intent: 'open-montage', groupId: group.id })
              }
              onUpload={askUpload}
              onFree={(group) => setDialog({ kind: 'free', groupId: group.id })}
            />
          )}
        </PlacePane>
      </div>

      {pickedFiles.length > 0 && (
        <SelectionBar
          count={pickedFiles.length}
          onClear={selection.clearFiles}
        />
      )}

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
          if (mode === 'delete') setPlace({ kind: 'sort' })
        }}
        comparing={{
          open: selection.comparing,
          picked: selection.picked,
          onClose: () => selection.setComparing(false),
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
