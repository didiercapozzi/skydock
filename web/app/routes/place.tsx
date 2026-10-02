import {
  EDIT_LOCKED,
  hasCompletePassenger,
  isMontage,
  lastSegment,
  offGap,
  outputKeyOf,
  passengerName,
  passengerOf,
  idsOf
} from '@skydock/scripts'
import type { FileStatus } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { setDetailsColumn } from '../hooks/useDetails'
import { Outlet, useNavigate, useParams } from 'react-router'
import { Go, Mini, Seg } from '../components/buttons'
import { BinFiles } from '../components/bin-files'
import { CameraFiles } from '../components/camera-files'
import { ComparisonDialog } from '../components/comparison-dialog'
import { FileBrowser } from '../components/file-browser'
import { lanesOf, lockReason, shownStatus } from '../components/file-list'
import { PageHead, StatusCard } from '../components/page-head'
import { MenuItem } from '../components/settings-menu'
import { FolderOwed } from '../components/folder-owed'
import {
  FilePanel,
  FolderPanel,
  JumpPanel,
  ManyPanel,
  Part,
  SettingRow,
  Shell
} from '../components/inspector'
import { MoveTo } from '../components/move-to'
import { PlacePane } from '../components/place-pane'
import { FolderCard, StorageCards, StorageFolder } from '../components/storage-folder'
import { DeliveredList } from '../components/delivered-list'
import { MontagePanel } from '../components/montage-panel'
import {
  HandedOver,
  MontageAbove,
  MontageActions,
  MontageBody,
  MontageEnd,
  MontageMenu,
  WayDone,
  montageSub
} from '../components/montage-view'
import { StepTrail } from '../components/montage-steps'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { formatSize } from '../components/utils'
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
  /* a montage's own page is there for as long as the montage is, finished or not */
  const groups = groupsIn(place, place.kind === 'pax' ? board.groups : listed)
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
  /* In Fresh files the jumps are tiles to choose from and none is open to begin with: what is listed
     under them is the loose files, and a jump's own files are brought up from its panel. */
  const plain = place.kind === 'sort' && grouping === 'jump'
  const openCard =
    grouping === 'jump'
      ? (cards.find((s) => s.key === looking.card) ?? (plain ? undefined : cards[0]))
      : undefined
  return {
    plain,
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
  const { looking, query, family, openCard, sections, plain } = folder
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
  /* the montage that is on the storage and is shown as two cards, when there is only one */
  const delivered = soleMontage?.uploaded && model.nas.connected ? soleMontage : undefined
  const onScreen = plain
    ? sections.filter((s) => s.key === looking.card)
    : openCard
      ? [openCard]
      : sections
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
  /* The panel at the right is not there until it is wanted: it comes by itself when a file or a jump is
     picked or opened, and on a montage's page, where it is the place the montage is worked on. */
  const wanted =
    selection.pickedFiles.length + (selection.pickedJump ? 1 : 0) + (address.fileId ? 1 : 0) > 0 ||
    place.kind === 'pax'
  const here = placeKey(place)
  useEffect(() => {
    if (wanted) setDetailsColumn(true)
  }, [wanted, here])
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

  const jumps = folder.groups.length
  const fileCount = folder.files.length
  const summary = [
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
        head={
          place.kind === 'pax'
            ? () => {
                const mine = soleMontage
                return (
                  <PageHead
                    large
                    tile={{
                      letter: place.name.charAt(0).toUpperCase(),
                      done: Boolean(mine?.freed)
                    }}
                    title={place.name}
                    sub={mine ? montageSub(mine, model.emailedOn(mine)?.at ?? null) : summary}
                    aside={mine?.freed ? <WayDone /> : undefined}
                    menu={
                      mine
                        ? (close) => (
                            <MontageMenu
                              group={mine}
                              close={close}
                              trimToJump={
                                frozen.has(mine.id) || !mine.files.some((f) => f.moments)
                                  ? undefined
                                  : () => model.trimToJump(mine)
                              }
                            />
                          )
                        : undefined
                    }
                  />
                )
              }
            : place.kind === 'dz'
              ? ({ query: q, onQuery }) => (
                  <PageHead
                    tile={{ icon: 'place' }}
                    title={placeLabel(place)}
                    sub={
                      folder.files.length === 0
                        ? t`No files yet`
                        : plural(folder.files.length, { one: '# file', other: '# files' })
                    }
                    query={q}
                    onQuery={onQuery}
                    menu={(close) => (
                      <div className='flex flex-col'>
                        <MenuItem
                          icon='storage'
                          onClick={() => {
                            setDialog({ kind: 'folder', destination: place.name })
                            close()
                          }}>
                          {model.folderFor(place.name) ? t`Change folder…` : t`Choose a folder…`}
                        </MenuItem>
                        <MenuItem
                          icon='bin'
                          danger
                          disabled={busy !== null}
                          title={t`Take this destination off the board — what is filed here goes back to Fresh files, and nothing is deleted`}
                          onClick={() => {
                            setDialog({ kind: 'remove-place', place: place.name })
                            close()
                          }}>
                          {busy === `remove:dz:${place.name}`
                            ? t`Removing…`
                            : t`Remove destination…`}
                        </MenuItem>
                      </div>
                    )}
                    status={<DropzoneCard name={place.name} />}
                  />
                )
              : place.kind === 'sort'
                ? ({ query: q, onQuery }) => (
                    <PageHead
                      tile={{ icon: 'fresh' }}
                      title={placeLabel(place)}
                      sub={t`What came off the cameras, waiting to be sorted`}
                      query={q}
                      onQuery={onQuery}
                      menu={(close) => (
                        <MenuItem
                          icon='back'
                          danger
                          disabled={busy !== null}
                          title={t`Put Fresh files back — the times alone, or everything as just scanned. Asks which first.`}
                          onClick={() => {
                            model.resetFresh()
                            close()
                          }}>
                          {t`Reset Fresh files…`}
                        </MenuItem>
                      )}
                      status={
                        <FreshCard
                          jumps={folder.groups.length}
                          loose={folder.loose.length}
                          busy={busy !== null}
                          onRegroup={() => send('regroup', { intent: 'regroup-loose' })}
                        />
                      }
                    />
                  )
                : place.kind === 'delivered'
                  ? ({ query: q, onQuery }) => (
                      <PageHead
                        tile={{ icon: 'check', up: true }}
                        title={placeLabel(place)}
                        sub={t`${plural(model.delivered, { one: '# montage', other: '# montages' })} · finished, emailed and freed — everything is on the storage`}
                        query={q}
                        onQuery={onQuery}
                        searchOpen
                        findLabel={t`Find a montage`}
                      />
                    )
                  : undefined
        }
        left={
          place.kind === 'dz' || place.kind === 'sort' || place.kind === 'pax' ? undefined : (
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
        {/* a montage that is on the storage is its two places side by side, not a list of its files */}
        {delivered && (
          <MontageBody
            group={delivered}
            stamp={board.remoteAfterUpload?.at}
            onProblem={setProblem}
          />
        )}
        {twoViews && !delivered && (
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
        ) : place.kind === 'delivered' ? (
          <DeliveredList
            groups={groups.filter(model.finished)}
            query={query}
          />
        ) : place.kind === 'bin' ? (
          <BinFiles
            /* read again when files left the board or came back to it, not after every change */
            stamp={board.loose.length + groups.reduce((n, g) => n + g.files.length, 0)}
            bringing={busy === 'from-bin'}
            onBringBack={(paths) => send('from-bin', { intent: 'from-bin', paths })}
          />
        ) : delivered || view === 'storage' ? null : (
          <FileBrowser
            sections={sections}
            cards={
              openCard || plain
                ? {
                    hidden: soleMontage !== undefined,
                    plain,
                    open: openCard?.key ?? '',
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
        {place.kind === 'pax' && !delivered && twoViews && view === 'storage' && storageWhere && (
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
            onBringBack={(file) => {
              /* the board knows it by where it was sent, which is what its upload recorded */
              const mine = [...groups.flatMap((g) => g.files), ...board.loose].find(
                (f) => f.uploaded?.remotePath === file.path
              )
              if (!mine?.id) {
                const name = file.name
                setProblem(t`${name} was not sent from this machine, so it cannot come back.`)
                return
              }
              send(`back:${mine.id}`, { intent: 'bring-back', fileIds: [mine.id] })
            }}
            onProblem={setProblem}
          />
        )}
        {place.kind !== 'dz' &&
          model.nas.connected &&
          storageWhere &&
          view !== 'local' &&
          !delivered &&
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

/* Where a dropzone has got to, in a sentence, with the one button that moves it on. */
const DropzoneCard = ({ name }: { name: string }) => {
  const model = useBoard()
  const { board, statusOf } = model
  const files = filesIn({ kind: 'dz', name }, board.groups, board.loose)
  const total = files.length
  const count = (state: FileStatus) => files.filter((f) => statusOf(f) === state).length
  const local = count('local')
  const processed = count('processed')
  const onStorage = count('uploaded')
  const folder = model.folderFor(name)
  if (total === 0)
    return folder ? (
      <StatusCard
        tone='plain'
        icon='upload'
        title={t`Drop files here`}
        text={t`Or drag a jump from Fresh files onto ${name} in the sidebar.`}
      />
    ) : (
      <StatusCard
        tone='plain'
        icon='storage'
        title={t`Where should it go?`}
        text={t`Choose a folder on the storage. Files dropped here are sent there.`}>
        <Go onClick={() => model.setDialog({ kind: 'folder', destination: name })}>
          {t`Choose a folder…`}
        </Go>
      </StatusCard>
    )
  const progress = { done: onStorage, of: total, word: t`${onStorage} of ${total} on the storage` }
  const freeable = model.freeableOf(name)
  return local > 0 ? (
    <StatusCard
      tone='todo'
      icon='alert'
      title={plural(local, { one: '# file needs processing', other: '# files need processing' })}
      text={t`Then it is ready to go to the storage.`}
      progress={progress}>
      <DropzoneStep name={name} />
    </StatusCard>
  ) : processed > 0 ? (
    <StatusCard
      tone='plain'
      icon='upload'
      title={plural(processed, {
        one: '# file is ready to upload',
        other: '# files are ready to upload'
      })}
      text={t`They go to the storage, into ${folder ?? t`its folder`}.`}
      progress={progress}>
      <DropzoneStep name={name} />
    </StatusCard>
  ) : (
    <StatusCard
      tone='done'
      icon='check'
      title={t`Everything is on the storage`}
      text={
        freeable.files.length > 0
          ? t`You can free ${formatSize(freeable.bytes)} on this machine. It asks first.`
          : undefined
      }
      progress={progress}>
      <DropzoneStep name={name} />
    </StatusCard>
  )
}

/* Where Fresh files stand: jumps waiting for a home, or nothing left to sort. */
const FreshCard = ({
  jumps,
  loose,
  busy,
  onRegroup
}: {
  jumps: number
  loose: number
  busy: boolean
  onRegroup: () => void
}) =>
  jumps === 0 && loose === 0 ? (
    <StatusCard
      tone='done'
      icon='check'
      title={t`Nothing left to sort`}
      text={t`Copy more cameras off and rescan to see their jumps here.`}
    />
  ) : (
    <StatusCard
      tone='plain'
      icon='next'
      title={
        jumps > 0
          ? plural(jumps, {
              one: '# jump is waiting for a home',
              other: '# jumps are waiting for a home'
            })
          : plural(loose, {
              one: '# loose file is waiting for a home',
              other: '# loose files are waiting for a home'
            })
      }
      text={t`Drag one onto a destination in the sidebar — or open it and press Move to…`}>
      {loose > 0 && (
        <Mini
          disabled={busy}
          title={t`Gather the loose files here into jumps, by the gap rule — nothing is forgotten`}
          onClick={onRegroup}>
          {plural(loose, { one: 'Group # loose file', other: 'Group # loose files' })}
        </Mini>
      )}
    </StatusCard>
  )

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
  if (files.every((f) => statusOf(f) === 'uploaded')) return <>{free}</>
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
  if (jump && isMontage(jump)) {
    const editLocked = EDIT_LOCKED
    return (
      <MontagePanel
        key={jump.id}
        group={model.asOnStorage(jump)}
        locked={
          jump.freed
            ? t`Freed from this machine — it is on the storage only now.`
            : frozen.has(jump.id)
              ? t`${editLocked} Open it in kdenlive, or reset the montage.`
              : null
        }
        passengers={model.passengers}
        onName={(first, last) => model.setPassenger(jump.id, first, last)}
        onShift={
          jump.freed || frozen.has(jump.id) || board.busy !== null
            ? undefined
            : (at) => model.shiftJump(jump.id, at)
        }
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
        fileTo={
          !isMontage(jump) && !jump.destination && !jump.freed && !frozen.has(jump.id)
            ? {
                places: board.places.map((d) => d.name),
                onFile: (name) => model.drag.moveTo({ kind: 'dz', name }, { jumps: [jump.id] })
              }
            : undefined
        }
        onTrimToJump={
          jump.freed || frozen.has(jump.id) || !jump.files.some((f) => f.moments)
            ? undefined
            : () => model.trimToJump(jump)
        }
        end={place.kind === 'pax' ? <MontageEnd who={place.name} /> : undefined}
      />
    )
  }
  /* what is on the page is all there is to say of it */
  if (place.kind === 'delivered')
    return (
      <FolderPanel
        eyebrow={t`Montages`}
        title={placeLabel(place)}
        sub={t`Done — only the storage holds them now`}
      />
    )
  const dz = place.kind === 'dz' ? board.places.find((d) => d.name === place.name) : undefined
  const goesTo = place.kind === 'dz' ? model.folderFor(place.name) : undefined
  return (
    <FolderPanel
      title={placeLabel(place)}
      sub={place.kind === 'dz' ? t`Where its files go` : summary}
      eyebrow={place.kind === 'dz' ? t`Destination` : undefined}>
      {/* where a destination's files go and the link handed out of it — none by default, made and
          taken away by hand, and only here */}
      {place.kind === 'dz' && (
        <Part>
          <SettingRow
            icon='storage'
            label={t`Storage folder`}
            value={goesTo ?? t`None chosen yet`}
            mono={Boolean(goesTo)}>
            <Mini onClick={() => model.setDialog({ kind: 'folder', destination: place.name })}>
              {goesTo ? t`Change` : t`Choose…`}
            </Mini>
          </SettingRow>
          {dz?.path && model.nas.connected && (
            <SettingRow
              icon='link'
              label={t`Shared link`}
              value={
                dz.shareUrl ? (
                  <a
                    href={dz.shareUrl}
                    target='_blank'
                    rel='noreferrer'
                    className='text-accent-ink hover:underline'>
                    {dz.shareUrl}
                  </a>
                ) : (
                  t`None yet`
                )
              }>
              {dz.shareUrl ? (
                <span className='flex gap-1.5'>
                  <Mini
                    title={t`Copy the link`}
                    onClick={() =>
                      void navigator.clipboard?.writeText(dz.shareUrl ?? '').catch(() => undefined)
                    }>
                    {t`Copy`}
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
              ) : (
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
              )}
            </SettingRow>
          )}
        </Part>
      )}
      {place.kind === 'dz' && (
        <div className='mt-auto px-6 pt-4 pb-6'>
          <button
            type='button'
            disabled={board.busy !== null}
            onClick={() => model.setDialog({ kind: 'remove-place', place: place.name })}
            className='cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-bin disabled:opacity-40'>
            {t`Remove destination…`}
          </button>
        </div>
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
      {place.kind === 'pax' && <MontageEnd who={place.name} />}
    </FolderPanel>
  )
}

export { searchParamsArgs }
export default Place
