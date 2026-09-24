import {
  EDIT_LOCKED,
  hasCompletePassenger,
  isMontage,
  lastSegment,
  montageCalled,
  offGap,
  outputKeyOf,
  passengerOf,
  tandemUploadKey
} from '@skydock/scripts'
import type { FileStatus } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router'
import { Go, Mini } from '../components/buttons'
import { CameraFiles } from '../components/camera-files'
import { ComparisonDialog } from '../components/comparison-dialog'
import { FileBrowser } from '../components/file-browser'
import { lanesOf, lockReason, shownStatus } from '../components/file-list'
import { FolderOwed } from '../components/folder-owed'
import { Box, FilePanel, FolderPanel, JumpPanel, ManyPanel, Shell } from '../components/inspector'
import { PlacePane } from '../components/place-pane'
import { StorageFolder } from '../components/storage-folder'
import { StorageList } from '../components/storage-list'
import {
  FilmStrip,
  GoneFromStorage,
  TandemActions,
  UploadStrip,
  UploadedCards
} from '../components/tandem-card'
import { StepTrail } from '../components/tandem-steps'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { formatSize, plural } from '../components/utils'
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
import { useBoard } from '../hooks/useBoardModel'
import type { BoardModel } from '../hooks/useBoardModel'
import { useSelection } from '../hooks/useSelection'
import { idsOf } from '@skydock/scripts'

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
const GROUPING_BY = { sort: 'jump', dz: 'day', tandems: 'jump' } as const

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
  return { looking, query, family, groups, loose, files, options, grouping, sections, openCard }
}

const Place = () => {
  const model = useBoard()
  const { board, frozen, statusContext, statusOf, setDialog } = model
  const { groups, busy, send, setNote } = board
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
  const soleTandem =
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
      if (files.length > 0 && files.every(model.binnable)) model.askTrash(files)
      else model.moveFiles(ids, { destination: null })
    }
  })
  /* a change elsewhere took the picks away, or another folder was opened: let go of them */
  const [seen, setSeen] = useState({ gone: model.picksGone, at: placeKey(place) })
  if (seen.gone !== model.picksGone || seen.at !== placeKey(place)) {
    setSeen({ gone: model.picksGone, at: placeKey(place) })
    selection.clear()
  }

  /* A jump made from picked files is opened as soon as it exists — its card, and with it its panel.
     Its id is the server's to give, so it is known by its first file, once the answer has that file
     in a jump it was not in before; a move that was refused opens nothing. */
  const [makingJump, setMakingJump] = useState<{ file: string; from?: string } | null>(null)
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

  const summary =
    place.kind === 'storage'
      ? plural(board.storage?.tandems.length ?? 0, 'montage')
      : [
          folder.groups.length && family !== 'dz' ? plural(folder.groups.length, 'jump') : null,
          plural(folder.files.length, 'file'),
          formatSize(folder.files.reduce((n, f) => n + f.size, 0))
        ]
          .filter(Boolean)
          .join(' · ')

  /* where a file from the computer dropped anywhere on the pane goes — the folder it shows */
  const paneHost = place.kind === 'pax' ? model.hostOf(place.name) : undefined
  const paneTarget =
    place.kind === 'sort'
      ? { target: 'sort', where: 'Fresh files' }
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
      const film = board.tandemFacts[g.id]?.film
      return film ? [lastSegment(film.path)] : []
    })
  ])
  /* the files still to be sorted, by what they contain — how the storage's list knows a montage
     this board may have forgotten */
  const toSort = new Set(idsOf(filesIn({ kind: 'sort' }, groups, board.loose)))

  return (
    <>
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
        left={
          <FolderOwed
            actions={place.kind === 'dz' ? <DropzoneStep name={place.name} /> : undefined}
            place={place}
            groups={folder.groups}
            loose={folder.loose}
            files={folder.files}
            facts={board.tandemFacts}
            statusOf={statusOf}
            busy={busy !== null}
            folder={
              place.kind === 'dz'
                ? {
                    path: model.folderFor(place.name),
                    onChoose: () => setDialog({ kind: 'folder', destination: place.name })
                  }
                : undefined
            }
            onRegroup={() => send('regroup', { intent: 'regroup-loose' })}
            onReset={model.resetFresh}
            onPlace={model.pickPlace}
          />
        }
        strip={
          place.kind === 'dz' && board.uploading === `dest:${place.name}` && model.progress ? (
            <UploadStrip progress={model.progress} />
          ) : undefined
        }
        note={board.note}
        incoming={paneTarget}
        onImport={(list, target, where) => void model.importDropped(list, target, where)}>
        {place.kind === 'camera' ? (
          <CameraFiles
            mount={place.name}
            stamp={board.cameras.map((c) => c.mount).join('\n')}
            onNote={setNote}
            onCopyBack={(paths) => send('copy-back', { intent: 'copy-back', paths })}
          />
        ) : place.kind === 'storage' ? (
          <div className='pt-3'>
            <StorageList
              storage={board.storage}
              isHere={(entry) => groups.some((g) => folderOnStorage(g) === entry.folder)}
              onOpen={(entry) =>
                model.pickPlace({
                  kind: 'pax',
                  name: `${entry.firstname} ${entry.lastname}`.trim()
                })
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
                      look({ card: key })
                      /* the loose card is no jump: the panel lets go of the last one */
                      if (key === 'loose') selection.clear()
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
            live={board.liveFiles}
            deliveredName={model.deliveredName}
            onFile={selection.clickFile}
            onPick={selection.pickFile}
            previewed={selection.previewed}
            offGap={new Set(groups.flatMap((g) => [...offGap(g.files)]))}
            onOpen={openFile}
            onDragFile={(file, e) => model.drag.startFileDrag(file, selection.pickedFiles, e)}
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
              overTarget: model.drag.overTarget,
              dropTarget: (id) => model.drag.groupDropTarget(id),
              onSelect: (groupId, e) => selection.selectJump(groupId, e, openJump?.id),
              onDrag: model.drag.startJumpDrag,
              actions: (group) => <MontageActions group={group} />,
              above: (group) => <MontageAbove group={group} />,
              progress: model.progressOf
            }}
          />
        )}
        {model.nas.connected && storageWhere && (
          <StorageFolder
            key={placeKey(place)}
            where={storageWhere}
            stamp={board.remoteAfterUpload?.at}
            hereToo={hereToo}
            onProblem={setNote}
            onBringBack={(file) => {
              /* the board knows it by where it was sent, which is what its upload recorded */
              const mine = [...groups.flatMap((g) => g.files), ...board.loose].find(
                (f) => f.uploaded?.remotePath === file.path
              )
              if (!mine?.id) {
                setNote(`${file.name} was not sent from this machine, so it cannot come back.`)
                return
              }
              send(`back:${mine.id}`, { intent: 'bring-back', fileIds: [mine.id] })
            }}
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
            soleTandem
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
            send('merge', { intent: 'merge-groups', leftId, rightId, anchorEpoch })
          }}
        />
      )}

      {/* the file open in this folder, when the address names one */}
      <Outlet context={model} />
    </>
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
  if (gateFor(files).blocked) {
    const needs = (f: ManifestFile) => statusOf(f) === 'local'
    const jumps = groupsIn({ kind: 'dz', name }, board.groups).filter((g) => g.files.some(needs))
    const lone = looseIn({ kind: 'dz', name }, board.loose).some(needs)
    return (
      <>
        <Go
          disabled={busy !== null}
          title={`Make the copies that get handed over, for everything in ${name} that has none — ${plural(waiting('local'), 'file')}, whatever the search or the filter is showing.`}
          onClick={() =>
            send(
              label,
              lone
                ? { intent: 'process', destination: name }
                : { intent: 'process', groupIds: jumps.map((g) => g.id) }
            )
          }>
          {busy === label ? 'Processing…' : `Process ${plural(waiting('local'), 'file')}`}
        </Go>
        {busy === label && <Mini onClick={model.cancelProcess}>Cancel</Mini>}
      </>
    )
  }
  /* what is proved on the storage can be freed from here, whatever is still to upload */
  const free =
    model.freeableOf(name).files.length > 0 ? (
      <Mini
        disabled={busy !== null}
        title={`Delete from this machine what ${name} has on the storage, once the storage is proved to hold it. Asks first.`}
        onClick={() =>
          model.nas.connected
            ? model.setDialog({ kind: 'free-place', place: name })
            : model.openConnect()
        }>
        {busy === `free:dz:${name}` ? 'Checking the storage…' : 'Free up space…'}
      </Mini>
    ) : null
  if (files.every((f) => statusOf(f) === 'uploaded'))
    return (
      <>
        {free}
        <span className='text-[12px] font-semibold text-up'>✓ all on the storage</span>
      </>
    )
  return (
    <>
      {free}
      <Go
        disabled={busy !== null}
        title={`Send everything in ${name} that is processed and not up there yet — ${plural(waiting('processed'), 'file')}, whatever the search or the filter is showing.`}
        onClick={() => model.requestUpload({ destination: name }, `dest:${name}`)}>
        {busy === `dest:${name}` ? 'Uploading…' : `Upload ${plural(waiting('processed'), 'file')}`}
      </Go>
    </>
  )
}

/* A montage's line carries its one next step, and its upload while it runs. */
const MontageActions = ({ group }: { group: ManifestGroup }) => {
  const model = useBoard()
  const { board } = model
  if (!isMontage(group) || group.freed) return null
  return (
    <>
      <TandemActions
        group={group}
        facts={board.tandemFacts[group.id]}
        busy={board.busy}
        blocked={model.gateFor(group.files)}
        named={hasCompletePassenger(group.passenger)}
        onProcess={() => board.send(group.id, { intent: 'process', groupId: group.id })}
        onCancelProcess={model.cancelProcess}
        onMontage={() => void model.askMontage(group)}
        onOpenMontage={() =>
          board.send(`open:${group.id}`, { intent: 'open-montage', groupId: group.id })
        }
        onUpload={() => model.askUpload(group)}
        onFree={() => model.setDialog({ kind: 'free', groupId: group.id })}
      />
      {board.uploading === tandemUploadKey(group.id) && model.progress && (
        <span className='mt-0.5 flex-[1_1_100%]'>
          <UploadStrip progress={model.progress} />
        </span>
      )}
    </>
  )
}

/* above a montage's files: what went missing from the storage, what the storage holds, the film */
const MontageAbove = ({ group }: { group: ManifestGroup }) => {
  const model = useBoard()
  if (!isMontage(group)) return null
  return (
    <div className='mb-2'>
      <GoneFromStorage
        gone={model.goneById[group.id] ?? []}
        at={model.board.groups.find((g) => g.id === group.id)?.uploaded?.at}
      />
      {group.uploaded && <UploadedCards group={group} />}
      {!group.uploaded && <FilmStrip facts={model.board.tandemFacts[group.id]} />}
    </div>
  )
}

/* The folder's own tools: a montage's email and its two ways back, a dropzone's way off the board. */
const PlaceTools = ({ place }: { place: Place }) => {
  const model = useBoard()
  const { board, setDialog, emailedOn } = model
  const busy = board.busy !== null
  /* A dropzone can be taken off the board. Offered here rather than beside the folder's next step,
     because a place with nothing in it has no next step and is exactly the one worth removing. */
  if (place.kind === 'dz')
    return (
      <Mini
        disabled={busy}
        title='Take this place off the board — what is filed here goes back to Fresh files, and nothing is deleted'
        onClick={() => setDialog({ kind: 'remove-place', place: place.name })}>
        {board.busy === `remove:dz:${place.name}` ? 'Removing…' : 'Remove place…'}
      </Mini>
    )
  if (place.kind !== 'pax') return null
  const theirs = board.groups.filter((g) => passengerOf(g) === place.name)
  /* the link, by email — once there is a link to send */
  const linked = theirs.find((g) => g.uploaded?.shareUrl ?? g.publish?.shareUrl)
  return (
    <span className='flex items-center gap-1.5'>
      {linked && (
        <Mini
          title={
            emailedOn(linked)
              ? 'The storage’s list says the link was sent — open it to send it again'
              : 'Send the link'
          }
          onClick={() => setDialog({ kind: 'email', groupId: linked.id })}>
          {emailedOn(linked) ? '✓ Emailed · again…' : `Email ${linked.passenger?.firstname ?? ''}…`}
        </Mini>
      )}
      {/* the two ways back from a montage, for all of it — each asks first */}
      {!theirs.some((g) => g.freed) && (
        <>
          <Mini
            disabled={busy}
            title='Back to before processing — keeps the name, the crops, the frames and the times'
            onClick={() => setDialog({ kind: 'take-back', mode: 'reset', who: place.name })}>
            Reset…
          </Mini>
          <Mini
            disabled={busy}
            title='Undo the montage, at any step — its files go back to Fresh files, loose, without their name or crops'
            onClick={() => setDialog({ kind: 'take-back', mode: 'delete', who: place.name })}>
            Delete…
          </Mini>
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
  const { board, frozen, statusContext, statusOf, setDialog } = model
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
  if (one) {
    const group = model.groupOfFile(one)
    const context = statusContext(one)
    const locked = lockReason(one, context)
    return (
      <FilePanel
        key={one.id}
        file={one}
        name={model.deliveredName(one)}
        jumpLabel={group ? model.labelOf(group) : null}
        status={shownStatus(one, context)}
        proxy={board.proxies[one.path]}
        locked={locked}
        onOpen={() => onOpenFile(one)}
        onSendBack={() => model.moveFiles([one.id ?? ''], { destination: null })}
        onTrash={model.binnable(one) ? () => model.askTrash([one]) : undefined}
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
      />
    )
  }
  if (picked.length > 1) {
    const ids = idsOf(picked)
    const fresh = picked.every(model.inUnsorted)
    return (
      <ManyPanel
        files={picked}
        statusOf={statusOf}
        onSendBack={() => model.moveFiles(ids, { destination: null })}
        onTrash={picked.every(model.binnable) ? () => model.askTrash(picked) : undefined}
        backLabel={model.backLabel(picked)}
        onMakeJump={
          fresh
            ? (name, startsAt) => {
                /* named, they are a montage; left blank, a jump */
                if (name.trim()) {
                  model.montageOf(picked, montageCalled(board.groups, name), startsAt)
                  return
                }
                const first = picked[0]
                if (first?.id) onMakingJump({ file: first.id, from: model.groupOfFile(first)?.id })
                model.moveFiles(ids, { destination: null, newGroup: true, startsAt })
              }
            : undefined
        }
        montages={model.passengers}
        montage={
          fresh || picked.some((f) => f.freed) ? undefined : model.montageOffer(picked, place)
        }
        onClear={selection.clear}
      />
    )
  }
  if (jump) {
    return (
      <JumpPanel
        key={jump.id}
        group={model.asOnStorage(jump)}
        label={model.labels.get(jump.id) ?? jump.label}
        facts={board.tandemFacts[jump.id]}
        emailed={Boolean(model.emailedOn(jump))}
        locked={
          jump.freed
            ? 'Freed from this machine — it is on the storage only now.'
            : frozen.has(jump.id)
              ? `${EDIT_LOCKED} Open it in kdenlive, or reset the montage.`
              : null
        }
        statusOf={statusOf}
        passengers={model.passengers}
        keeps={jump.destination}
        onMakeTandem={(passenger) =>
          jump.destination
            ? model.montageOf(jump.files, passenger)
            : model.makeTandem(jump.id, passenger)
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
        /* A named montage is deleted at whatever step it has reached, through the dialog that says
           what goes with it; any other jump goes the plain way, which an edit or an upload closes. */
        onDelete={
          jump.freed
            ? undefined
            : isMontage(jump) && hasCompletePassenger(jump.passenger)
              ? () => setDialog({ kind: 'take-back', mode: 'delete', who: passengerOf(jump) })
              : frozen.has(jump.id) || jump.uploaded
                ? undefined
                : () => model.deleteJump(jump)
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
      {place.kind === 'dz' && (
        <Box heading='On the storage'>
          <p className='m-0 font-mono text-[12px] break-all'>
            {model.folderFor(place.name) ?? 'no folder yet'}
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
              {model.folderFor(place.name) ? 'Change folder' : 'Choose a folder'}
            </Mini>
          </span>
        </Box>
      )}
      {folder.family === 'tandems' &&
        folder.groups.map((g) => (
          <Box
            key={g.id}
            heading={model.labelOf(g)}>
            <StepTrail
              group={model.asOnStorage(g)}
              facts={board.tandemFacts[g.id]}
              emailed={Boolean(model.emailedOn(g))}
            />
          </Box>
        ))}
      {place.kind === 'storage' && board.storage && (
        <p className='m-0 font-mono text-[12px] break-all text-ink-2'>{board.storage.dir}</p>
      )}
    </FolderPanel>
  )
}

export { searchParamsArgs }
export default Place
