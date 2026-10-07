import {
  earlierMontagesDirs,
  ensureNasSession,
  forgetLostFiles,
  flushBoardChanges,
  getManifestPath,
  getOutputDir,
  learnStorage,
  listRemoteFiles,
  loadManifest,
  readRecord,
  processingNow,
  uploadingNow,
  saveManifest,
  settleListsDir,
  statProcessedOutputs,
  statProxies,
  statMontageArtifacts,
  montagesRemoteDir,
  messageOf,
  transfersFileSchema
} from '@skydock/scripts'
import type { MontageEntry, MontageLost } from '@skydock/scripts'
import { keepBackupAsPlace } from '../../../packages/skydock-scripts/src/destinations'
import { diskSpace } from '../../../packages/skydock-scripts/src/diskSpace'
import { lostOnStorage, readMontageIndex } from '../../../packages/skydock-scripts/src/montageIndex'
import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { useSafeSearchParams } from '../helpers/routing'
import { boardViewSchema } from '../helpers/view'
import type { ShouldRevalidateFunctionArgs } from 'react-router'
import { BoardHeader, StatusBar } from '../components/board-header'
import type { NasLink } from '../components/board-header'
import { FirstScan } from '../components/first-scan'
import { NewCameraDialog } from '../components/camera-dialogs'
import { DialogHost } from '../components/dialog-host'
import { JobsPanel } from '../components/jobs-panel'
import { TransfersPanel } from '../components/transfers-panel'
import { PlacesTree } from '../components/places-tree'
import { hhmm } from '../components/utils'
import { fromComputer } from '../helpers/import'
import { typingInField } from '../helpers/keys'
import { routingEngine } from '../helpers/routing'
import { useCameraCopying, useJobs } from '../hooks/liveStore'
import { useTransfersPanel } from '../hooks/transfersPanel'
import { useBoardModel } from '../hooks/useBoardModel'
import { useDetailsColumn } from '../hooks/useDetails'
import { useRoundedWindow } from '../hooks/useWindowFrame'
import type { Route } from './+types/board'

/* The board's data is read once, and every change comes back in the answer the endpoint gives: the
   board adopts that answer, so reading everything again — the disk, and the storage over the
   network — would only be thrown away. Walking the folders never asks either. Connecting to the
   storage, or leaving it, is the one change whose answer does not carry the board, so it is read
   again then. */
const shouldRevalidate = ({
  formMethod,
  formAction,
  defaultShouldRevalidate
}: ShouldRevalidateFunctionArgs) =>
  formMethod !== undefined && formAction?.startsWith('/api/nas') === true
    ? defaultShouldRevalidate
    : false

type NasState = { connected: boolean; hostname: string | null; username: string | null }

type StorageLook = Awaited<ReturnType<typeof lookAtStorage>>

/* What the storage says, asked after the board is drawn rather than before: a storage that is slow,
   or cannot be reached at all, never holds the board (RULES, The board). What it changes on this
   machine's record — a backup folder made a place, a file the storage no longer holds forgotten —
   is saved here and reaches the board with its next answer. */
const lookAtStorage = async (outputDir: string) => {
  const manifestPath = getManifestPath(outputDir)
  /* a session file is not a session: ask DSM whether the id still works (and let it refresh
     itself if it does not), so the board never shows a connection that is already dead */
  let nas: NasState = { connected: false, hostname: null, username: null }
  let remote: { dirs: string[]; sizes: Record<string, number | null>; at: number } | null = null
  let storage: {
    dir: string
    montages: MontageEntry[]
    lost: MontageLost
    problem: string | null
  } | null = null
  try {
    const session = await ensureNasSession()
    if (!session) return { nas, remote, storage }
    nas = { connected: true, hostname: session.hostname, username: session.username }
    let manifest = loadManifest(manifestPath)
    if (!manifest) return { nas, remote, storage }
    /* a backup folder chosen before backups went into destinations becomes one (RULES, Places) */
    if (session.backupFolder && keepBackupAsPlace(manifest, session.backupFolder))
      saveManifest(manifestPath, manifest)
    /* where SkyDock's lists are kept is fixed the first time there is a place to work it out
       from, and never moves after (RULES, Network storage) */
    const settled = settleListsDir(manifest) ?? session
    remote = await listRemoteFiles(manifest, settled)
    /* the board as it is once the storage has answered — a file may have landed meanwhile */
    manifest = loadManifest(manifestPath) ?? manifest
    /* footage that is nowhere is not listed: a freed file the storage no longer holds has
       nothing left anywhere, so the app forgets it rather than offering a dead row */
    const forgotten = forgetLostFiles(manifest, remote)
    if (forgotten.length > 0) {
      saveManifest(manifestPath, manifest)
      console.log(`[Board] Forgot ${forgotten.length} file(s) nowhere: ${forgotten.join(', ')}`)
    }
    /* What the storage holds is written into its own list, whoever put it there: a place can be
       pointed at a folder that was full of footage long before SkyDock saw it, and an upload
       must not send a second copy of what is already up there (RULES, Network storage). It is
       the board's own reading of those folders, so it costs nothing more to look — and a
       storage that will not have it written changes nothing about the board. */
    await learnStorage(manifest, settled, remote).catch((e: unknown) => {
      console.warn(`[Board] The storage's list of what it holds was not written: ${messageOf(e)}`)
    })
    /* the storage's own list of montages — every one it holds, from here or from elsewhere */
    const dir = montagesRemoteDir(manifest, settled)
    if (dir)
      storage = await readMontageIndex(settled, dir, earlierMontagesDirs(manifest))
        .then(async (index) => ({
          dir,
          montages: index.montages,
          /* what the list names that the storage no longer holds: the list remembers, the
             storage says what is there (RULES, Network storage) */
          lost: await lostOnStorage(settled, index.montages),
          problem: null as string | null
        }))
        .catch((e: unknown) => ({
          dir,
          montages: [],
          lost: { folders: [], links: [] },
          problem: messageOf(e)
        }))
  } catch {
    nas = { connected: false, hostname: null, username: null }
  }
  return { nas, remote, storage }
}

/* how long the board waits for the storage before taking it to be unreachable: less than the time the
   server gives a streamed answer, so the answer always arrives rather than being cut off */
const STORAGE_PATIENCE_MS = 4000

const unreachable: StorageLook = {
  nas: { connected: false, hostname: null, username: null },
  remote: null,
  storage: null
}

const lookAtStorageSoon = (outputDir: string) =>
  Promise.race([
    lookAtStorage(outputDir),
    new Promise<StorageLook>((resolve) =>
      setTimeout(() => resolve(unreachable), STORAGE_PATIENCE_MS)
    )
  ])

const loader = async (_args: Route.LoaderArgs) => {
  const outputDir = getOutputDir()
  const manifestPath = getManifestPath(outputDir)
  /* what the board recorded by itself a moment ago is on the page too */
  flushBoardChanges(manifestPath)
  let record: ReturnType<typeof readRecord> = { manifest: null, unreadable: true }
  try {
    record = readRecord(manifestPath)
  } catch {
    /* jumps that cannot be read are a record that cannot be read: said, and not drawn as no board */
  }
  const { manifest, unreadable } = record
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
    /* the room left on the disk, so a board opened on a full one says so from the first paint */
    disk: diskSpace(outputDir),
    /* where this machine keeps the work: every media address the board builds is a path inside it */
    outputDir,
    /* and what each montage's folder holds: nothing tells SkyDock when the editor finishes, so a
       film is only ever noticed by looking (RULES, The editing project) */
    montages: manifest ? statMontageArtifacts(manifest, outputDir) : {},
    /* until the storage has answered, it is being asked */
    nas: { connected: false, hostname: null, username: null } as NasState,
    remote: null,
    storage: null,
    /* what the storage says, sent after the board, once it has answered */
    storageLook: lookAtStorageSoon(outputDir),
    /* a record that is there and cannot be read is not a board nobody has started: that would offer a
       scan, which throws away the sorting it still holds */
    hasManifest: manifest !== null || unreadable,
    unreadable,
    /* what is being processed right now, if anything — a page loaded in the middle of it has to
       show it still running rather than offer to start it again */
    processing: processingNow(),
    /* and what is being uploaded: the same, for an upload — never offered a second time on top */
    uploading: uploadingNow()
  }
}

/* The board: one screen with the header across the top, the rail of folders down the side and the
   dialogs over them. It is the layout — it holds what the whole board shares and hands it down —
   and the folder the address names is drawn beside the rail by its own route, as is a file opened
   in it (RULES, The board). */
const Board = ({ loaderData }: Route.ComponentProps) => {
  const { searchParams: asked } = useSafeSearchParams(boardViewSchema)
  const windowed = asked.window === 'preview'
  /* the storage's answer, once it comes: the board is drawn and used without waiting for it */
  const [looked, setLooked] = useState<StorageLook | null>(null)
  const asking = loaderData.storageLook
  useEffect(() => {
    let current = true
    /* an answer that never came is a storage that could not be reached */
    void Promise.resolve(asking)
      .catch(() => unreachable)
      .then((answer) => {
        if (current && answer) setLooked(answer)
      })
    return () => {
      current = false
    }
  }, [asking])
  const storageAsked = asking !== undefined && looked === null
  /* while it is being worked on, a frame the board took too long to draw is said in the console,
     so a heavy page is found by its line rather than by a hand that felt it stutter */
  useEffect(() => {
    if (!import.meta.env.DEV || typeof PerformanceObserver === 'undefined') return
    if (!PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) return
    const watch = new PerformanceObserver((list) => {
      for (const frame of list.getEntries())
        if (frame.duration > 50)
          console.warn(`[Board] a frame took ${Math.round(frame.duration)} ms`)
    })
    watch.observe({ type: 'long-animation-frame', buffered: false })
    return () => watch.disconnect()
  }, [])
  const model = useBoardModel(looked ? { ...loaderData, ...looked } : loaderData)
  const cornered = useRoundedWindow()
  const details = useDetailsColumn()
  const { board, nas, drag, setDialog } = model
  /* the camera waiting to be asked about, when there is one */
  const newCamera = board.cameras.find((c) => board.cameraPrompts.includes(c.mount))
  const { groups, loose, places, note, setNote, send } = board
  const dialogOpen = model.dialog !== null
  /* ? opens the list of every key the board knows — a key of the whole window, so it listens there */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || dialogOpen || typingInField(e)) return
      e.preventDefault()
      setDialog({ kind: 'shortcuts' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, setDialog])

  /* the panel of what was sent and copied, open at will — done or not */
  const transfersPanel = useTransfersPanel()
  const transfersOpen = transfersPanel.open
  /* A line that says a transfer failed leads to the panel that names what went wrong; it does not
     open it by itself. */
  const upsetBy = board.noteIsProblem ? board.note : null
  const { setTrouble } = transfersPanel
  useEffect(() => {
    if (!upsetBy) {
      setTrouble(false)
      return
    }
    let cancelled = false
    void routingEngine
      .loader({ url: '/api/transfers' })
      .then((raw) => {
        const latest = transfersFileSchema.safeParse(raw).data?.transfers[0]
        const failed = !!latest && latest.state === 'failed' && Date.now() / 1000 - latest.at < 120
        if (cancelled) return
        setTrouble(failed)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [upsetBy, setTrouble])

  /* read before any early return below: a hook after one is a hook the first scan never calls */
  /* a card being copied: only whether, which changes twice a copy — its bytes are the panel's */
  const copying = useCameraCopying()
  const jobs = useJobs()

  if (!board.hasManifest) {
    return (
      <FirstScan
        scanning={board.scanning}
        onScan={board.firstScan}
        note={note}
        problem={board.noteIsProblem}
        onClose={() => setNote(null)}
        onOpen={board.noteIsProblem && transfersPanel.trouble ? transfersPanel.show : undefined}
      />
    )
  }

  /* Only what is about the storage as a whole. Which folder is whose is said where it matters. */
  const checkedAt = nas.remoteCheckedAt ? hhmm(nas.remoteCheckedAt) : null
  const nasLinks: NasLink[] = nas.connected
    ? [
        {
          label: nas.checking ? t`Checking the storage…` : t`Check the storage again`,
          mark: '⟳',
          title: checkedAt
            ? `${t`Ask the storage what it holds now — a file deleted there stops reading as uploaded.`} ${t`Last checked ${checkedAt}.`}`
            : t`Ask the storage what it holds now — a file deleted there stops reading as uploaded.`,
          disabled: nas.checking,
          onClick: nas.checkRemote
        },
        {
          label: t`Disconnect the storage`,
          mark: '⏻',
          /* asked first: it is a mark the size of a full stop, and the way back in wants a password
             and a code off somebody's phone */
          onClick: () => setDialog({ kind: 'disconnect' })
        }
      ]
    : storageAsked
      ? [{ label: t`Checking the storage…`, disabled: true, onClick: () => {} }]
      : [{ label: t`Connect the storage`, onClick: model.openConnect }]

  /* a dialog that ends in a change closes, then asks for it */
  const closeThen = (then: () => void) => {
    setDialog(null)
    then()
  }

  /* a file in a window of its own: the title bar and the file, and nothing else of the board — what it
     holds is still read and kept here, so the file is saved and stepped through as in any window */
  if (windowed)
    return (
      <main className='ground flex h-screen flex-col overflow-hidden'>
        <Outlet context={model} />
      </main>
    )

  return (
    <main
      onDragEnd={drag.endDrag}
      /* The floor under every place that takes a drop, and a target itself for nothing: what is let
         go where nothing takes it is left alone, and a file is told where it could have gone. An
         engine handed a file nobody wanted opens it, which in SkyDock's own window puts a video
         where the board was, with no way back to it. */
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (!fromComputer(e)) return
        setNote(t`Drop a clip on a destination, a montage or a jump to add it.`)
      }}
      className={`ground flex h-screen flex-col overflow-hidden ${cornered ? 'rounded-corner' : ''}`}>
      <div
        data-docked={details ? '' : undefined}
        className={`group grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-y-2.5 px-2.5 pt-2.5 pb-2 desk:px-0 desk:pt-0 desk:pb-0 desk:grid-cols-[264px_0px_minmax(0,1fr)] desk:grid-rows-[56px_minmax(0,1fr)] desk:gap-y-0 wide:transition-[grid-template-columns] wide:duration-300 wide:ease-out motion-reduce:transition-none ${
          details
            ? 'wide:grid-cols-[264px_0px_minmax(0,1fr)_0px_338px]'
            : 'wide:grid-cols-[264px_0px_minmax(0,1fr)_0px_0px]'
        }`}>
        <BoardHeader
          scanning={board.scanning}
          onScan={board.scan}
          onTemplates={() => setDialog({ kind: 'templates' })}
          onWorkFolder={() => setDialog({ kind: 'work-folder' })}
          onShortcuts={() => setDialog({ kind: 'shortcuts' })}
          onAbout={() => setDialog({ kind: 'about' })}
          find={model.findAnything}
        />

        <PlacesTree
          destinations={places}
          groups={model.listed}
          looseFiles={loose}
          cameras={board.cameras}
          knownCameras={board.knownCameras}
          statusContext={model.statusContext}
          montageOpen={(g) => !model.asOnStorage(g).uploaded}
          delivered={model.delivered}
          passengerProgress={model.passengerProgress}
          onAddPlace={model.addPlace}
          dropTarget={drag.placeDrop}
          overTarget={drag.overTarget}
          flashPlace={model.flashPlace}
        />
        {/* the folder the address names: its pane and the panel beside it */}
        <Outlet context={model} />
      </div>

      <StatusBar
        transfers={{ open: transfersOpen, onToggle: transfersPanel.toggle }}
        proxies={board.proxyProgress}
        jumps={board.jumpProgress}
        disk={board.disk ?? loaderData.disk}
        nas={{ connected: nas.connected, host: nas.host, user: nas.user, links: nasLinks }}
      />

      <DialogHost
        dialog={model.dialog}
        onDialog={setDialog}
        nas={nas}
        places={places}
        onChooseFolder={model.chooseFolder}
        groups={groups}
        looseFiles={loose}
        asOnStorage={model.asOnStorage}
        facts={board.montageFacts}
        folderFor={model.folderFor}
        plan={model.sendPlan}
        onPlan={model.setSendPlan}
        onUpload={model.confirmUpload}
        storage={board.storage}
        onEmailed={(folder, sent, to) =>
          send('email', {
            intent: 'mark-emailed',
            emailed: { folder, sent, ...(to.trim() ? { to: to.trim() } : {}) }
          })
        }
        onFree={(group) =>
          closeThen(() => send(`free:${group.id}`, { intent: 'free-montage', groupId: group.id }))
        }
        freeableOf={model.freeableOf}
        onFreePlace={(place) =>
          closeThen(() => send(`free:dz:${place}`, { intent: 'free-dropzone', destination: place }))
        }
        onDisconnect={() => closeThen(nas.disconnect)}
        onRemovePlace={(place) =>
          closeThen(() => {
            send(`remove:dz:${place}`, { intent: 'remove-destination', destination: place })
            /* the place it was showing is gone; what was in it is in Fresh files now */
            model.pickPlace({ kind: 'sort' })
          })
        }
        onTakeBack={(mode, group) =>
          closeThen(() => {
            send('take-back', {
              intent: mode === 'reset' ? 'reset-montage' : 'delete-montage',
              groupId: group.id
            })
            /* a deleted montage has no page left; its jumps are in Fresh files now */
            if (mode === 'delete') model.pickPlace({ kind: 'sort' })
          })
        }
        onDeleteJump={(group) => closeThen(() => model.deleteJump(group, true))}
        onResetFresh={(what) =>
          closeThen(() => {
            model.clearSelection()
            send('reset', { intent: 'reset-fresh', resetWhat: what })
          })
        }
        onForgetCamera={(key) => {
          model.pickPlace({ kind: 'sort' })
          void routingEngine
            .action({ url: '/api/camera', actionArgs: { forget: key } })
            .catch(() => undefined)
        }}
        onMontage={(groupId, template) => closeThen(() => model.makeMontage(groupId, template))}
        passengers={model.passengers}
        onNameMontage={(what, passenger) => closeThen(() => model.nameDropped(what, passenger))}
        onRemoveFiles={(to, files) => closeThen(() => model.removeTo(to, files))}
        workFolder={{
          folder: loaderData.outputDir,
          /* the folder is not left while something is being written into it */
          working: board.uploading
            ? t`An upload is running`
            : copying
              ? t`A camera is being copied`
              : jobs.some((job) => job.type === 'import')
                ? t`Files are being copied in`
                : board.scanning
                  ? t`A scan is running`
                  : board.busy
                    ? t`The board is busy`
                    : null
        }}
      />

      {/* a camera never met before asks what to do about it, one at a time */}
      {newCamera && (
        <NewCameraDialog
          key={newCamera.key}
          name={newCamera.camera}
          fresh={newCamera.fresh}
          onAnswer={({ choose, ...answer }) => {
            void routingEngine
              .action({
                url: '/api/camera',
                actionArgs: { remember: { key: newCamera.key, ...answer } }
              })
              .catch(() => undefined)
            if (choose) model.pickPlace({ kind: 'camera', name: newCamera.key })
          }}
        />
      )}

      {/* what is on its way, in the bottom-right corner, whatever page is open: a camera being copied off, files
          being copied in, and the upload going out — one above the other when several are */}
      {(board.uploading || copying || jobs.length > 0 || transfersOpen) && (
        <div className='fixed right-4 bottom-8.5 z-40 flex flex-col items-end gap-2'>
          <JobsPanel dsmHost={nas.host} />
          {transfersOpen && (
            <TransfersPanel
              key={transfersPanel.shown}
              dsmHost={nas.host}
              stamp={`${board.uploading ?? ''}|${copying ? 1 : 0}|${jobs.length}`}
              onClose={transfersPanel.close}
            />
          )}
        </div>
      )}
    </main>
  )
}

export { loader, shouldRevalidate }

export default Board
