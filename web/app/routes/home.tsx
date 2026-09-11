import {
  dsmValidateSession,
  loadManifest,
  loadNasSession,
  manifestJumpSchema,
  tryAutoRefreshSession
} from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { useRevalidator } from 'react-router'
import { z } from 'zod'
import { ComparisonDialog } from '../components/comparison-dialog'
import { ConnectionDialog } from '../components/connection-dialog'
import { DropActionDialog } from '../components/drop-action-dialog'
import { GroupCreationDialog } from '../components/group-creation-dialog'
import { DayGroups } from '../components/home/DayGroups'
import { EmptyManifest } from '../components/home/EmptyManifest'
import { Header } from '../components/home/Header'
import { ReviewHeader } from '../components/home/ReviewHeader'
import { Unassigned } from '../components/home/Unassigned'
import { NasFolderBrowser } from '../components/nas-folder-browser'
import { PreviewDrawer } from '../components/preview-drawer'
import { StagingTray } from '../components/staging-tray'
import { useSafeFetcher } from '../helpers/routing'
import { useCompare } from '../hooks/useCompare'
import { useDragDrop } from '../hooks/useDragDrop'
import { useJumps } from '../hooks/useJumps'
import { usePreview } from '../hooks/usePreview'
import { useSelection } from '../hooks/useSelection'
import { useUploadProgress } from '../hooks/useUploadProgress'
import type { ManifestJump } from '../components/types'
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

const manifestJumpsResponseSchema = z.object({ jumps: z.array(manifestJumpSchema) }).passthrough()

const loader = async (_args: Route.LoaderArgs) => {
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
      const valid = await dsmValidateSession(session.hostname, session.sessionId).catch(() => false)
      let effectiveSession: typeof session | null = null
      if (valid) effectiveSession = session
      else {
        const refreshed = await tryAutoRefreshSession().catch(() => null)
        if (refreshed) effectiveSession = refreshed
      }
      if (effectiveSession) {
        initialNas = {
          connected: true,
          defaultFolder: effectiveSession.defaultFolder ?? null,
          hostname: effectiveSession.hostname,
          username: effectiveSession.username
        }
      } else if (valid === false && session.encPasswd) {
        initialNas = {
          connected: false,
          defaultFolder: session.defaultFolder ?? null,
          hostname: session.hostname,
          username: session.username
        }
      }
    }
  } catch {}
  return { manifest, initialNas }
}

const Home = ({ loaderData }: Route.ComponentProps) => {
  const manifest = loaderData.manifest
  const initialNasSchema = z
    .object({
      connected: z.boolean(),
      defaultFolder: z.string().nullable()
    })
    .passthrough()
  const initialNas = initialNasSchema.safeParse(loaderData.initialNas).data ?? undefined
  const { jumps, jumpsByDay, setJumps, updateJumps } = useJumps(manifest?.jumps ?? [])
  const manifestFiles = manifest?.files ?? []
  const filesInJumps = new Set(jumps.flatMap((j) => j.files.map((f) => f.path)))
  const unassignedFiles = manifestFiles.filter((f) => !filesInJumps.has(f.path))
  const pathCounts = new Map<string, number>()
  for (const j of jumps) {
    for (const f of j.files) pathCounts.set(f.path, (pathCounts.get(f.path) ?? 0) + 1)
  }
  const multiJumpPaths = new Set<string>()
  for (const [p, c] of pathCounts) if (c > 1) multiJumpPaths.add(p)
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
  } = usePreview(jumps, unassignedFiles, updateJumps)
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
  const manifestFetcher = useSafeFetcher()
  const scanFetcher = useSafeFetcher()
  const revalidator = useRevalidator()
  const [showConnectionDialog, setShowConnectionDialog] = useState(false)
  const [connectionDialogOpenData, setConnectionDialogOpenData] = useState<unknown>(null)
  const [showFolderBrowser, setShowFolderBrowser] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [showGroupCreation, setShowGroupCreation] = useState(false)
  const [groupCreationInitialDay, setGroupCreationInitialDay] = useState<string | undefined>(
    undefined
  )
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const uploadProgress = useUploadProgress(uploadingId)

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

  const shouldAutoCloseConnection =
    parsedSuccess.success &&
    parsedSuccess.data.connected &&
    connectionDialogOpenData !== nasFetcher.data &&
    showConnectionDialog
  const effectiveShowConnection = showConnectionDialog && !shouldAutoCloseConnection

  const openConnectionDialog = () => {
    setConnectionDialogOpenData(nasFetcher.data)
    setShowConnectionDialog(true)
  }

  const closeConnectionDialog = () => {
    setShowConnectionDialog(false)
  }

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
    setShowFolderBrowser(false)
  }

  const handleMerge = (leftId: string, rightId: string, anchorEpoch: number) => {
    setManifestError(null)
    setShowComparison(false)
    setCompareIds([])
    manifestFetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'merge-jumps', leftId, rightId, anchorEpoch }
    })
  }
  const handleProcess = (jumpId: string) => {
    setManifestError(null)
    setProcessingId(jumpId)
    manifestFetcher.submit({ url: '/api/manifest', actionArgs: { intent: 'process-jump', jumpId } })
  }
  const handleUpload = (jumpId: string) => {
    setManifestError(null)
    if (!nasConnected) {
      openConnectionDialog()
      return
    }
    if (!defaultFolder) {
      setShowFolderBrowser(true)
      return
    }
    setUploadingId(jumpId)
    manifestFetcher.submit({ url: '/api/manifest', actionArgs: { intent: 'upload-jump', jumpId } })
  }
  const handleImportFile = async (jumpId: string, files: File[]) => {
    setImportingId(jumpId)
    try {
      const jump = jumps.find((j) => j.id === jumpId)
      const day = jump?.day
      for (const file of files) {
        const params = new URLSearchParams({ jumpId, filename: file.name })
        if (day) params.set('day', day)
        const res = await fetch(`/api/import-file?${params}`, {
          method: 'POST',
          body: file.stream(),
          headers: { 'Content-Type': 'application/octet-stream' }
        })
        const data = await res.json()
        if (data.error) {
          setManifestError(data.error)
          return
        }
        if (data.manifest) {
          setJumps(data.manifest.jumps)
        }
      }
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportingId(null)
    }
  }
  const scanning = scanFetcher.state !== 'idle'
  const handleScan = () => {
    scanFetcher.submit({ url: '/api/scan', actionArgs: {} })
  }
  const mainRef = useRef<HTMLElement | null>(null)

  const handleLabelChange = (jumpId: string, label: string) => {
    const next = jumps.map((j) => (j.id === jumpId ? { ...j, label } : j))
    updateJumps(next)
  }

  const handleCreateGroup = (dayDate: string) => {
    setGroupCreationInitialDay(dayDate)
    setShowGroupCreation(true)
  }

  const handleCreateGroupGlobal = () => {
    setGroupCreationInitialDay(undefined)
    setShowGroupCreation(true)
  }

  const handleGroupCreated = (title: string, day: string) => {
    const newJump: ManifestJump = {
      id: `group_${Date.now()}`,
      label: title,
      confirmed: false,
      files: [],
      processed: false,
      day
    }
    const next = [...jumps, newJump]
    updateJumps(next)
    setShowGroupCreation(false)
    setGroupCreationInitialDay(undefined)
  }

  const handleRemoveGroup = (jumpId: string) => {
    const next = jumps.filter((j) => j.id !== jumpId)
    updateJumps(next)
  }

  const handleGroupDateChange = (jumpId: string, day: string) => {
    const next = jumps.map((j) => (j.id === jumpId ? { ...j, day } : j))
    updateJumps(next)
  }

  const handleGroupTimeChange = (jumpId: string, anchorEpoch: number) => {
    setManifestError(null)
    manifestFetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'shift-jump-time', jumpId, anchorEpoch }
    })
  }

  useEffect(() => {
    mainRef.current?.setAttribute('data-hydrated', 'true')
  }, [])

  useEffect(() => {
    if (!manifestFetcher.data) return
    const parsed = manifestJumpsResponseSchema.safeParse(manifestFetcher.data)
    if (parsed.success) {
      queueMicrotask(() => {
        setJumps(parsed.data.jumps)
        setProcessingId(null)
        setUploadingId(null)
        setManifestError(null)
      })
      return
    }
    const parsedError = z
      .object({ success: z.literal(false), globalErrors: z.array(z.string()).optional() })
      .passthrough()
      .safeParse(manifestFetcher.data)
    if (parsedError.success) {
      queueMicrotask(() => {
        setManifestError(parsedError.data.globalErrors?.[0] ?? 'Request failed')
        setProcessingId(null)
        setUploadingId(null)
      })
      return
    }
    const parsedOk = z
      .object({ ok: z.literal(true) })
      .passthrough()
      .safeParse(manifestFetcher.data)
    if (parsedOk.success) {
      queueMicrotask(() => {
        setManifestError(null)
        setProcessingId(null)
        setUploadingId(null)
      })
      return
    }
    queueMicrotask(() => {
      setProcessingId(null)
      setUploadingId(null)
    })
  }, [manifestFetcher.data, setJumps])

  useEffect(() => {
    if (!scanFetcher.data) return
    queueMicrotask(() => {
      revalidator.revalidate()
    })
  }, [scanFetcher.data, revalidator])

  if (!manifest) {
    return (
      <main
        ref={mainRef}
        data-hydrated='false'
        className='min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100'>
        <Header
          nasConnected={nasConnected}
          defaultFolder={defaultFolder}
          onConnect={openConnectionDialog}
          onDisconnect={handleDisconnect}
          onChangeFolder={() => setShowFolderBrowser(true)}
          onScan={handleScan}
          scanning={scanning}
        />
        <EmptyManifest
          onScan={handleScan}
          scanning={scanning}
        />
        {effectiveShowConnection && (
          <ConnectionDialog
            onConnect={handleConnect}
            onCancel={closeConnectionDialog}
            error={nasError ?? undefined}
          />
        )}
        <NasFolderBrowser
          open={showFolderBrowser}
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
        onConnect={openConnectionDialog}
        onDisconnect={handleDisconnect}
        onChangeFolder={() => setShowFolderBrowser(true)}
        onScan={handleScan}
        scanning={scanning}
      />
      <div className='max-w-7xl mx-auto px-6 py-8'>
        <ReviewHeader
          jumpCount={jumps.length}
          fileCount={manifestFiles.length}
          compareIds={compareIds}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onCreateGroup={handleCreateGroupGlobal}
          onClearCompare={() => setCompareIds([])}
          onShowComparison={() => setShowComparison(true)}
        />
        {manifestError && (
          <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700'>
            {manifestError}
          </div>
        )}
        <Unassigned
          files={unassignedFiles}
          selection={selection}
          previewedPath={preview?.files[preview.index]?.path ?? null}
          viewMode={viewMode}
          hasSelection={selectedCount > 0}
          onSelect={handleSelect}
          onPreview={handlePreview}
          onDragStart={(e, groupId, paths) => handleDragStart(e, groupId, paths, selection)}
          onDragEnd={handleDragEnd}
        />
        <DayGroups
          groups={jumpsByDay}
          compareIds={compareIds}
          selection={selection}
          multiJumpPaths={multiJumpPaths}
          previewedPath={preview?.files[preview.index]?.path ?? null}
          dropHint={dropHint}
          viewMode={viewMode}
          hasSelection={selectedCount > 0}
          onCreateGroup={handleCreateGroup}
          onCompareToggle={handleCompareToggle}
          onSelect={handleSelect}
          onPreview={handlePreview}
          onDragStart={(e, groupId, paths) => handleDragStart(e, groupId, paths, selection)}
          onDragEnd={handleDragEnd}
          onDrop={(e, id) => handleDrop(e, id, jumps, updateJumps)}
          onDragOver={handleDragOver}
          onDragLeave={(_jumpId: string) => handleDragLeave()}
          onLabelChange={handleLabelChange}
          onProcess={handleProcess}
          processingId={processingId}
          onUpload={handleUpload}
          uploadingId={uploadingId}
          uploadProgress={uploadProgress}
          nasConnected={nasConnected}
          hasUploadFolder={!!defaultFolder}
          onRemoveGroup={handleRemoveGroup}
          onGroupDateChange={handleGroupDateChange}
          onGroupTimeChange={handleGroupTimeChange}
          onImportFile={handleImportFile}
          importingId={importingId}
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
            onMove={() => executeDrop('move', jumps, manifestFiles, updateJumps, clearSelection)}
            onCopy={() => executeDrop('copy', jumps, manifestFiles, updateJumps, clearSelection)}
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
            onCancel={closeConnectionDialog}
            error={nasError ?? undefined}
          />
        )}
        <NasFolderBrowser
          open={showFolderBrowser}
          onSelect={handleSelectFolder}
          onClose={() => setShowFolderBrowser(false)}
        />
        {showGroupCreation && (
          <GroupCreationDialog
            initialDay={groupCreationInitialDay}
            onCreate={handleGroupCreated}
            onCancel={() => {
              setShowGroupCreation(false)
              setGroupCreationInitialDay(undefined)
            }}
          />
        )}
      </div>
    </main>
  )
}

export { loader }

export default Home
