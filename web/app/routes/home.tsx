import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest } from '@skydock/scripts'
import { useEffect, useRef } from 'react'
import { ComparisonDialog } from '../components/comparison-dialog'
import { ConnectionDialog } from '../components/connection-dialog'
import { DropActionDialog } from '../components/drop-action-dialog'
import { PreviewDrawer } from '../components/preview-drawer'
import { StagingTray } from '../components/staging-tray'
import { DayGroups } from '../components/home/DayGroups'
import { Header } from '../components/home/Header'
import { ReviewHeader } from '../components/home/ReviewHeader'
import { Unassigned } from '../components/home/Unassigned'
import { useCompare } from '../hooks/useCompare'
import { useDragDrop } from '../hooks/useDragDrop'
import { useEmail } from '../hooks/useEmail'
import { useJumps } from '../hooks/useJumps'
import { useNas } from '../hooks/useNas'
import { usePreview } from '../hooks/usePreview'
import { useSelection } from '../hooks/useSelection'
import type { Route } from './+types/home'

const loader = async ({}: Route.LoaderArgs) => {
  const outputDir = process.env.SKYDOCK_OUTPUT_DIR ?? '/workspace/output'
  let manifest = null
  try {
    manifest = loadManifest(`${outputDir}/manifest.json`)
  } catch {
    manifest = null
  }
  let emailTemplates: { subject: string; body: string } | null = null
  try {
    const subjectPath = path.join(process.cwd(), 'public/templates/tandem-email.subject.txt')
    const bodyPath = path.join(process.cwd(), 'public/templates/tandem-email.body.txt')
    const subject = fs.readFileSync(subjectPath, 'utf-8')
    const body = fs.readFileSync(bodyPath, 'utf-8')
    emailTemplates = { subject, body }
  } catch {
    emailTemplates = null
  }
  return { manifest, emailTemplates }
}

const Home = ({ loaderData }: Route.ComponentProps) => {
  const manifest = loaderData.manifest
  const initialEmailTemplates = loaderData.emailTemplates
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
  const {
    nasConnected,
    showConnectionDialog,
    nasError,
    processingId,
    uploadingId,
    handleConnect,
    handleDisconnect,
    handleMerge,
    handleProcess,
    handleUpload,
    setShowConnectionDialog,
    setNasError
  } = useNas(setJumps, setCompareIds, setShowComparison)
  const { mailPendingId, getMailUrls, handleMail, handleMarkSent, handleCancelMail } =
    useEmail(initialEmailTemplates)
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
          onConnect={() => setShowConnectionDialog(true)}
          onDisconnect={handleDisconnect}
        />
        <div className='max-w-7xl mx-auto px-6 py-8'>
          <h1 className='text-3xl font-bold text-gray-900'>No Manifest Found</h1>
          <p className='text-gray-500 mt-2'>Run a scan to generate the manifest.</p>
        </div>
        {showConnectionDialog && (
          <ConnectionDialog
            onConnect={handleConnect}
            onCancel={() => {
              setShowConnectionDialog(false)
              setNasError(null)
            }}
            error={nasError ?? undefined}
          />
        )}
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
        onConnect={() => setShowConnectionDialog(true)}
        onDisconnect={handleDisconnect}
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
          onMail={(id) => handleMail(id, jumps, getMailUrls)}
          mailtoUrl={(jump) => getMailUrls(jump)?.mailtoUrl ?? null}
          onMarkSent={(id) => handleMarkSent(id, jumps, setJumps, saveJumps)}
          onCancelMail={handleCancelMail}
          mailPendingId={mailPendingId}
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
        {showConnectionDialog && (
          <ConnectionDialog
            onConnect={handleConnect}
            onCancel={() => {
              setShowConnectionDialog(false)
              setNasError(null)
            }}
            error={nasError ?? undefined}
          />
        )}
      </div>
    </main>
  )
}

export { loader }

export default Home
