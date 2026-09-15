import {
  dsmValidateSession,
  loadManifest,
  loadNasSession,
  manifestGroupSchema,
  tryAutoRefreshSession
} from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { useRevalidator } from 'react-router'
import { z } from 'zod'
import { ComparisonDialog } from '../components/comparison-dialog'
import { ConnectionDialog } from '../components/connection-dialog'
import { DropActionDialog } from '../components/drop-action-dialog'
import { GroupCreationDialog } from '../components/group-creation-dialog'
import { DestinationCreationDialog } from '../components/destination-creation-dialog'
import { Destinations } from '../components/home/DestinationGroups'
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
import { useGroups } from '../hooks/useJumps'
import { usePreview } from '../hooks/usePreview'
import { useSelection } from '../hooks/useSelection'
import { useUploadProgress } from '../hooks/useUploadProgress'
import { groupGroupsByDestination } from '../components/utils'
import type { Destination, ManifestGroup } from '../components/types'
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

const manifestGroupsResponseSchema = z
  .object({ groups: z.array(manifestGroupSchema) })
  .passthrough()

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
  const { groups, groupsByDay, setGroups, updateGroups } = useGroups(manifest?.groups ?? [])
  const [destinations, setDestinations] = useState<Destination[]>(manifest?.destinations ?? [])
  const manifestFiles = manifest?.files ?? []
  const filesInGroups = new Set(groups.flatMap((g) => g.files.map((f) => f.path)))
  const unassignedFiles = manifestFiles.filter((f) => !filesInGroups.has(f.path))
  const pathCounts = new Map<string, number>()
  for (const g of groups) {
    for (const f of g.files) pathCounts.set(f.path, (pathCounts.get(f.path) ?? 0) + 1)
  }
  const multiGroupPaths = new Set<string>()
  for (const [p, c] of pathCounts) if (c > 1) multiGroupPaths.add(p)
  const { selection, selectedCount, handleSelect, clearSelection } = useSelection(
    groups,
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
  } = usePreview(groups, unassignedFiles, updateGroups)
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
  const [groupingMode, setGroupingMode] = useState<'day' | 'destination'>('day')
  const [showGroupCreation, setShowGroupCreation] = useState(false)
  const [groupCreationInitialDay, setGroupCreationInitialDay] = useState<string | undefined>(
    undefined
  )
  const [showDestinationCreation, setShowDestinationCreation] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [hasKdenliveMap, setHasKdenliveMap] = useState<Map<string, boolean>>(new Map())
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
      actionArgs: { intent: 'merge-groups', leftId, rightId, anchorEpoch }
    })
  }
  const handleProcess = (groupId: string) => {
    setManifestError(null)
    setProcessingId(groupId)
    manifestFetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'process-group', groupId }
    })
  }
  const handleUpload = (groupId: string) => {
    setManifestError(null)
    if (!nasConnected) {
      openConnectionDialog()
      return
    }
    if (!defaultFolder) {
      setShowFolderBrowser(true)
      return
    }
    setUploadingId(groupId)
    manifestFetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'upload-group', groupId }
    })
  }
  const handleImportFile = async (groupId: string, files: File[]) => {
    setImportingId(groupId)
    try {
      const group = groups.find((g) => g.id === groupId)
      const day = group?.day
      for (const file of files) {
        const params = new URLSearchParams({ groupId, filename: file.name })
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
          setGroups(data.manifest.groups)
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

  const handleLabelChange = (groupId: string, label: string) => {
    const next = groups.map((g) => (g.id === groupId ? { ...g, label } : g))
    updateGroups(next)
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
    const newGroup: ManifestGroup = {
      id: `group_${Date.now()}`,
      label: title,
      confirmed: false,
      files: [],
      processed: false,
      day
    }
    const next = [...groups, newGroup]
    updateGroups(next)
    setShowGroupCreation(false)
    setGroupCreationInitialDay(undefined)
  }

  const handleRemoveGroup = (groupId: string) => {
    const next = groups.filter((g) => g.id !== groupId)
    updateGroups(next)
  }

  const handleGroupDateChange = (groupId: string, day: string) => {
    const next = groups.map((g) => (g.id === groupId ? { ...g, day } : g))
    updateGroups(next)
  }

  const handleGroupTimeChange = (groupId: string, anchorEpoch: number) => {
    setManifestError(null)
    manifestFetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'shift-group-time', groupId, anchorEpoch }
    })
  }

  const handleDestinationChange = (groupId: string, destinationName: string) => {
    const next = groups.map((g) =>
      g.id === groupId ? { ...g, destination: destinationName || undefined } : g
    )
    updateGroups(next)
  }

  const handleCreateDestination = () => {
    setShowDestinationCreation(true)
  }

  const handleDestinationCreated = (name: string, path?: string) => {
    const newDestination: Destination = { name, path }
    const next = [...destinations, newDestination]
    setDestinations(next)
    manifestFetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'save-groups', groups, destinations: next }
    })
    setShowDestinationCreation(false)
  }

  const handleCreateMontage = async (groupId: string) => {
    setManifestError(null)
    try {
      const res = await fetch(`/api/create-montage?groupId=${groupId}`)
      const data = await res.json()
      if (data.error) {
        setManifestError(data.error)
      }
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : 'Failed to create montage')
    }
  }

  useEffect(() => {
    mainRef.current?.setAttribute('data-hydrated', 'true')
  }, [])

  useEffect(() => {
    if (!manifestFetcher.data) return
    const parsed = manifestGroupsResponseSchema.safeParse(manifestFetcher.data)
    if (parsed.success) {
      queueMicrotask(() => {
        setGroups(parsed.data.groups)
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
  }, [manifestFetcher.data, setGroups])

  useEffect(() => {
    if (!scanFetcher.data) return
    queueMicrotask(() => {
      revalidator.revalidate()
    })
  }, [scanFetcher.data, revalidator])

  // Check for kdenlive files in processed groups
  useEffect(() => {
    const checkKdenlive = async () => {
      const newMap = new Map<string, boolean>()
      for (const group of groups) {
        if (group.processed) {
          try {
            const res = await fetch(`/api/create-montage?groupId=${group.id}`)
            const data = await res.json()
            newMap.set(group.id, data.error === 'Montage already created.')
          } catch {
            newMap.set(group.id, false)
          }
        }
      }
      setHasKdenliveMap(newMap)
    }
    checkKdenlive()
  }, [groups])

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
          groupCount={groups.length}
          fileCount={manifestFiles.length}
          compareIds={compareIds}
          viewMode={viewMode}
          groupingMode={groupingMode}
          onViewModeChange={setViewMode}
          onGroupingModeChange={setGroupingMode}
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
        {groupingMode === 'day' ? (
          <DayGroups
            groups={groupsByDay}
            compareIds={compareIds}
            selection={selection}
            multiGroupPaths={multiGroupPaths}
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
            onDrop={(e, id) => handleDrop(e, id, groups, updateGroups)}
            onDragOver={handleDragOver}
            onDragLeave={(_groupId: string) => handleDragLeave()}
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
            onCreateMontage={handleCreateMontage}
            hasKdenliveMap={hasKdenliveMap}
            destinations={destinations}
            onDestinationChange={handleDestinationChange}
          />
        ) : (
          <Destinations
            destinations={destinations}
            groupsByDestination={groupGroupsByDestination(groups, destinations)}
            compareIds={compareIds}
            selection={selection}
            multiGroupPaths={multiGroupPaths}
            previewedPath={preview?.files[preview.index]?.path ?? null}
            dropHint={dropHint}
            viewMode={viewMode}
            hasSelection={selectedCount > 0}
            onCreateDestination={handleCreateDestination}
            onCreateGroup={(destinationName) => {
              if (destinationName) {
                setGroupCreationInitialDay(undefined)
                setShowGroupCreation(true)
              } else {
                handleCreateGroupGlobal()
              }
            }}
            onCompareToggle={handleCompareToggle}
            onSelect={handleSelect}
            onPreview={handlePreview}
            onDragStart={(e, groupId, paths) => handleDragStart(e, groupId, paths, selection)}
            onDragEnd={handleDragEnd}
            onDrop={(e, id) => handleDrop(e, id, groups, updateGroups)}
            onDragOver={handleDragOver}
            onDragLeave={(_groupId: string) => handleDragLeave()}
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
            onCreateMontage={handleCreateMontage}
            hasKdenliveMap={hasKdenliveMap}
            onDestinationChange={handleDestinationChange}
          />
        )}
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
            onMove={() => executeDrop('move', groups, manifestFiles, updateGroups, clearSelection)}
            onCopy={() => executeDrop('copy', groups, manifestFiles, updateGroups, clearSelection)}
            onCancel={() => setDropDialog(null)}
          />
        )}
        {showComparison && compareIds.length === 2 && (
          <ComparisonDialog
            groups={groups}
            leftGroupId={compareIds[0]}
            rightGroupId={compareIds[1]}
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
        {showDestinationCreation && (
          <DestinationCreationDialog
            onCreate={handleDestinationCreated}
            onCancel={() => setShowDestinationCreation(false)}
          />
        )}
      </div>
    </main>
  )
}

export { loader }

export default Home
