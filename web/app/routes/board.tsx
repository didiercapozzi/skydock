import { getOutputDir, transfersFileSchema } from '@skydock/scripts/client'
import {
  earlierMontagesDirs,
  ensureNasSession,
  forgetLostFiles,
  flushBoardChanges,
  getManifestPath,
  learnStorage,
  listRemoteFiles,
  loadManifestAsync,
  readRecordAsync,
  uploadingNow,
  saveManifest,
  settleListsDir,
  statProcessedOutputs,
  statProxies,
  statMontageArtifacts,
  montagesRemoteDir,
  messageOf
} from '@skydock/scripts'
import type { MontageEntry, MontageLost } from '@skydock/scripts'
import { keepBackupAsPlace } from '../../../packages/skydock-scripts/src/destinations'
import { diskSpace } from '../../../packages/skydock-scripts/src/diskSpace'
import { lostOnStorage, readMontageIndex } from '../../../packages/skydock-scripts/src/montageIndex'
import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { Outlet, useNavigation } from 'react-router'
import { useSafeSearchParams } from '../helpers/routing'
import { boardViewSchema } from '../helpers/view'
import type { ShouldRevalidateFunctionArgs } from 'react-router'
import { BoardHeader, StatusBar } from '../components/board-header'
import type { NasLink } from '../components/board-header'
import { FirstScan } from '../components/first-scan'
import { NewCameraDialog } from '../components/camera-dialogs'
import { DialogHost } from '../components/dialog-host'
import { JobsPanel, headlineOf } from '../components/jobs-panel'
import { PendingLine, doingOf } from '../components/pending'
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
import { usePending } from '../hooks/usePending'
import { useRoundedWindow } from '../hooks/useWindowFrame'
import type { Route } from './+types/board'

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

const lookAtStorage = async (outputDir: string) => {
  const manifestPath = getManifestPath(outputDir)
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
    let manifest = await loadManifestAsync(manifestPath)
    if (!manifest) return { nas, remote, storage }
    if (session.backupFolder && keepBackupAsPlace(manifest, session.backupFolder))
      await saveManifest(manifestPath, manifest)
    const settled = (await settleListsDir(manifest)) ?? session
    remote = await listRemoteFiles(manifest, settled)
    manifest = (await loadManifestAsync(manifestPath)) ?? manifest
    const forgotten = await forgetLostFiles(manifest, remote)
    if (forgotten.length > 0) {
      await saveManifest(manifestPath, manifest)
      console.log(`[Board] Forgot ${forgotten.length} file(s) nowhere: ${forgotten.join(', ')}`)
    }
    await learnStorage(manifest, settled, remote).catch((e: unknown) => {
      console.warn(`[Board] The storage's list of what it holds was not written: ${messageOf(e)}`)
    })
    const dir = montagesRemoteDir(manifest, settled)
    if (dir)
      storage = await readMontageIndex(settled, dir, earlierMontagesDirs(manifest))
        .then(async (index) => ({
          dir,
          montages: index.montages,
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
  await flushBoardChanges(manifestPath)
  let record: Awaited<ReturnType<typeof readRecordAsync>> = { manifest: null, unreadable: true }
  try {
    record = await readRecordAsync(manifestPath)
  } catch {}
  const { manifest, unreadable } = record
  const grouped = new Set(
    (manifest?.groups ?? []).flatMap((g) => g.files.map((f) => f.id ?? f.path))
  )
  const looseFiles = (manifest?.files ?? []).filter((f) => !grouped.has(f.id ?? f.path))
  return {
    groups: manifest?.groups ?? [],
    looseFiles,
    destinations: manifest?.destinations ?? [],
    outputs: manifest ? await statProcessedOutputs(manifest) : {},
    proxies: manifest ? await statProxies(manifest, outputDir) : {},
    disk: await diskSpace(outputDir),
    outputDir,
    montages: manifest ? await statMontageArtifacts(manifest, outputDir) : {},
    nas: { connected: false, hostname: null, username: null } as NasState,
    remote: null,
    storage: null,
    storageLook: lookAtStorageSoon(outputDir),
    hasManifest: manifest !== null || unreadable,
    unreadable,
    uploading: uploadingNow()
  }
}

const Board = ({ loaderData }: Route.ComponentProps) => {
  const { searchParams: asked } = useSafeSearchParams(boardViewSchema)
  const windowed = asked.window === 'preview'
  const [looked, setLooked] = useState<StorageLook | null>(null)
  const asking = loaderData.storageLook
  useEffect(() => {
    let current = true
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
  const navigation = useNavigation()
  const doing = board.busy ? doingOf(board.busy) : null
  const navigating = navigation.state !== 'idle'
  const pending = usePending(doing !== null || navigating)
  const newCamera = board.cameras.find((c) => board.cameraPrompts.includes(c.mount))
  const { groups, loose, places, note, setNote, send } = board
  const dialogOpen = model.dialog !== null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || dialogOpen || typingInField(e)) return
      e.preventDefault()
      setDialog({ kind: 'shortcuts' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, setDialog])

  const transfersPanel = useTransfersPanel()
  const transfersOpen = transfersPanel.open
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

  const copying = useCameraCopying()
  const jobs = useJobs()
  const stoppedByLeaving = jobs.filter((job) => job.type !== 'proxy' && job.type !== 'moments')

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
          onClick: () => setDialog({ kind: 'disconnect' })
        }
      ]
    : storageAsked
      ? [{ label: t`Checking the storage…`, disabled: true, onClick: () => {} }]
      : [{ label: t`Connect the storage`, onClick: model.openConnect }]

  const closeThen = (then: () => void) => {
    setDialog(null)
    then()
  }

  if (windowed)
    return (
      <main className='ground flex h-screen flex-col overflow-hidden'>
        <Outlet context={model} />
      </main>
    )

  return (
    <main
      onDragEnd={drag.endDrag}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (!fromComputer(e)) return
        setNote(t`Drop a clip on a destination, a montage or a jump to add it.`)
      }}
      className={`ground relative flex h-screen flex-col overflow-hidden ${cornered ? 'rounded-corner' : ''}`}>
      <PendingLine active={pending} />
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
          onFilmTemplates={() => setDialog({ kind: 'filmTemplates' })}
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
        <Outlet context={model} />
      </div>

      <StatusBar
        doing={pending ? (doing ?? t`Loading…`) : null}
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
        onSend={model.confirmSend}
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
            model.pickPlace({ kind: 'sort' })
          })
        }
        onTakeBack={(mode, group) =>
          closeThen(() => {
            send('take-back', {
              intent: mode === 'reset' ? 'reset-montage' : 'delete-montage',
              groupId: group.id
            })
            if (mode === 'delete') model.pickPlace({ kind: 'sort' })
          })
        }
        onStartAgain={(group, which) =>
          closeThen(() =>
            send('start-again', { intent: 'start-edit-again', groupId: group.id, edit: which })
          )
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
          working:
            stoppedByLeaving.length > 0
              ? stoppedByLeaving.map((job) => headlineOf(job).what).join(' · ')
              : board.scanning
                ? t`A scan is running`
                : null
        }}
      />

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
