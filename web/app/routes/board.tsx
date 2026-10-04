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
import { DialogHost } from '../components/dialog-host'
import { CameraPanel } from '../components/camera-panel'
import { ImportPanel } from '../components/import-panel'
import { BringPanel } from '../components/bring-panel'
import { DeletePanel } from '../components/delete-panel'
import { FreePanel } from '../components/free-panel'
import { ProxyPanel } from '../components/proxy-panel'
import { TransfersPanel } from '../components/transfers-panel'
import { UploadPanel } from '../components/upload-panel'
import { PlacesTree } from '../components/places-tree'
import { formatTime } from '../components/utils'
import { fromComputer } from '../helpers/import'
import { typingInField } from '../helpers/keys'
import { routingEngine } from '../helpers/routing'
import { useBringing, useCameraCopying, useDeletingAll, useFreeing } from '../hooks/liveStore'
import { useTransfersPanel } from '../hooks/transfersPanel'
import { useBoardModel } from '../hooks/useBoardModel'
import { useDetailsColumn } from '../hooks/useDetails'
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
    let manifest = loadManifest(manifestPath)
    if (!manifest) return { nas, remote, storage }
    if (session.backupFolder && keepBackupAsPlace(manifest, session.backupFolder))
      saveManifest(manifestPath, manifest)
    const settled = settleListsDir(manifest) ?? session
    remote = await listRemoteFiles(manifest, settled)
    manifest = loadManifest(manifestPath) ?? manifest
    const forgotten = forgetLostFiles(manifest, remote)
    if (forgotten.length > 0) {
      saveManifest(manifestPath, manifest)
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

const loader = async (_args: Route.LoaderArgs) => {
  const outputDir = getOutputDir()
  const manifestPath = getManifestPath(outputDir)
  flushBoardChanges(manifestPath)
  let manifest = null
  try {
    manifest = loadManifest(manifestPath)
  } catch {
    manifest = null
  }
  const grouped = new Set(
    (manifest?.groups ?? []).flatMap((g) => g.files.map((f) => f.id ?? f.path))
  )
  const looseFiles = (manifest?.files ?? []).filter((f) => !grouped.has(f.id ?? f.path))
  return {
    groups: manifest?.groups ?? [],
    looseFiles,
    destinations: manifest?.destinations ?? [],
    outputs: manifest ? statProcessedOutputs(manifest) : {},
    proxies: manifest ? statProxies(manifest, outputDir) : {},
    disk: diskSpace(outputDir),
    outputDir,
    montages: manifest ? statMontageArtifacts(manifest, outputDir) : {},
    nas: { connected: false, hostname: null, username: null } as NasState,
    remote: null,
    storage: null,
    storageLook: lookAtStorage(outputDir),
    hasManifest: manifest !== null,
    processing: processingNow(),
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
    void Promise.resolve(asking).then((answer) => {
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
  const details = useDetailsColumn()
  const { board, nas, drag, setDialog } = model
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

  if (!board.hasManifest) {
    return (
      <FirstScan
        scanning={board.scanning}
        onScan={board.scan}
        note={note}
        problem={board.noteIsProblem}
        onClose={() => setNote(null)}
        onOpen={board.noteIsProblem && transfersPanel.trouble ? transfersPanel.show : undefined}
      />
    )
  }

  const checkedAt = nas.remoteCheckedAt ? formatTime(nas.remoteCheckedAt) : null
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

  const copying = useCameraCopying()
  const bringing = useBringing()
  const freeing = useFreeing()
  const deletingCount = Object.keys(useDeletingAll()).length

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
      className='ground flex h-screen flex-col overflow-hidden'>
      <div
        data-docked={details ? '' : undefined}
        className={`group grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-y-2.5 px-2.5 pt-2.5 pb-2 min-[781px]:px-0 min-[781px]:pt-0 min-[781px]:pb-0 min-[781px]:grid-cols-[264px_0px_minmax(0,1fr)] min-[781px]:grid-rows-[56px_minmax(0,1fr)] min-[781px]:gap-y-0 min-[1101px]:transition-[grid-template-columns] min-[1101px]:duration-300 min-[1101px]:ease-out motion-reduce:transition-none ${
          details
            ? 'min-[1101px]:grid-cols-[264px_0px_minmax(0,1fr)_0px_338px]'
            : 'min-[1101px]:grid-cols-[264px_10px_minmax(0,1fr)_0px_0px]'
        }`}>
        <BoardHeader
          scanning={board.scanning}
          onScan={board.scan}
          onTemplates={() => setDialog({ kind: 'templates' })}
          onWorkFolder={() => setDialog({ kind: 'work-folder' })}
          onHistory={() => setDialog({ kind: 'history' })}
          onShortcuts={() => setDialog({ kind: 'shortcuts' })}
          find={model.findAnything}
        />

        <PlacesTree
          destinations={places}
          groups={model.listed}
          looseFiles={loose}
          cameras={board.cameras}
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
        transfers={{ open: transfersOpen, onToggle: transfersPanel.toggle }}
        proxies={board.proxyProgress}
        jumps={board.jumpProgress}
        disk={board.disk ?? loaderData.disk}
        nas={{ connected: nas.connected, host: nas.host, user: nas.user, links: nasLinks }}
        uploading={
          board.uploading && model.progress
            ? {
                label: board.uploadLabel ?? '',
                part:
                  model.progress.totalBytes > 0
                    ? model.progress.bytesUploaded / model.progress.totalBytes
                    : 0
              }
            : null
        }
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
        onDeleteJump={(group) => closeThen(() => model.deleteJump(group, true))}
        onResetFresh={(what) =>
          closeThen(() => {
            model.clearSelection()
            send('reset', { intent: 'reset-fresh', resetWhat: what })
          })
        }
        onMontage={(groupId, template) => closeThen(() => model.makeMontage(groupId, template))}
        passengers={model.passengers}
        onNameMontage={(what, passenger) => closeThen(() => model.nameDropped(what, passenger))}
        onRemoveFiles={(to, files) => closeThen(() => model.removeTo(to, files))}
        onGoBack={(step) => closeThen(() => send('go-back', { intent: 'go-back', step }))}
        workFolder={{
          folder: loaderData.outputDir,
          working: board.uploading
            ? t`An upload is running`
            : copying
              ? t`A camera is being copied`
              : model.coming
                ? t`Files are being copied in`
                : board.scanning
                  ? t`A scan is running`
                  : board.busy
                    ? t`The board is busy`
                    : null
        }}
      />

      {(model.coming ||
        board.uploading ||
        copying ||
        bringing ||
        deletingCount > 0 ||
        freeing !== null ||
        board.proxyProgress.waiting > 0 ||
        transfersOpen) && (
        <div className='fixed right-4 bottom-[34px] z-40 flex flex-col items-end gap-2'>
          {copying && (
            <CameraPanel
              onStop={() =>
                void routingEngine
                  .action({ url: '/api/camera', actionArgs: { stop: true } })
                  .catch(() => null)
              }
            />
          )}
          {board.uploading && (
            <UploadPanel
              label={board.uploadLabel ?? ''}
              progress={model.progress}
              dsmHost={nas.host}
              cancelling={board.cancelling}
              onCancel={board.cancelUpload}
            />
          )}
          {bringing && <BringPanel />}
          <ProxyPanel
            {...board.proxyProgress}
            names={Object.fromEntries(
              [...groups.flatMap((g) => g.files), ...board.loose].flatMap((f) =>
                f.id ? [[f.id, f.filename]] : []
              )
            )}
          />
          {deletingCount > 0 && <DeletePanel />}
          {freeing && <FreePanel />}
          {transfersOpen && (
            <TransfersPanel
              key={transfersPanel.shown}
              dsmHost={nas.host}
              uploading={
                board.uploading && model.progress
                  ? {
                      label: board.uploadLabel ?? '',
                      part:
                        model.progress.totalBytes > 0
                          ? model.progress.bytesUploaded / model.progress.totalBytes
                          : 0
                    }
                  : null
              }
              proxies={board.proxyProgress}
              importing={
                model.coming
                  ? {
                      where: model.coming.where,
                      done: model.coming.done,
                      total: model.coming.files.length
                    }
                  : null
              }
              stamp={`${board.uploading ?? ''}|${model.coming ? 1 : 0}|${copying ? 1 : 0}|${bringing?.state ?? ''}|${deletingCount > 0 ? 1 : 0}`}
              onClose={transfersPanel.close}
            />
          )}
          {model.coming && (
            <ImportPanel
              where={model.coming.where}
              files={model.coming.files}
              done={model.coming.done}
              failed={model.coming.failed}
            />
          )}
        </div>
      )}
    </main>
  )
}

export { loader, shouldRevalidate }

export default Board
