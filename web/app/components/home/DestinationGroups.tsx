import { useRef, useState } from 'react'
import type { UploadProgressState } from '../../hooks/useUploadProgress'
import type { Destination, ManifestFile, ManifestGroup, SelectionMap } from '../types'
import { FileGrid } from '../file-grid'
import { FileRow } from '../file-row'
import { GroupCard } from '../group-card'

const SectionHeader = ({
  title,
  groupCount,
  fileCount,
  destinationName,
  processing,
  onAssignDestination,
  onFilesDrop,
  onEditDestination,
  onCreateGroup,
  onProcessLoneFiles
}: {
  title: string
  groupCount: number
  fileCount: number
  destinationName: string
  processing?: boolean
  onAssignDestination?: (groupId: string, destinationName: string) => void
  onFilesDrop?: (paths: string[], destinationName: string) => void
  onEditDestination?: (destinationName: string) => void
  onCreateGroup: () => void
  onProcessLoneFiles?: (destinationName: string) => void
}) => {
  const [dragOver, setDragOver] = useState(false)
  const counterRef = useRef(0)

  const isRelevantDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes('application/x-group') ||
    e.dataTransfer.types.includes('text/plain')

  const handleDragEnter = (e: React.DragEvent) => {
    if (!isRelevantDrag(e)) return
    counterRef.current++
    setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    if (!isRelevantDrag(e)) return
    counterRef.current--
    if (counterRef.current <= 0) {
      counterRef.current = 0
      setDragOver(false)
    }
  }
  const handleDragOver = (e: React.DragEvent) => {
    if (!isRelevantDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    counterRef.current = 0
    setDragOver(false)
    if (e.dataTransfer.types.includes('application/x-group')) {
      const groupId = e.dataTransfer.getData('application/x-group')
      if (groupId && onAssignDestination) {
        onAssignDestination(groupId, destinationName)
      }
    } else if (e.dataTransfer.types.includes('text/plain') && onFilesDrop) {
      const raw = e.dataTransfer.getData('text/plain')
      try {
        const paths = JSON.parse(raw) as string[]
        if (Array.isArray(paths) && paths.length > 0) {
          onFilesDrop(paths, destinationName)
        }
      } catch {}
    }
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`flex items-center gap-4 mb-4 px-2 py-1 rounded-lg transition-colors ${
        dragOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''
      }`}>
      <h2 className='text-sm font-bold text-gray-600 uppercase tracking-wider'>{title}</h2>
      {destinationName && onEditDestination && (
        <button
          type='button'
          onClick={() => onEditDestination(destinationName)}
          className='text-gray-400 hover:text-blue-600 transition-colors'
          title='Edit destination'>
          <svg
            className='w-3.5 h-3.5'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
            strokeWidth={2}>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
            />
          </svg>
        </button>
      )}
      <div className='h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent' />
      <span className='text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full'>
        {groupCount} group{groupCount !== 1 ? 's' : ''}
        {fileCount > 0 ? `, ${fileCount} file${fileCount !== 1 ? 's' : ''}` : ''}
      </span>
      <button
        type='button'
        onClick={onCreateGroup}
        className='px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100'>
        + Create Group
      </button>
      {fileCount > 0 && onProcessLoneFiles && (
        <button
          type='button'
          disabled={processing}
          onClick={() => onProcessLoneFiles(destinationName)}
          className='px-2 py-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed'>
          {processing ? (
            <span className='flex items-center gap-1'>
              <svg
                className='animate-spin h-3 w-3'
                viewBox='0 0 24 24'>
                <circle
                  className='opacity-25'
                  cx='12'
                  cy='12'
                  r='10'
                  stroke='currentColor'
                  strokeWidth='4'
                  fill='none'
                />
                <path
                  className='opacity-75'
                  fill='currentColor'
                  d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z'
                />
              </svg>
              Processing
            </span>
          ) : (
            'Process'
          )}
        </button>
      )}
    </div>
  )
}

type Props = {
  destinations: Destination[]
  groupsByDestination: { name: string; groups: ManifestGroup[]; files: ManifestFile[] }[]
  compareIds: string[]
  selection: SelectionMap
  multiGroupPaths: Set<string>
  previewedPath: string | null
  dropHint: { groupId: string; index: number } | null
  viewMode: 'list' | 'grid'
  hasSelection: boolean
  onCreateDestination: () => void
  onCreateGroup: (destinationName?: string) => void
  onCompareToggle: (groupId: string) => void
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
  onPreview: (file: ManifestFile, groupId: string) => void
  onDragStart: (e: React.DragEvent, groupId: string, paths: string[]) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent, targetGroupId: string) => void
  onDragOver: (e: React.DragEvent, targetGroupId: string) => void
  onDragLeave: (groupId: string) => void
  onLabelChange: (groupId: string, label: string) => void
  onProcess: (groupId: string) => void
  processingId: string | null
  onUpload: (groupId: string) => void
  uploadingId: string | null
  nasConnected: boolean
  hasUploadFolder: boolean
  onRemoveGroup: (groupId: string) => void
  onGroupDateChange: (groupId: string, day: string) => void
  onGroupTimeChange: (groupId: string, anchorEpoch: number) => void
  uploadProgress?: UploadProgressState | null
  onImportFile?: (groupId: string, files: File[]) => void
  importingId?: string | null
  onCreateMontage?: (groupId: string) => void
  hasKdenliveMap?: Map<string, boolean>
  onDestinationChange?: (groupId: string, destinationName: string) => void
  onAssignDestination?: (groupId: string, destinationName: string) => void
  onFilesDrop?: (paths: string[], destinationName: string) => void
  onEditDestination?: (destinationName: string) => void
  onProcessLoneFiles?: (destinationName: string) => void
  processingDestName?: string | null
}

const Destinations = ({
  destinations,
  groupsByDestination,
  compareIds,
  selection,
  multiGroupPaths,
  previewedPath,
  dropHint,
  viewMode,
  hasSelection,
  onCreateDestination,
  onCreateGroup,
  onCompareToggle,
  onSelect,
  onPreview,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
  onDragLeave,
  onLabelChange,
  onProcess,
  processingId,
  onUpload,
  uploadingId,
  nasConnected,
  hasUploadFolder,
  onRemoveGroup,
  onGroupDateChange,
  onGroupTimeChange,
  uploadProgress,
  onImportFile,
  importingId,
  onCreateMontage,
  hasKdenliveMap,
  onDestinationChange,
  onAssignDestination,
  onFilesDrop,
  onEditDestination,
  onProcessLoneFiles,
  processingDestName
}: Props) => {
  const unassigned = groupsByDestination.find((g) => g.name === 'Unassigned')
  const namedDestinations = groupsByDestination.filter((g) => g.name !== 'Unassigned')

  const renderLoneFiles = (files: ManifestFile[], sectionId: string) => {
    if (files.length === 0) return null
    return viewMode === 'grid' ? (
      <FileGrid
        files={files}
        groupId={sectionId}
        selection={selection[sectionId] ?? {}}
        previewedPath={previewedPath}
        hasSelection={hasSelection}
        onSelect={onSelect}
        onPreview={onPreview}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    ) : (
      <div className='space-y-1'>
        {files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            groupId={sectionId}
            selected={!!selection[sectionId]?.[file.path]}
            isPreviewed={previewedPath === file.path}
            isInMultipleGroups={false}
            hasSelection={hasSelection}
            onSelect={onSelect}
            onPreview={onPreview}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    )
  }

  return (
    <div className='space-y-8'>
      <div className='flex items-center gap-4 mb-4'>
        <button
          type='button'
          onClick={onCreateDestination}
          className='px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100'>
          + New Destination
        </button>
      </div>

      {namedDestinations.map(({ name, groups, files }) => (
        <section key={name}>
          <SectionHeader
            title={name}
            groupCount={groups.length}
            fileCount={files.length}
            destinationName={name}
            processing={processingDestName === name}
            onAssignDestination={onAssignDestination}
            onFilesDrop={onFilesDrop}
            onEditDestination={onEditDestination}
            onCreateGroup={() => onCreateGroup(name)}
            onProcessLoneFiles={onProcessLoneFiles}
          />
          <div className='space-y-4'>
            {groups.map((group) => (
              <div
                key={group.id}
                className={`relative rounded-xl transition-all duration-200 ${compareIds.includes(group.id) ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}`}>
                <div className='absolute top-3 right-3 z-10'>
                  <input
                    type='checkbox'
                    checked={compareIds.includes(group.id)}
                    onChange={() => onCompareToggle(group.id)}
                    className='h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                    title='Select for comparison'
                  />
                </div>
                <GroupCard
                  group={group}
                  selection={selection}
                  multiGroupPaths={multiGroupPaths}
                  previewedPath={previewedPath}
                  dropIndex={dropHint && dropHint.groupId === group.id ? dropHint.index : null}
                  viewMode={viewMode}
                  hasSelection={hasSelection}
                  onSelect={onSelect}
                  onPreview={onPreview}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onLabelChange={onLabelChange}
                  onProcess={onProcess}
                  processing={processingId === group.id}
                  onUpload={onUpload}
                  uploading={uploadingId === group.id}
                  nasConnected={nasConnected}
                  hasUploadFolder={hasUploadFolder}
                  onRemoveGroup={onRemoveGroup}
                  onGroupDateChange={onGroupDateChange}
                  onGroupTimeChange={onGroupTimeChange}
                  uploadProgress={uploadProgress}
                  onImportFile={onImportFile}
                  importing={importingId === group.id}
                  onCreateMontage={onCreateMontage}
                  hasKdenlive={hasKdenliveMap?.get(group.id) ?? false}
                  destinations={destinations}
                  onDestinationChange={onDestinationChange}
                />
              </div>
            ))}
            {files.length > 0 && (
              <div className='pl-4 border-l-2 border-gray-100'>
                <span className='text-xs text-gray-400 font-medium mb-2 block'>Lone files</span>
                {renderLoneFiles(files, `dest-${name}`)}
              </div>
            )}
          </div>
        </section>
      ))}

      {unassigned && (unassigned.groups.length > 0 || unassigned.files.length > 0) && (
        <section>
          <SectionHeader
            title='Unassigned'
            groupCount={unassigned.groups.length}
            fileCount={unassigned.files.length}
            destinationName=''
            onAssignDestination={onAssignDestination}
            onCreateGroup={() => onCreateGroup()}
          />
          <div className='space-y-4'>
            {unassigned.groups.map((group) => (
              <div
                key={group.id}
                className={`relative rounded-xl transition-all duration-200 ${compareIds.includes(group.id) ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}`}>
                <div className='absolute top-3 right-3 z-10'>
                  <input
                    type='checkbox'
                    checked={compareIds.includes(group.id)}
                    onChange={() => onCompareToggle(group.id)}
                    className='h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                    title='Select for comparison'
                  />
                </div>
                <GroupCard
                  group={group}
                  selection={selection}
                  multiGroupPaths={multiGroupPaths}
                  previewedPath={previewedPath}
                  dropIndex={dropHint && dropHint.groupId === group.id ? dropHint.index : null}
                  viewMode={viewMode}
                  hasSelection={hasSelection}
                  onSelect={onSelect}
                  onPreview={onPreview}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onLabelChange={onLabelChange}
                  onProcess={onProcess}
                  processing={processingId === group.id}
                  onUpload={onUpload}
                  uploading={uploadingId === group.id}
                  nasConnected={nasConnected}
                  hasUploadFolder={hasUploadFolder}
                  onRemoveGroup={onRemoveGroup}
                  onGroupDateChange={onGroupDateChange}
                  onGroupTimeChange={onGroupTimeChange}
                  uploadProgress={uploadProgress}
                  onImportFile={onImportFile}
                  importing={importingId === group.id}
                  onCreateMontage={onCreateMontage}
                  hasKdenlive={hasKdenliveMap?.get(group.id) ?? false}
                  destinations={destinations}
                  onDestinationChange={onDestinationChange}
                />
              </div>
            ))}
            {renderLoneFiles(unassigned.files, 'unassigned')}
          </div>
        </section>
      )}

      {destinations.length === 0 &&
        (!unassigned || (unassigned.groups.length === 0 && unassigned.files.length === 0)) && (
          <div className='text-center py-12'>
            <p className='text-gray-500 text-sm'>
              No destinations yet. Create one to organize your groups.
            </p>
          </div>
        )}
    </div>
  )
}

export { Destinations }
export type { Props }
