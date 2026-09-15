import type { UploadProgressState } from '../../hooks/useUploadProgress'
import type { Destination, ManifestFile, ManifestGroup, SelectionMap } from '../types'
import { GroupCard } from '../group-card'

type Props = {
  groups: { date: string; groups: ManifestGroup[] }[]
  compareIds: string[]
  selection: SelectionMap
  multiGroupPaths: Set<string>
  previewedPath: string | null
  dropHint: { groupId: string; index: number } | null
  viewMode: 'list' | 'grid'
  hasSelection: boolean
  onCreateGroup: (dayDate: string) => void
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
  destinations?: Destination[]
  onDestinationChange?: (groupId: string, destinationName: string) => void
}

const DayGroups = ({
  groups,
  compareIds,
  selection,
  multiGroupPaths,
  previewedPath,
  dropHint,
  viewMode,
  hasSelection,
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
  destinations,
  onDestinationChange
}: Props) => {
  return (
    <div className='space-y-8'>
      {groups.map((day) => (
        <section key={day.date}>
          <div className='flex items-center gap-4 mb-4'>
            <h2 className='text-sm font-bold text-gray-600 uppercase tracking-wider'>{day.date}</h2>
            <div className='h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent' />
            <span className='text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full'>
              {day.groups.length} group{day.groups.length !== 1 ? 's' : ''}
            </span>
            <button
              type='button'
              onClick={() => onCreateGroup(day.date)}
              className='px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100'>
              + Create Group
            </button>
          </div>
          <div className='space-y-4'>
            {day.groups.map((group) => (
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
          </div>
        </section>
      ))}
    </div>
  )
}

export { DayGroups }
export type { Props }
