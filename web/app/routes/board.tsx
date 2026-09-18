import {
  EDIT_LOCKED,
  ensureNasSession,
  furthestBehind,
  getOutputDir,
  goneFromStorage,
  hasCompletePassenger,
  lastSegment,
  listRemoteFiles,
  loadManifest,
  offGap,
  outputKeyOf,
  passengerName,
  passengerOf,
  processingNow,
  statProcessedOutputs,
  statProxies,
  statTandemArtifacts,
  tandemSteps,
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
import { Box, FilePanel, FolderPanel, JumpPanel, ManyPanel, Shell } from '../components/inspector'
import { PlacePane } from '../components/place-pane'
import { PlacesTree } from '../components/places-tree'
import { PreviewHost } from '../components/preview-host'
import { StorageFolder } from '../components/storage-folder'
import { StorageList } from '../components/storage-list'
import { StepTrail } from '../components/tandem-steps'
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
import { GROUPINGS, cardsOf, jumpLabels, sectionsOf } from '../helpers/sections'
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
import { templatesAnswerSchema } from '../../../packages/skydock-scripts/src/templateEntry'
import { routingEngine } from '../helpers/routing'
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
  /* which folder fills the pane */
  const [place, setPlace] = useState<Place>({ kind: 'sort' })
  /* videos, photos or both: one filter for the whole board, so what was chosen in a dropzone still
     holds in a tandem */
  const [kind, setKind] = useState<Kind>('all')
  const [query, setQuery] = useState('')
  /* which jump card is open, by jump */
  const [chosenCard, setChosenCard] = useState<string | null>(null)
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
  /* filed nowhere — neither as a lone file nor through its jump — and so free to go to the bin */
  const inUnsorted = (file: ManifestFile) => !file.destination && !groupOfFile(file)?.destination
  /* Deleting goes one step at a time: a file in a jump comes out of it and is loose; only a loose
     file in Unsorted, deleted again, goes to the bin. */
  const binnable = (file: ManifestFile) => inUnsorted(file) && !groupOfFile(file)
  /* a copy has nowhere to be sent back to — its original is wherever it already is — so it ends */
  const backLabel = (files: ManifestFile[]) =>
    files.every((f) => f.copyOf)
      ? `Remove ${files.length === 1 ? 'this copy' : 'these copies'} (⌫)`
      : files.every(inUnsorted)
        ? `Take out of ${files.length === 1 ? 'its jump' : 'their jumps'} (⌫)`
        : 'Send back to Fresh files (⌫)'
  const fileById = (id: string) =>
    [...groups.flatMap((g) => g.files), ...loose].find((f) => f.id === id)
  const askTrash = (files: ManifestFile[]) => setDialog({ kind: 'trash', files })
  /* The jump goes; its files stay, loose in Unsorted, crops and all. Only processed copies are
     lost — they no longer match where the files are — so that alone is asked about first. */
  const deleteJump = (group: ManifestGroup) => {
    const copies = group.files.filter((f) => f.processed).length
    if (
      copies > 0 &&
      !window.confirm(
        `Delete this jump? Its ${plural(group.files.length, 'file')} stay, loose in Fresh files, with their crops — but ${copies} processed ${copies === 1 ? 'copy' : 'copies'} will be deleted and have to be processed again.`
      )
    )
      return
    selection.clear()
    send('delete-jump', { intent: 'delete-jump', groupId: group.id })
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

  /* what the open folder holds, narrowed by what is typed in the search box */
  const family = familyOf(place)
  /* whether the storage's list says this tandem's passenger was sent their link */
  const emailedOn = (group: ManifestGroup) =>
    board.storage?.tandems.find((t) => t.folder === folderOnStorage(group))?.emailed ?? null

  /* Where each tandem has got to — one answer for its panel, its card and its passenger's entry in
     the menu, so the three can never disagree. */
  const progressOf = (group: ManifestGroup) =>
    group.destination === TANDEMS
      ? tandemSteps({
          group: asOnStorage(group),
          facts: board.tandemFacts[group.id],
          emailed: Boolean(emailedOn(group))
        })
      : null

  const passengerProgress = (name: string) =>
    furthestBehind(
      groups
        .filter((g) => g.destination === TANDEMS && passengerOf(g) === name)
        .flatMap((g) => {
          const progress = progressOf(g)
          return progress ? [progress] : []
        })
    )

  /* A tandem freed and walked to its last step has nothing left to do here, so it leaves the
     tandems — its passenger's entry too — and lives on in the storage's own list of tandems. */
  const finished = (group: ManifestGroup) =>
    Boolean(group.freed) && progressOf(group)?.next === null
  const listed = groups.filter((g) => !finished(g))

  const placeGroups = groupsIn(place, listed).map(asOnStorage)
  /* the one tandem of the passenger whose page is open, when they have just the one */
  const soleTandem =
    place.kind === 'pax' && placeGroups.length === 1
      ? groups.find((g) => g.id === placeGroups[0]?.id)
      : undefined
  /* the files still to be sorted — loose, or in a jump filed nowhere — by what they contain, which
     is how the storage's list knows the files of a tandem this board may have forgotten */
  const toSort = new Set(
    [
      ...loose.filter((f) => !f.destination),
      ...groups.filter((g) => !g.destination).flatMap((g) => g.files)
    ].flatMap((f) => (f.id ? [f.id] : []))
  )
  /* A dropzone and a passenger are connected to their folder on the storage, which is listed under
     their own files. A passenger is found among every tandem, the finished ones too: theirs is
     exactly the folder worth watching from here once nothing of it is left on this machine. */
  const storageWhere =
    place.kind === 'dz'
      ? { destination: place.name }
      : place.kind === 'pax'
        ? (() => {
            const theirs = groups.find(
              (g) => g.destination === TANDEMS && passengerOf(g) === place.name
            )
            return theirs ? { groupId: theirs.id } : null
          })()
        : null
  const placeLoose = looseIn(place, loose)
  const placeFiles = filesIn(place, listed, loose)
  /* the delivered files this machine still holds, by name — copies that are really on the disk, and
     a tandem's film — so each file on the storage can say whether it is here too */
  const hereToo = new Set([
    ...placeFiles.flatMap((f) =>
      f.processed && board.outputs[outputKeyOf(f)]?.exists ? [lastSegment(f.processed.path)] : []
    ),
    ...placeGroups.flatMap((g) => {
      const film = board.tandemFacts[g.id]?.film
      return film ? [lastSegment(film.path)] : []
    })
  ])
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
  /* By jump, the jumps are cards and one is open: the one last chosen while it is still here, or
     else the first. Only its files are on screen. */
  const cardSections = cardsOf(sections)
  /* files a jump holds against the gap rule, flagged where they are drawn */
  const offGapFiles = new Set(groups.flatMap((g) => [...offGap(g.files)]))
  const openCard =
    grouping === 'jump'
      ? (cardSections.find((s) => s.key === chosenCard) ?? cardSections[0])
      : undefined
  /* The jump whose card is open — the one last chosen, or else the first. Its files are what is
     listed and its card is the one lit, so it is also the jump the panel describes and the one a
     second jump is compared with: one answer to "which jump is this about", not two. */
  const openJump =
    openCard?.kind === 'jump' ? groups.find((g) => g.id === openCard.group.id) : undefined
  const onScreen = openCard ? [openCard] : sections
  /* files are in the order they were shot */
  const sortKey = (file: ManifestFile) => file.mtime
  /* every file on screen, in the order it is drawn, for the arrow keys to step through */
  const order = onScreen.flatMap((s) =>
    s.kind === 'jump' && s.group.freed ? [] : lanesOf(s.files, kind, sortKey).flat()
  )

  const selection = useSelection({
    order,
    pickable: (id) => {
      const found = fileById(id)
      return Boolean(found) && !lockReason(found!, statusContext(found!))
    },
    paused: preview.preview !== null || dialog !== null,
    onOpen: openFile,
    /* Delete takes files one step back: out of a jump or a place, to be loose in Unsorted; loose
       files already there have nowhere further back to go, so for them it asks about the bin */
    onDelete: (ids) => {
      const files = ids.flatMap((id) => {
        const found = fileById(id)
        return found ? [found] : []
      })
      if (files.length > 0 && files.every(binnable)) askTrash(files)
      else moveFiles(ids, { destination: null })
    }
  })
  const { pickedFiles } = selection

  /* Files leave their jump and are re-filed server-side, so the answer is the truth. `newGroup`
     gathers them into a jump of their own — what a tandem needs, since the passenger name lives on
     a group; without it the files would land as lone files and fall back to the sorting area. */
  const moveFiles = (ids: string[], where: Move) => {
    if (ids.length === 0) return
    selection.clear()
    /* Copied into another jump, the files stay where they are as well — so one that cannot move can
       still be copied: nothing about it changes. Only a freed one cannot, having no file here. */
    if (where.copy && where.targetGroupId) {
      const here = ids.filter((id) => !fileById(id)?.freed)
      if (here.length === 0) setNote('Freed from this machine — there is no file here to copy.')
      else if (frozen.has(where.targetGroupId)) setNote(EDIT_LOCKED)
      else send('copy', { intent: 'copy-files', fileIds: here, targetGroupId: where.targetGroupId })
      return
    }
    /* a file that cannot move is carried only so that it can be copied */
    const locked = ids.filter((id) => {
      const file = fileById(id)
      return file && !frozenFiles.has(id) && lockReason(file, statusContext(file))
    })
    if (locked.length === ids.length) {
      setNote(
        'On the storage already, so it cannot move — hold alt while dropping to copy it instead.'
      )
      return
    }
    /* a tandem with an edit neither gives files up nor takes them in */
    const free = ids.filter((id) => !frozenFiles.has(id) && !locked.includes(id))
    if (free.length === 0 || (where.targetGroupId && frozen.has(where.targetGroupId))) {
      setNote(
        free.length === 0 && where.targetGroupId
          ? `${EDIT_LOCKED} Hold alt while dropping to copy it into the other jump instead.`
          : EDIT_LOCKED
      )
      return
    }
    send('move', {
      intent: 'move-files',
      fileIds: free,
      ...(where.targetGroupId ? { targetGroupId: where.targetGroupId } : {}),
      ...(where.destination ? { destination: where.destination } : {}),
      ...(where.newGroup ? { newGroup: true } : {}),
      ...(where.name ? { name: where.name } : {}),
      ...(where.startsAt !== undefined ? { anchorEpoch: where.startsAt } : {})
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

  /* only what the jump is called on the board — no file is named after it, so nothing processed
     goes stale */
  const renameJump = (groupId: string, name: string) => {
    if (frozen.has(groupId)) return
    updateGroups(
      groups.map((g) => (g.id === groupId ? { ...g, name: name.trim() || undefined } : g))
    )
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
  const hostOf = (who: string) => named.find((g) => passengerOf(g) === who)

  const openConnect = () => {
    nas.markDialogOpened()
    setDialog({ kind: 'connect' })
  }

  /* A place's folder is part of the workspace, so it is saved with the destinations list like any
     other board edit; the backup folder belongs to no place, and is kept with the storage session. */
  const chooseFolder = (path: string, destination?: string, target?: 'backup') => {
    if (destination === undefined) {
      if (target === 'backup') nas.selectFolder(path, 'backup')
    } else {
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

  /* A template is somebody's branding, so which one is never decided here. With a single template
     that is whole and close enough to the editor's kdenlive there is nothing to decide and the
     montage is made at once; with several, or one with a hole or a warning, the person is shown
     them first. */
  const makeMontage = (groupId: string, template?: string) =>
    send(groupId, { intent: 'montage', groupId, ...(template ? { template } : {}) })
  const askMontage = async (group: ManifestGroup) => {
    const parsed = templatesAnswerSchema.safeParse(
      await routingEngine.loader({ url: '/api/templates' }).catch(() => null)
    )
    const only =
      parsed.success && parsed.data.templates.length === 1 ? parsed.data.templates[0] : null
    if (only && !only.gap && only.missing.length === 0) makeMontage(group.id, only.name)
    else setDialog({ kind: 'templates', groupId: group.id })
  }

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
          onMontage={() => void askMontage(group)}
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
    place.kind === 'sort'
      ? { target: 'sort', where: 'Fresh files' }
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

  /* Only what is about the storage as a whole. Which folder is whose is said where it matters: a
     place's folder on the place, the backup folder in the upload that uses it. */
  const nasLinks: NasLink[] = nas.connected
    ? [
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
            title='Undo the tandem, at any step — its files go back to Fresh files, loose, without their name or crops'
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
    const everyFile = [...groups.flatMap((g) => g.files), ...loose]
    const picked = pickedFiles.flatMap((id) => {
      const found = everyFile.find((f) => f.id === id)
      return found ? [found] : []
    })
    /* the file looked at last, or else the one picked — whichever was done most recently, since
       picking clears the look */
    const previewed = selection.previewed
      ? everyFile.find((f) => f.id === selection.previewed)
      : undefined
    const one = previewed ?? (picked.length === 1 ? picked[0] : undefined)
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
          onOpen={() => openFile(one)}
          onSendBack={() => moveFiles([one.id ?? ''], { destination: null })}
          onTrash={binnable(one) ? () => askTrash([one]) : undefined}
          backLabel={backLabel([one])}
          onRetime={
            lockReason(one, context)
              ? undefined
              : (epoch) =>
                  send('retime', {
                    intent: 'retime-file',
                    fileIds: [one.id ?? ''],
                    anchorEpoch: epoch
                  })
          }
        />
      )
    }
    if (picked.length > 1) {
      const ids = picked.flatMap((f) => (f.id ? [f.id] : []))
      return (
        <ManyPanel
          files={picked}
          statusOf={statusOf}
          onSendBack={() => moveFiles(ids, { destination: null })}
          onTrash={picked.every(binnable) ? () => askTrash(picked) : undefined}
          backLabel={backLabel(picked)}
          onMakeJump={
            picked.every(inUnsorted)
              ? (name, startsAt) =>
                  moveFiles(ids, { destination: null, newGroup: true, name, startsAt })
              : undefined
          }
          onClear={selection.clear}
        />
      )
    }
    /* A passenger with one tandem is that tandem: opening the passenger is opening it, so its panel
       is here without being asked for, and no card stands above its files saying the same things. */
    const jump =
      (selection.pickedJump ? groups.find((g) => g.id === selection.pickedJump) : undefined) ??
      openJump ??
      soleTandem
    if (jump) {
      const shown = asOnStorage(jump)
      return (
        <JumpPanel
          key={jump.id}
          group={shown}
          label={labels.get(jump.id) ?? jump.label}
          facts={board.tandemFacts[jump.id]}
          emailed={Boolean(emailedOn(jump))}
          locked={
            jump.freed
              ? 'Freed from this machine — it is on the storage only now.'
              : frozen.has(jump.id)
                ? `${EDIT_LOCKED} Open it in kdenlive, or reset the tandem.`
                : null
          }
          statusOf={statusOf}
          passengers={passengers}
          onMakeTandem={(passenger) => makeTandem(jump.id, passenger)}
          onName={(first, last) => setPassenger(jump.id, first, last)}
          onSelectFiles={() => selection.selectFiles(jump.files)}
          onShift={
            jump.freed || frozen.has(jump.id) || busy !== null
              ? undefined
              : (at) => shiftJump(jump.id, at)
          }
          onRename={
            jump.destination === TANDEMS || jump.freed || frozen.has(jump.id)
              ? undefined
              : (name) => renameJump(jump.id, name)
          }
          /* A named tandem can be deleted at whatever step it has reached, through the dialog that
             says what goes with it; only a freed one cannot, having nothing left here to put back.
             Any other jump goes the plain way, which an edit or an upload closes. */
          onDelete={
            jump.freed
              ? undefined
              : jump.destination === TANDEMS && hasCompletePassenger(jump.passenger)
                ? () => setDialog({ kind: 'take-back', mode: 'delete', who: passengerOf(jump) })
                : frozen.has(jump.id) || jump.uploaded
                  ? undefined
                  : () => deleteJump(jump)
          }
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
                group={asOnStorage(g)}
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
        onTemplates={() => setDialog({ kind: 'templates' })}
        proxies={board.proxyProgress}
        nas={{ connected: nas.connected, host: nas.host, links: nasLinks }}
      />

      <div className='grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] min-[781px]:grid-cols-[250px_minmax(0,1fr)] min-[781px]:grid-rows-[minmax(0,1fr)] min-[1101px]:grid-cols-[250px_minmax(0,1fr)_300px]'>
        <PlacesTree
          place={place}
          destinations={places}
          groups={listed}
          looseFiles={loose}
          storage={board.storage}
          statusContext={statusContext}
          tandemOpen={(g) => !asOnStorage(g).uploaded}
          passengerProgress={passengerProgress}
          onPick={pickPlace}
          onAddPlace={addPlace}
          dropTarget={drag.placeDrop}
          overTarget={drag.overTarget}
          flashPlace={flashPlace}
        />

        <PlacePane
          place={place}
          summary={summary}
          files={placeFiles}
          query={query}
          onQuery={setQuery}
          grouping={{
            value: grouping,
            options: groupingOptions,
            onChange: (g) => family !== 'storage' && setGroupingBy({ ...groupingBy, [family]: g })
          }}
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
                waitingFiles={(entry) => (entry.files ?? []).filter((f) => toSort.has(f.id)).length}
                onRestore={(folders) => send('restore', { intent: 'restore-tandems', folders })}
              />
            </div>
          ) : (
            <FileBrowser
              sections={sections}
              cards={
                openCard
                  ? {
                      hidden: soleTandem !== undefined,
                      open: openCard.key,
                      onOpen: (key) => {
                        setChosenCard(key)
                        /* the loose card is no jump: the inspector lets go of the last one */
                        if (key === 'loose') selection.clear()
                      }
                    }
                  : undefined
              }
              kind={kind}
              shape={view}
              picked={pickedFiles}
              sortKey={sortKey}
              statusContext={statusContext}
              statusOf={statusOf}
              proxies={board.proxies}
              live={board.liveFiles}
              deliveredName={deliveredName}
              onFile={(file: ManifestFile, lane: ManifestFile[], e: Modifiers) =>
                selection.clickFile(file, lane, e)
              }
              onPick={selection.pickFile}
              previewed={selection.previewed}
              offGap={offGapFiles}
              onOpen={openFile}
              onDragFile={drag.startFileDrag}
              empty={
                query.trim()
                  ? 'Nothing here matches that.'
                  : family === 'sort'
                    ? 'Nothing left to sort. Copy more cameras off and rescan to see their jumps here.'
                    : 'Nothing here yet. Drag a jump onto this folder, or drop files from the computer.'
              }
              jump={{
                selected: selection.pickedJump ?? openJump?.id ?? null,
                frozen,
                overTarget: drag.overTarget,
                dropTarget: (id) => drag.groupDropTarget(id),
                onSelect: (groupId, e) => selection.selectJump(groupId, e, openJump?.id),
                onDrag: drag.startJumpDrag,
                actions: tandemActions,
                above: tandemAbove,
                progress: progressOf
              }}
            />
          )}
          {nas.connected && storageWhere && (
            <StorageFolder
              key={placeKey(place)}
              where={storageWhere}
              stamp={board.remoteAfterUpload?.at}
              hereToo={hereToo}
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
        onMontage={(groupId, template) => {
          setDialog(null)
          makeMontage(groupId, template)
        }}
        onTrash={(files) => {
          setDialog(null)
          selection.clear()
          send('trash', {
            intent: 'trash-unsorted',
            fileIds: files.flatMap((f) => (f.id ? [f.id] : []))
          })
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
