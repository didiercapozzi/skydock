import {
  EDIT_LOCKED,
  hasCompletePassenger,
  isMontage,
  isVideoFile,
  lastSegment,
  offGap,
  outputKeyOf,
  passengerName,
  passengerOf,
  waitingForProxy,
  idsOf,
  lostOf
} from '@skydock/scripts'
import { goneSent } from '@skydock/scripts'
import type { FileStatus } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router'
import { Danger, Go, Mini, Seg } from '../components/buttons'
import { BinFiles } from '../components/bin-files'
import { CameraFiles } from '../components/camera-files'
import { ComparisonDialog } from '../components/comparison-dialog'
import { FileBrowser } from '../components/file-browser'
import { lanesOf, lockReason, shownStatus } from '../components/file-list'
import { DestinationHeader } from '../components/destination-header'
import { FolderOwed } from '../components/folder-owed'
import { FilePanel, FolderPanel, JumpPanel, ManyPanel, Part, Shell } from '../components/inspector'
import { MoveTo } from '../components/move-to'
import { PlacePane } from '../components/place-pane'
import { FolderCard, StorageCards, StorageFolder } from '../components/storage-folder'
import { StorageList } from '../components/storage-list'
import {
  FilmNote,
  FilmStrip,
  GoneFromStorage,
  MontageCardActions,
  UploadedCards
} from '../components/montage-card'
import { NextStep, StepTrail } from '../components/montage-steps'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { formatSize, getPictureUrl } from '../components/utils'
import { folderOnStorage } from '../helpers/jumps'
import {
  familyOf,
  fileHref,
  filesIn,
  groupsIn,
  holdsItsOwn,
  looseIn,
  placeFromParams,
  placeKey,
  placeLabel,
  stillHere
} from '../helpers/places'
import type { Place } from '../helpers/places'
import { useSafeSearchParams } from '../helpers/routing'
import { GROUPINGS, cardsOf, sectionsOf } from '../helpers/sections'
import { boardViewSchema } from '../helpers/view'
import { useCameraCopying } from '../hooks/liveStore'
import { StorageTwinsContext } from '../hooks/storageTwins'
import { useStorageFolder } from '../hooks/useStorageFolder'
import { useTransfersPanel } from '../hooks/transfersPanel'
import { useBoard } from '../hooks/useBoardModel'
import type { BoardModel } from '../hooks/useBoardModel'
import { useSelection } from '../hooks/useSelection'

/* A folder of the board, by its address: /dropzone/yverdon, /montage/Lily%20DONZALLAZ, /storage.
   The board around it is the layout — the rail, the dialogs, what the whole board shares — and this
   draws the folder itself: what it holds, arranged and narrowed as its address says, and the panel
   beside it describing what is selected. The address carries how the folder is being looked at:
   which kind of file is shown, what is being looked for, how the files are grouped, which jump card
   is open. A file opened in it is its own address below this one. */
const searchParamsArgs = boardViewSchema

/* every list newest first: the latest file shot at the top */
const sortKey = (file: ManifestFile) => -file.mtime

/* what each family of folder does when the address says nothing */
const GROUPING_BY = { sort: 'jump', dz: 'day', montages: 'jump' } as const

/* The folder's own view of the board: what is in it, as the address asks for it. */
const useFolder = (model: BoardModel, place: Place) => {
  const { board, asOnStorage, listed, deliveredName } = model
  const { searchParams: looking } = useSafeSearchParams(boardViewSchema)
  const query = looking.find ?? ''
  const family = familyOf(place)
  /* A dropzone's page is what this machine holds: its freed files are listed with the storage's own
     files under them rather than twice over (RULES, Freeing space). */
  const groups = groupsIn(place, listed)
    .map(asOnStorage)
    .map((group) => ({ ...group, files: stillHere(place, group.files) }))
    .filter((group) => group.files.length > 0 || !holdsItsOwn(place))
  const loose = stillHere(place, looseIn(place, board.loose))
  const files = [...groups.flatMap((g) => g.files), ...loose]
  const needle = query.trim().toLowerCase()
  const matches = (file: ManifestFile) =>
    !needle ||
    file.filename.toLowerCase().includes(needle) ||
    Boolean(deliveredName(file)?.toLowerCase().includes(needle))
  const shownGroups = needle
    ? groups
        .map((g) => ({ ...g, files: g.files.filter(matches) }))
        .filter((g) => g.files.length > 0)
    : groups
  const options = family === 'storage' ? GROUPINGS.sort : GROUPINGS[family]
  const grouping =
    family === 'storage'
      ? 'none'
      : looking.by && options.includes(looking.by)
        ? looking.by
        : options.includes(GROUPING_BY[family])
          ? GROUPING_BY[family]
          : (options[0] ?? 'none')
  const sections = sectionsOf(place, grouping, shownGroups, loose.filter(matches), groups)
  /* By jump, the jumps are cards and one is open: the one last chosen while it is still here, or
     else the first. Only its files are on screen. */
  const cards = cardsOf(sections)
  const openCard =
    grouping === 'jump' ? (cards.find((s) => s.key === looking.card) ?? cards[0]) : undefined
  return {
    looking,
    query,
    family,
    groups,
    loose,
    files,
    options,
    grouping,
    sections,
    openCard
  }
}

const Place = () => {
  const model = useBoard()
  const transfersPanel = useTransfersPanel()
  const { board, frozen, statusContext, statusOf, setDialog } = model
  const { groups, busy, send, setNote, setProblem } = board
  const copying = useCameraCopying()
  const address = useParams()
  const place = placeFromParams(address)
  const goTo = useNavigate()
  const { setSearchParams: look } = useSafeSearchParams(boardViewSchema)
  const folder = useFolder(model, place)
  const { looking, query, family, openCard, sections } = folder
  const kind = looking.kind ?? 'all'

  /* The jump whose card is open: its files are what is listed and its card is the one lit, so it is
     also the jump the panel describes and the one a second jump is compared with. */
  const openJump =
    openCard?.kind === 'jump' ? groups.find((g) => g.id === openCard.group.id) : undefined
  /* a montage with a single jump is that jump: its panel is open without being asked for */
  const soleMontage =
    place.kind === 'pax' && folder.groups.length === 1
      ? groups.find((g) => g.id === folder.groups[0]?.id)
      : undefined
  const onScreen = openCard ? [openCard] : sections
  /* every file on screen, in the order it is drawn, for the arrow keys to step through */
  const order = onScreen.flatMap((s) =>
    s.kind === 'jump' && s.group.freed ? [] : lanesOf(s.files, kind, sortKey).flat()
  )
  /* a freed file has nothing here to show: it is played from the storage's list below instead */
  const openFile = (file: ManifestFile) =>
    file.freed ? undefined : goTo(fileHref(place, file.id ?? file.path, looking))

  const selection = useSelection({
    order,
    pickable: (id) => {
      const found = model.fileById(id)
      return Boolean(found) && !lockReason(found!, statusContext(found!))
    },
    paused: address.fileId !== undefined || model.dialog !== null,
    onOpen: openFile,
    /* Delete takes files one step back; loose files already in Fresh files are offered the bin */
    onDelete: (ids) => {
      const files = ids.flatMap((id) => {
        const found = model.fileById(id)
        return found ? [found] : []
      })
      model.sendBack(files)
    }
  })
  /* a change elsewhere took the picks away, or another folder was opened: let go of them */
  const [seen, setSeen] = useState({
    gone: model.picksGone,
    at: placeKey(place)
  })
  if (seen.gone !== model.picksGone || seen.at !== placeKey(place)) {
    setSeen({ gone: model.picksGone, at: placeKey(place) })
    selection.clear()
  }

  /* A jump made from picked files is opened as soon as it exists — its card, and with it its panel.
     Its id is the server's to give, so it is known by its first file, once the answer has that file
     in a jump it was not in before; a move that was refused opens nothing. */
  const [makingJump, setMakingJump] = useState<{
    file: string
    from?: string
  } | null>(null)
  const made =
    makingJump && busy === null
      ? groups.find((g) => g.files.some((f) => f.id === makingJump.file))
      : undefined
  const toOpen = made && made.id !== makingJump?.from ? `jump:${made.id}` : null
  if (makingJump && busy === null && (toOpen === null || looking.card === toOpen))
    setMakingJump(null)
  /* the open card is part of the folder's address, and the address is the browser's */
  useEffect(() => {
    if (toOpen) look({ card: toOpen })
  }, [toOpen, look])

  /* only what the storage still holds: a delivery whose folder was taken away is not counted */
  const montages = (board.storage?.montages ?? []).filter(
    (m) => lostOf(board.storage?.lost, m.folder) !== 'folder'
  ).length
  const jumps = folder.groups.length
  const fileCount = folder.files.length
  const summary =
    place.kind === 'storage'
      ? plural(montages, { one: '# montage', other: '# montages' })
      : [
          jumps && family !== 'dz' ? plural(jumps, { one: '# jump', other: '# jumps' }) : null,
          plural(fileCount, { one: '# file', other: '# files' }),
          formatSize(folder.files.reduce((n, f) => n + f.size, 0))
        ]
          .filter(Boolean)
          .join(' · ')

  /* where a file from the computer dropped anywhere on the pane goes — the folder it shows */
  const paneHost = place.kind === 'pax' ? model.hostOf(place.name) : undefined
  const paneTarget =
    place.kind === 'sort'
      ? { target: 'sort', where: t`Fresh files` }
      : place.kind === 'dz'
        ? { target: `dest:${place.name}`, where: place.name }
        : paneHost && !frozen.has(paneHost.id)
          ? { target: `group:${paneHost.id}`, where: passengerOf(paneHost) }
          : null

  /* A dropzone and a montage are connected to their folder on the storage, listed under their own
     files — a montage found among every one, the finished ones too. */
  const storageWhere =
    place.kind === 'dz'
      ? { destination: place.name }
      : place.kind === 'pax'
        ? (() => {
            const theirs = groups.find((g) => isMontage(g) && passengerOf(g) === place.name)
            return theirs ? { groupId: theirs.id } : null
          })()
        : null
  /* the delivered files this machine still holds, by name, so each file on the storage can say
     whether it is here too */
  const hereToo = new Set([
    ...folder.files.flatMap((f) =>
      f.processed && board.outputs[outputKeyOf(f)]?.exists ? [lastSegment(f.processed.path)] : []
    ),
    ...folder.groups.flatMap((g) => {
      const film = board.montageFacts[g.id]?.film
      return film ? [lastSegment(film.path)] : []
    })
  ])
  /* What the storage holds of a dropzone's folder, asked here and not by the list alone: each file
     here that is up there too says so on its own row, and the list under them is what is only there. */
  const [lookedAgain, setLookedAgain] = useState(0)
  const storageListing = useStorageFolder(
    place.kind === 'dz' && model.nas.connected ? storageWhere : null,
    `${String(board.remoteAfterUpload?.at)}:${lookedAgain}`
  )
  const twins = {
    byName: new Map((storageListing?.ok ? storageListing.files : []).map((f) => [f.name, f])),
    dsmHost: model.nas.host ?? null
  }
  /* the files still to be sorted, by what they contain — how the storage's list knows a montage
     this board may have forgotten */
  const toSort = new Set(idsOf(filesIn({ kind: 'sort' }, groups, board.loose)))

  /* A montage that has been uploaded is in two places: the files kept on this machine, and its folder
     on the storage. They are two views of one montage, so a tab switches between them rather than
     the one being found under the other. It opens on what is here — for a montage freed from this
     machine nothing is, so it opens on the storage's, where how it was handed over is shown. */
  const [chosen, setChosen] = useState<{ key: string; view: 'local' | 'storage' } | null>(null)
  const twoViews =
    model.nas.connected &&
    storageWhere !== null &&
    (place.kind === 'dz' || (place.kind === 'pax' && folder.groups.some((g) => g.uploaded)))
  /* nothing of it is left here: a destination whose files were all freed, a montage freed whole */
  const nothingHere =
    place.kind === 'dz'
      ? folder.files.length > 0 && folder.files.every((f) => f.freed)
      : folder.groups.length > 0 && folder.groups.every((g) => g.freed)
  const view: 'local' | 'storage' | 'both' = !twoViews
    ? 'both'
    : chosen?.key === placeKey(place)
      ? chosen.view
      : nothingHere
        ? 'storage'
        : 'local'

  return (
    <StorageTwinsContext value={place.kind === 'dz' ? twins : null}>
      <PlacePane
        place={place}
        summary={summary}
        files={folder.files}
        query={query}
        onQuery={(find) => look({ find: find || undefined }, { replace: true })}
        grouping={{
          value: folder.grouping,
          options: folder.options,
          onChange: (by) => look({ by })
        }}
        kind={{ value: kind, onChange: (next) => look({ kind: next }) }}
        tools={<PlaceTools place={place} />}
        head={
          place.kind === 'dz'
            ? (controls) => (
                <DestinationHeader
                  name={placeLabel(place)}
                  summary={summary}
                  path={model.folderFor(place.name)}
                  stages={{
                    unprocessed: folder.files.filter((f) => statusOf(f) === 'local').length,
                    unsent: folder.files.filter((f) => statusOf(f) === 'processed').length,
                    onStorage: folder.files.filter((f) => statusOf(f) === 'uploaded').length
                  }}
                  actions={<DropzoneStep name={place.name} />}
                  onChangeFolder={() => setDialog({ kind: 'folder', destination: place.name })}
                  onRemove={() => setDialog({ kind: 'remove-place', place: place.name })}
                  removing={busy === `remove:dz:${place.name}`}
                  busy={busy !== null}
                  controls={controls}
                />
              )
            : undefined
        }
        left={
          place.kind === 'dz' ? undefined : (
            <FolderOwed
              place={place}
              groups={folder.groups}
              loose={folder.loose}
              facts={board.montageFacts}
              busy={busy !== null}
              onRegroup={() => send('regroup', { intent: 'regroup-loose' })}
              onReset={model.resetFresh}
              onPlace={model.pickPlace}
            />
          )
        }
        note={
          board.note
            ? {
                text: board.note,
                problem: board.noteIsProblem,
                onClose: () => setNote(null),
                ...(board.noteIsProblem && transfersPanel.trouble
                  ? { onOpen: transfersPanel.show }
                  : {})
              }
            : null
        }
        incoming={paneTarget}
        onImport={(list, target, where) => void model.importDropped(list, target, where)}>
        {twoViews && (
          <div className='pt-1 pb-1'>
            <Seg
              label={t`Where to look`}
              value={view === 'storage' ? 'storage' : 'local'}
              options={[
                ['local', t`Local`],
                ['storage', t`On the storage`]
              ]}
              onPick={(next) => setChosen({ key: placeKey(place), view: next })}
            />
          </div>
        )}
        {place.kind === 'camera' ? (
          <CameraFiles
            mount={place.name}
            stamp={`${board.cameras.map((c) => c.mount).join('\n')}\n${copying ? 'copying' : ''}`}
            onNote={setNote}
            onCopyBack={(paths) => send('copy-back', { intent: 'copy-back', paths })}
          />
        ) : place.kind === 'bin' ? (
          <BinFiles
            /* read again when files left the board or came back to it, not after every change */
            stamp={board.loose.length + groups.reduce((n, g) => n + g.files.length, 0)}
            bringing={busy === 'from-bin'}
            onBringBack={(paths) => send('from-bin', { intent: 'from-bin', paths })}
          />
        ) : place.kind === 'storage' ? (
          <div className='pt-3'>
            <StorageList
              storage={board.storage}
              dsmHost={model.nas.host}
              places={board.places}
              remote={model.nas.remote}
              isHere={(entry) => groups.some((g) => folderOnStorage(g) === entry.folder)}
              groupOf={(entry) => groups.find((g) => folderOnStorage(g) === entry.folder)}
              onEmail={(entry) => setDialog({ kind: 'email', folder: entry.folder })}
              onLink={(entry, make) =>
                send(`link:${entry.folder}`, {
                  intent: 'montage-link',
                  link: { folder: entry.folder, make }
                })
              }
              waitingFiles={(entry) => (entry.files ?? []).filter((f) => toSort.has(f.id)).length}
              onRestore={(folders) => send('restore', { intent: 'restore-montages', folders })}
            />
          </div>
        ) : view === 'storage' ? null : (
          <FileBrowser
            sections={sections}
            cards={
              openCard
                ? {
                    hidden: soleMontage !== undefined,
                    open: openCard.key,
                    onOpen: (key) => {
                      look({ card: key })
                      /* A card asks for its own panel: a file looked at or picked in the jump would
                         otherwise keep it, and the jump's could not be got back to. The loose card
                         is no jump, so the panel lets go of the last one as well. */
                      selection.clear()
                    }
                  }
                : undefined
            }
            kind={kind}
            shape={model.view}
            picked={selection.pickedFiles}
            sortKey={sortKey}
            statusContext={statusContext}
            statusOf={statusOf}
            proxies={board.proxies}
            deliveredName={model.deliveredName}
            onFile={selection.clickFile}
            onPick={selection.pickFile}
            previewed={selection.previewed}
            offGap={new Set(groups.flatMap((g) => [...offGap(g.files)]))}
            onOpen={openFile}
            onDragFile={(file, e) => model.drag.startFileDrag(file, selection.pickedFiles, e)}
            empty={
              query.trim()
                ? t`Nothing here matches that.`
                : family === 'sort'
                  ? t`Nothing left to sort. Copy more cameras off and rescan to see their jumps here.`
                  : t`Nothing here yet. Drag a jump onto this folder, or drop files from the computer.`
            }
            jump={{
              selected: selection.pickedJump ?? openJump?.id ?? null,
              frozen,
              overTarget: model.drag.overTarget,
              dropTarget: (id) => model.drag.groupDropTarget(id),
              onSelect: (groupId, e) => selection.selectJump(groupId, e, openJump?.id),
              onDrag: model.drag.startJumpDrag,
              actions: (group) => <MontageActions group={group} />,
              /* by jump, the film stands beside the montage's next step; any other way, above it */
              above: (group) => (
                <MontageAbove
                  group={group}
                  withFilm={folder.grouping !== 'jump'}
                  tabbed={twoViews}
                />
              ),
              progress: model.progressOf
            }}
          />
        )}
        {/* on the storage's tab: how each montage was handed over, with what can be done to each item
            up there — the folder's files are not listed a second time under the cards */}
        {place.kind === 'pax' && twoViews && view === 'storage' && storageWhere && (
          <StorageCards
            key={placeKey(place)}
            where={storageWhere}
            stamp={board.remoteAfterUpload?.at}
            onProblem={setProblem}>
            {(itemActions) => (
              <div className='mb-2 flex flex-col gap-3'>
                {folder.groups.filter(isMontage).map((g) => (
                  <HandedOver
                    key={g.id}
                    group={g}
                    itemActions={itemActions}
                    onLink={(dir, make) =>
                      send(`link:${dir}`, { intent: 'montage-link', link: { folder: dir, make } })
                    }
                  />
                ))}
              </div>
            )}
          </StorageCards>
        )}
        {/* a dropzone's storage tab shows its folder up there as the card a montage's handed-over folder
            is, with its link at the foot; any other folder with no cards over it lists it under its files */}
        {place.kind === 'dz' && twoViews && view === 'storage' && (
          <FolderCard
            listing={storageListing}
            dsmHost={model.nas.host}
            hereToo={hereToo}
            onAgain={() => setLookedAgain(lookedAgain + 1)}
            onProblem={setProblem}
          />
        )}
        {place.kind !== 'dz' &&
          model.nas.connected &&
          storageWhere &&
          view !== 'local' &&
          !(place.kind === 'pax' && twoViews) && (
            <StorageFolder
              key={placeKey(place)}
              where={storageWhere}
              dsmHost={model.nas.host}
              stamp={board.remoteAfterUpload?.at}
              hereToo={hereToo}
              onProblem={setProblem}
            />
          )}
      </PlacePane>

      <Shell>
        <Inspector
          place={place}
          folder={folder}
          selection={selection}
          jump={
            (selection.pickedJump
              ? groups.find((g) => g.id === selection.pickedJump)
              : undefined) ??
            openJump ??
            soleMontage
          }
          summary={summary}
          onOpenFile={openFile}
          onMakingJump={setMakingJump}
        />
      </Shell>

      {selection.comparing && (
        <ComparisonDialog
          groups={groups}
          leftGroupId={selection.comparing[0]}
          rightGroupId={selection.comparing[1]}
          onClose={() => selection.setComparing(null)}
          onMerge={(leftId, rightId, anchorEpoch) => {
            selection.setComparing(null)
            selection.clear()
            send('merge', {
              intent: 'merge-groups',
              leftId,
              rightId,
              anchorEpoch
            })
          }}
        />
      )}

      {/* the file open in this folder, when the address names one */}
      <Outlet context={model} />
    </StorageTwinsContext>
  )
}

/* A dropzone is processed, then uploaded, as a whole (RULES, Acting): the step stands beside the
   counts of what is owed, and means everything in the folder that needs it — never what a search or
   a filter happens to be showing. */
const DropzoneStep = ({ name }: { name: string }) => {
  const model = useBoard()
  const { board, statusOf, gateFor } = model
  const { busy, send } = board
  const files = filesIn({ kind: 'dz', name }, board.groups, board.loose)
  if (files.length === 0) return null
  const label = `dz:${name}`
  const waiting = (state: FileStatus) => files.filter((f) => statusOf(f) === state).length
  const toProcess = waiting('local')
  const toUpload = waiting('processed')
  /* what is proved on the storage can be freed from here, whatever is still to upload */
  const free =
    model.freeableOf(name).files.length > 0 ? (
      <Mini
        disabled={busy !== null}
        title={t`Delete from this machine what ${name} has on the storage, once the storage is proved to hold it. Asks first.`}
        onClick={() =>
          model.nas.connected
            ? model.setDialog({ kind: 'free-place', place: name })
            : model.openConnect()
        }>
        {busy === `free:dz:${name}` ? t`Checking the storage…` : t`Free up space…`}
      </Mini>
    ) : null
  if (gateFor(files).blocked) {
    const needs = (f: ManifestFile) => statusOf(f) === 'local'
    return (
      <>
        <Go
          disabled={busy !== null}
          title={t`Make the copies that get handed over, for everything in ${name} that has none — ${plural(toProcess, { one: '# file', other: '# files' })}, whatever the search or the filter is showing.`}
          onClick={() =>
            /* those files and no others: one still to prepare does not have the day's other files, which
               are up there already, prepared again with it */
            send(label, {
              intent: 'process',
              destination: name,
              fileIds: files.filter(needs).map((f) => f.id ?? f.path)
            })
          }>
          {busy === label
            ? t`Processing…`
            : t`Process ${plural(toProcess, { one: '# file', other: '# files' })}`}
        </Go>
        {busy === label && <Mini onClick={model.cancelProcess}>{t`Cancel`}</Mini>}
        {free}
      </>
    )
  }
  if (files.every((f) => statusOf(f) === 'uploaded'))
    return (
      <>
        {free}
        <span className='text-[12px] font-semibold text-up'>{t`✓ all on the storage`}</span>
      </>
    )
  const uploadLabel = model.board.uploadLabel ?? ''
  return (
    <>
      {free}
      <Go
        disabled={busy !== null || model.board.uploading !== null}
        title={
          model.board.uploading && model.board.uploading !== `dest:${name}`
            ? t`Uploading ${uploadLabel} — wait for it, or cancel it`
            : t`Send everything in ${name} that is processed and not up there yet — ${plural(toUpload, { one: '# file', other: '# files' })}, whatever the search or the filter is showing.`
        }
        onClick={() => model.requestUpload({ destination: name }, `dest:${name}`)}>
        {model.board.uploading === `dest:${name}`
          ? t`Uploading…`
          : t`Upload ${plural(toUpload, { one: '# file', other: '# files' })}`}
      </Go>
    </>
  )
}

/* a frame off a montage's own footage, to stand for its film until the film plays */
const filmPicture = (group: ManifestGroup) => {
  const file = group.files.find((f) => isVideoFile(f.path)) ?? group.files[0]
  return file ? getPictureUrl(file, undefined, 640) : undefined
}

/* A montage's line carries its one next step, and its upload while it runs — beside its film. */
const MontageActions = ({ group }: { group: ManifestGroup }) => {
  const model = useBoard()
  const { board } = model
  const progress = model.progressOf(group)
  if (!isMontage(group) || group.freed || !progress) return null
  const facts = board.montageFacts[group.id]
  const actions = (
    <MontageCardActions
      group={group}
      facts={facts}
      busy={board.busy}
      upload={board.uploading ? { key: board.uploading, label: board.uploadLabel ?? '' } : null}
      blocked={model.gateFor(group.files)}
      proxiesWaiting={waitingForProxy(group.files, board.proxies).length}
      named={hasCompletePassenger(group.passenger)}
      onProcess={() => model.takeStep(group, 'Processed')}
      onCancelProcess={model.cancelProcess}
      onMontage={() => model.takeStep(group, 'Edited')}
      onOpenMontage={() => model.takeStep(group, 'Rendered')}
      onUpload={() => model.takeStep(group, 'Uploaded')}
      onEmail={
        group.uploaded && progress.steps[progress.at]?.name === 'Emailed'
          ? {
              name: group.passenger?.firstname ?? '',
              open: () => model.takeStep(group, 'Emailed')
            }
          : undefined
      }
      onFree={() => model.setDialog({ kind: 'free', groupId: group.id })}></MontageCardActions>
  )
  return (
    <NextStep
      progress={progress}
      film={
        facts?.film && !group.uploaded ? (
          <FilmStrip
            facts={facts}
            picture={filmPicture(group)}>
            {actions}
          </FilmStrip>
        ) : undefined
      }>
      {actions}
    </NextStep>
  )
}

/* what a montage's upload handed over, as it was handed over, and what has gone missing of it since */
const HandedOver = ({
  group,
  itemActions,
  onLink
}: {
  group: ManifestGroup
  itemActions?: (dir: string, name: string) => React.ReactNode
  /* its folder's link taken away */
  onLink?: (dir: string, make: boolean) => void
}) => {
  const model = useBoard()
  return (
    <>
      <GoneFromStorage
        gone={model.goneById[group.id] ?? []}
        at={model.board.groups.find((g) => g.id === group.id)?.uploaded?.at}
      />
      {group.uploaded && (
        <UploadedCards
          group={group}
          dsmHost={model.nas.host}
          places={model.board.places}
          gone={new Set(goneSent(group.uploaded, model.nas.remote))}
          itemActions={itemActions}
          onLink={onLink}
        />
      )}
    </>
  )
}

/* above a montage's files: what went missing from the storage, what the storage holds, the film and
   what holds its files while it has an edit */
const MontageAbove = ({
  group,
  withFilm,
  tabbed
}: {
  group: ManifestGroup
  withFilm: boolean
  /* the montage has its two tabs: how it was handed over is on the storage's, not here */
  tabbed: boolean
}) => {
  const model = useBoard()
  if (!isMontage(group)) return null
  const facts = model.board.montageFacts[group.id]
  const editLocked = EDIT_LOCKED
  return (
    <div className='mb-2 flex flex-col gap-3'>
      {!tabbed && <HandedOver group={group} />}
      {withFilm && !group.uploaded && (
        <FilmStrip
          facts={facts}
          picture={filmPicture(group)}
        />
      )}
      {!group.uploaded && <FilmNote locked={model.frozen.has(group.id) ? editLocked : null} />}
    </div>
  )
}

/* The folder's own tools: a montage's email and its two ways back, a dropzone's way off the board. */
const PlaceTools = ({ place }: { place: Place }) => {
  const model = useBoard()
  const { board, setDialog, emailedOn } = model
  const busy = board.busy !== null
  /* a dropzone's own tools are in the panel at the right, at its foot */
  if (place.kind === 'dz') return null
  if (place.kind !== 'pax') return null
  const theirs = board.groups.filter((g) => passengerOf(g) === place.name)
  /* the link, by email — once there is a link to send */
  const linked = theirs.find(
    (g) =>
      (g.uploaded?.shareUrl ?? g.publish?.shareUrl) &&
      !lostOf(board.storage?.lost, folderOnStorage(g) ?? '')
  )
  const firstname = linked?.passenger?.firstname ?? ''
  return (
    <span className='flex items-center gap-1.5'>
      {linked && (
        <Mini
          title={
            emailedOn(linked)
              ? t`The storage’s list says the link was sent — open it to send it again`
              : t`Send the link`
          }
          onClick={() => setDialog({ kind: 'email', groupId: linked.id })}>
          {emailedOn(linked) ? t`✓ Emailed · again…` : t`Email ${firstname}…`}
        </Mini>
      )}
      {/* the two ways back from a montage, for all of it — each asks first */}
      {!theirs.some((g) => g.freed) && (
        <>
          <Mini
            disabled={busy}
            title={t`Back to before processing — keeps the name, the trims, the frames and the times`}
            onClick={() => setDialog({ kind: 'take-back', mode: 'reset', who: place.name })}>
            {t`Reset…`}
          </Mini>
          <Danger
            size='mini'
            disabled={busy}
            title={t`Undo the montage, at any step — its files go back to Fresh files, loose, without their name or trims`}
            onClick={() => setDialog({ kind: 'take-back', mode: 'delete', who: place.name })}>
            {t`Delete montage…`}
          </Danger>
        </>
      )}
    </span>
  )
}

/* The panel on the right says everything about whatever is selected — one file, several, a jump,
   or the folder itself when nothing is — and offers what can be done with it. */
const Inspector = ({
  place,
  folder,
  selection,
  jump,
  summary,
  onOpenFile,
  onMakingJump
}: {
  place: Place
  folder: ReturnType<typeof useFolder>
  selection: ReturnType<typeof useSelection>
  jump: ManifestGroup | undefined
  summary: string
  onOpenFile: (file: ManifestFile) => void
  onMakingJump: (making: { file: string; from?: string }) => void
}) => {
  const model = useBoard()
  const { board, frozen, statusContext, statusOf } = model
  const everyFile = [...board.groups.flatMap((g) => g.files), ...board.loose]
  const picked = selection.pickedFiles.flatMap((id) => {
    const found = everyFile.find((f) => f.id === id)
    return found ? [found] : []
  })
  /* the file looked at last, or else the one picked — whichever was done most recently */
  const previewed = selection.previewed
    ? everyFile.find((f) => f.id === selection.previewed)
    : undefined
  const one = previewed ?? (picked.length === 1 ? picked[0] : undefined)
  /* the same filing a drag does, from a menu */
  const moveMenu = (what: { files: string[] } | { jumps: string[] }) => (
    <MoveTo
      here={place}
      destinations={board.places.map((d) => d.name)}
      montages={model.passengers.map(passengerName)}
      onMove={(to) => model.drag.moveTo(to, what)}
    />
  )
  if (one) {
    const group = model.groupOfFile(one)
    const context = statusContext(one)
    const locked = lockReason(one, context)
    return (
      <FilePanel
        key={one.id}
        file={one}
        where={placeLabel(place)}
        name={model.deliveredName(one)}
        jumpLabel={group ? model.labelOf(group) : null}
        status={shownStatus(one, context)}
        proxy={board.proxies[one.path]}
        locked={locked}
        onOpen={() => onOpenFile(one)}
        onSendBack={() => model.sendBack([one])}
        backLabel={model.backLabel([one])}
        onRetime={
          locked
            ? undefined
            : (epoch) =>
                board.send('retime', {
                  intent: 'retime-file',
                  fileIds: [one.id ?? ''],
                  anchorEpoch: epoch
                })
        }
        montage={one.freed ? undefined : model.montageOffer([one], place)}
        move={one.freed || !one.id ? undefined : moveMenu({ files: [one.id] })}
      />
    )
  }
  if (picked.length > 1) {
    const ids = idsOf(picked)
    const fresh = picked.every(model.inUnsorted)
    return (
      <ManyPanel
        files={picked}
        where={placeLabel(place)}
        statusOf={statusOf}
        onSendBack={() => model.sendBack(picked)}
        backLabel={model.backLabel(picked)}
        onMakeJump={
          fresh
            ? (startsAt) => {
                const first = picked[0]
                if (first?.id)
                  onMakingJump({
                    file: first.id,
                    from: model.groupOfFile(first)?.id
                  })
                model.moveFiles(ids, {
                  destination: null,
                  newGroup: true,
                  startsAt
                })
              }
            : undefined
        }
        montage={picked.some((f) => f.freed) ? undefined : model.montageOffer(picked, place)}
        move={picked.some((f) => f.freed) ? undefined : moveMenu({ files: ids })}
        onClear={selection.clear}
      />
    )
  }
  if (jump) {
    const editLocked = EDIT_LOCKED
    return (
      <JumpPanel
        key={jump.id}
        group={model.asOnStorage(jump)}
        label={model.labels.get(jump.id) ?? jump.label}
        where={placeLabel(place)}
        facts={board.montageFacts[jump.id]}
        emailed={Boolean(model.emailedOn(jump))}
        locked={
          jump.freed
            ? t`Freed from this machine — it is on the storage only now.`
            : frozen.has(jump.id)
              ? t`${editLocked} Open it in kdenlive, or reset the montage.`
              : null
        }
        statusOf={statusOf}
        passengers={model.passengers}
        keeps={jump.destination}
        onNameMontage={(passenger) =>
          jump.destination
            ? model.montageOf(jump.files, passenger)
            : model.nameMontage(jump.id, passenger)
        }
        onName={(first, last) => model.setPassenger(jump.id, first, last)}
        onSelectFiles={() => selection.selectFiles(jump.files)}
        onShift={
          jump.freed || frozen.has(jump.id) || board.busy !== null
            ? undefined
            : (at) => model.shiftJump(jump.id, at)
        }
        /* in Fresh files, naming a jump makes it a montage, so there is one way to name it */
        onRename={
          !jump.destination || jump.freed || frozen.has(jump.id)
            ? undefined
            : (name) => model.renameJump(jump.id, name)
        }
        /* A named montage is deleted from its page's own Delete…, once, for all of it; any other
           jump goes the plain way, which an edit or an upload closes. */
        onDelete={
          jump.freed ||
          (isMontage(jump) && hasCompletePassenger(jump.passenger)) ||
          frozen.has(jump.id) ||
          jump.uploaded
            ? undefined
            : () => model.deleteJump(jump)
        }
        move={jump.freed || frozen.has(jump.id) ? undefined : moveMenu({ jumps: [jump.id] })}
        onTrimToJump={
          jump.freed || frozen.has(jump.id) || !jump.files.some((f) => f.moments)
            ? undefined
            : () => model.trimToJump(jump)
        }
      />
    )
  }
  const dz = place.kind === 'dz' ? board.places.find((d) => d.name === place.name) : undefined
  return (
    <FolderPanel
      title={placeLabel(place)}
      sub={summary}
      files={folder.files}
      statusOf={statusOf}>
      {/* the link handed out of a destination's folder — none by default, made and taken away by hand,
          and only here */}
      {dz?.path && model.nas.connected && (
        <Part heading={t`Shared link`}>
          {dz.shareUrl ? (
            <>
              <a
                href={dz.shareUrl}
                target='_blank'
                rel='noreferrer'
                className='truncate font-mono text-[11.5px] text-accent-ink hover:underline'>
                {dz.shareUrl}
              </a>
              <span className='flex gap-1.5'>
                <Mini
                  title={t`Copy the link`}
                  onClick={() =>
                    void navigator.clipboard?.writeText(dz.shareUrl ?? '').catch(() => undefined)
                  }>
                  {t`Copy link`}
                </Mini>
                <Mini
                  title={t`Take the link away — the folder stays where it is`}
                  onClick={() =>
                    board.send(`link:${dz.path}`, {
                      intent: 'destination-link',
                      link: { folder: dz.path ?? '', make: false }
                    })
                  }>
                  {t`Remove link`}
                </Mini>
              </span>
            </>
          ) : (
            <>
              <span className='text-[11.5px] text-ink-3'>{t`No link`}</span>
              <span className='flex'>
                <Mini
                  title={t`Make a link to its folder, to send`}
                  onClick={() =>
                    board.send(`link:${dz.path}`, {
                      intent: 'destination-link',
                      link: { folder: dz.path ?? '', make: true }
                    })
                  }>
                  {t`Create link`}
                </Mini>
              </span>
            </>
          )}
        </Part>
      )}
      {folder.family === 'montages' &&
        folder.groups.map((g) => (
          <Part
            key={g.id}
            heading={model.labelOf(g)}>
            <StepTrail
              group={model.asOnStorage(g)}
              facts={board.montageFacts[g.id]}
              emailed={Boolean(model.emailedOn(g))}
              onStep={g.freed ? undefined : (step) => model.takeStep(g, step)}
              busy={board.busy !== null}
            />
          </Part>
        ))}
      {place.kind === 'storage' && board.storage && (
        <Part heading={t`Its folder`}>
          <p className='m-0 font-mono text-[11.5px] break-all text-ink-3'>{board.storage.dir}</p>
        </Part>
      )}
    </FolderPanel>
  )
}

export { searchParamsArgs }
export default Place
