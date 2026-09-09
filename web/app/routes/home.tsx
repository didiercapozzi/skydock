import { loadManifest, loadNasSession } from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ComparisonDialog } from '../components/comparison-dialog'
import { ConnectionDialog } from '../components/connection-dialog'
import { DropActionDialog } from '../components/drop-action-dialog'
import { NasFolderBrowser } from '../components/nas-folder-browser'
import { PreviewDrawer } from '../components/preview-drawer'
import { StagingTray } from '../components/staging-tray'
import { DayGroups } from '../components/home/DayGroups'
import { Header } from '../components/home/Header'
import { ReviewHeader } from '../components/home/ReviewHeader'
import { Unassigned } from '../components/home/Unassigned'
import { useSafeFetcher } from '../helpers/routing'
import { useCompare } from '../hooks/useCompare'
import { useDragDrop } from '../hooks/useDragDrop'
import { useJumps } from '../hooks/useJumps'
import { usePreview } from '../hooks/usePreview'
import { useSelection } from '../hooks/useSelection'
import type { Route } from './+types/home'

const nasSuccessSchema = z
  .object({
    connected: z.boolean(),
    hostname: z.string().optional(),
    username: z.string().optional(),
    defaultFolder: z.string().nullable().optional()
  })
  .passthrough()

const nasErrorSchema = z
  .object({
    success: z.literal(false),
    globalErrors: z.array(z.string()).optional(),
    fieldErrors: z.record(z.string(), z.string()).optional()
  })
  .passthrough()

const loader = async ({}: Route.LoaderArgs) => {
  const outputDir = process.env.SKYDOCK_OUTPUT_DIR ?? '/workspace/output'
  let manifest = null
  try {
    manifest = loadManifest(`${outputDir}/manifest.json`)
  } catch {
    manifest = null
  }
  let initialNas: {
    connected: boolean
    defaultFolder: string | null
    hostname?: string
    username?: string
  } = {
    connected: false,
    defaultFolder: null
  }
  try {
    const session = loadNasSession()
    if (session) {
      initialNas = {
        connected: true,
        defaultFolder: session.defaultFolder ?? null,
        hostname: session.hostname,
        username: session.username
      }
    }
  } catch {}
  return { manifest, initialNas }
}

const Home = ({ loaderData }: Route.ComponentProps) => {
  const manifest = loaderData.manifest
  const initialNas = loaderData.initialNas as
    | { connected: boolean; defaultFolder: string | null }
    | undefined
  const { jumps, jumpsByDay, setJumps, saveJumps } = useJumps(manifest?.jumps ?? [])
  const manifestFiles = manifest?.files ?? []
  const filesInJumps = new Set(jumps.flatMap((j) => j.files.map((f) => f.path)))
  const unassignedFiles = manifestFiles.filter((f) => !filesInJumps.has(f.path))
  const { selection, selectedCount, handleSelect, clearSelection } = useSelection(
    jumps,
    unassignedFiles
  )
  const { compareIds, showComparison, handleCompareToggle, setCompareIds, setShowComparison } =
    useCompare()
  const {
    preview,
    videoState,
    handlePreview,
    handleVideoSeek,
    handleVideoApply,
    handleVideoRef,
    setVideoState,
    closePreview,
    setPreview
  } = usePreview(jumps, unassignedFiles, setJumps, saveJumps)
  const {
    dropDialog,
    dropHint,
    handleDragStart,
    handleTrayDragStart,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    executeDrop,
    setDropDialog
  } = useDragDrop()
  const nasFetcher = useSafeFetcher()
  const [showConnectionDialog, setShowConnectionDialog] = useState(false)
  const [showFolderBrowser, setShowFolderBrowser] = useState(false)
  const [processingId] = useState<string | null>(null)
  const [uploadingId] = useState<string | null>(null)

  const parsedSuccess = nasSuccessSchema.safeParse(nasFetcher.data)
  const parsedError = nasErrorSchema.safeParse(nasFetcher.data)
  const nasConnected = parsedSuccess.success
    ? parsedSuccess.data.connected
    : (initialNas?.connected ?? false)
  const defaultFolder = parsedSuccess.success
    ? (parsedSuccess.data.defaultFolder ?? null)
    : (initialNas?.defaultFolder ?? null)
  const nasError =
    !parsedSuccess.success && parsedError.success
      ? (parsedError.data.globalErrors?.[0] ??
        (parsedError.data.fieldErrors
          ? Object.values(parsedError.data.fieldErrors)[0]
          : undefined) ??
        'Request failed')
      : null

  const effectiveShowConnection = showConnectionDialog
    ? !(parsedSuccess.success && parsedSuccess.data.connected)
    : false
  const effectiveShowFolder = showFolderBrowser
    ? !(parsedSuccess.success && parsedSuccess.data.connected)
    : false

  const handleConnect = (host: string, user: string, password: string) => {
    nasFetcher.submit({
      url: '/api/nas',
      actionArgs: { intent: 'connect', host, user, password }
    })
  }

  const handleDisconnect = () => {
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'disconnect' } })
  }

  const handleSelectFolder = (path: string) => {
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'select-folder', path } })
  }

  const handleMerge = () => {}
  const handleProcess = () => {}
  const handleUpload = () => {}
  const mainRef = useRef<HTMLElement | null>(null)

  const handlePassengerChange = (
    jumpId: string,
    passenger: import('../components/types').ManifestPassenger | undefined
  ) => {
    const next = jumps.map((j) => (j.id === jumpId ? { ...j, passenger } : j))
    setJumps(next)
    saveJumps(next)
  }

  useEffect(() => {
    mainRef.current?.setAttribute('data-hydrated', 'true')
  }, [])

  if (!manifest) {
    return (
      <main
        ref={mainRef}
        data-hydrated='false'
        className='min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100'>
        <Header
          nasConnected={nasConnected}
          defaultFolder={defaultFolder}
          onConnect={() => setShowConnectionDialog(true)}
          onDisconnect={handleDisconnect}
          onChangeFolder={() => setShowFolderBrowser(true)}
        />
        <div className='max-w-7xl mx-auto px-6 py-8'>
          <h1 className='text-3xl font-bold text-gray-900'>No Manifest Found</h1>
          <p className='text-gray-500 mt-2'>Run a scan to generate the manifest.</p>
        </div>
        {effectiveShowConnection && (
          <ConnectionDialog
            onConnect={handleConnect}
            onCancel={() => setShowConnectionDialog(false)}
            error={nasError ?? undefined}
          />
        )}
        <NasFolderBrowser
          open={effectiveShowFolder}
          onSelect={handleSelectFolder}
          onClose={() => setShowFolderBrowser(false)}
        />
      </main>
    )
  }

  return (
    <main
      ref={mainRef}
      data-hydrated='false'
      className='min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100'>
      <Header
        nasConnected={nasConnected}
        defaultFolder={defaultFolder}
        onConnect={() => setShowConnectionDialog(true)}
        onDisconnect={handleDisconnect}
        onChangeFolder={() => setShowFolderBrowser(true)}
      />
      <div className='max-w-7xl mx-auto px-6 py-8'>
        <ReviewHeader
          jumpCount={jumps.length}
          fileCount={manifestFiles.length}
          compareIds={compareIds}
          onClearCompare={() => setCompareIds([])}
          onShowComparison={() => setShowComparison(true)}
        />
        <Unassigned
          files={unassignedFiles}
          selection={selection}
          previewedPath={preview?.files[preview.index]?.path ?? null}
          onSelect={handleSelect}
          onPreview={handlePreview}
          onDragStart={(e, groupId, paths) => handleDragStart(e, groupId, paths, selection)}
          onDragEnd={handleDragEnd}
        />
        <DayGroups
          groups={jumpsByDay}
          compareIds={compareIds}
          selection={selection}
          previewedPath={preview?.files[preview.index]?.path ?? null}
          dropHint={dropHint}
          onCompareToggle={handleCompareToggle}
          onSelect={handleSelect}
          onPreview={handlePreview}
          onDragStart={(e, groupId, paths) => handleDragStart(e, groupId, paths, selection)}
          onDragEnd={handleDragEnd}
          onDrop={(e, id) => handleDrop(e, id, jumps, saveJumps, setJumps)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onPassengerChange={handlePassengerChange}
          onProcess={handleProcess}
          processingId={processingId}
          onUpload={handleUpload}
          uploadingId={uploadingId}
        />
        {selectedCount > 0 && (
          <StagingTray
            selectedCount={selectedCount}
            onClear={clearSelection}
            onDragStart={(e) => handleTrayDragStart(e, selection)}
          />
        )}
        {preview && preview.files[preview.index] && (
          <PreviewDrawer
            files={preview.files}
            index={preview.index}
            onClose={closePreview}
            onPrevious={() =>
              setPreview((p) => (p ? { ...p, index: Math.max(0, p.index - 1) } : p))
            }
            onNext={() =>
              setPreview((p) =>
                p ? { ...p, index: Math.min(p.files.length - 1, p.index + 1) } : p
              )
            }
            cropStart={videoState.crop.cropStart}
            cropEnd={videoState.crop.cropEnd}
            zoom={videoState.zoom}
            currentTime={videoState.currentTime}
            duration={videoState.duration || 10}
            onSeek={handleVideoSeek}
            onCropChange={(range) => setVideoState({ crop: range })}
            onApply={handleVideoApply}
            onZoomChange={(zoom) => setVideoState({ zoom })}
            onDurationChange={(duration) => setVideoState({ duration })}
            onVideoRef={handleVideoRef}
          />
        )}
        {dropDialog && (
          <DropActionDialog
            x={dropDialog.x}
            y={dropDialog.y}
            onMove={() =>
              executeDrop('move', jumps, manifestFiles, setJumps, saveJumps, clearSelection)
            }
            onCopy={() =>
              executeDrop('copy', jumps, manifestFiles, setJumps, saveJumps, clearSelection)
            }
            onCancel={() => setDropDialog(null)}
          />
        )}
        {showComparison && compareIds.length === 2 && (
          <ComparisonDialog
            jumps={jumps}
            leftJumpId={compareIds[0]}
            rightJumpId={compareIds[1]}
            onClose={() => setShowComparison(false)}
            onMerge={handleMerge}
          />
        )}
        {effectiveShowConnection && (
          <ConnectionDialog
            onConnect={handleConnect}
            onCancel={() => setShowConnectionDialog(false)}
            error={nasError ?? undefined}
          />
        )}
        <NasFolderBrowser
          open={effectiveShowFolder}
          onSelect={handleSelectFolder}
          onClose={() => setShowFolderBrowser(false)}
        />
      </div>
    </main>
  )
}

export { loader }

export default Home
