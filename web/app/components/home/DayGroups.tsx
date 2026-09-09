import type { UploadProgressState } from '../../hooks/useUploadProgress'
import type { ManifestJump, SelectionMap } from '../types'
import { JumpCard } from '../jump-card'

type Props = {
  groups: { date: string; jumps: ManifestJump[] }[]
  compareIds: string[]
  selection: SelectionMap
  previewedPath: string | null
  dropHint: { jumpId: string; index: number } | null
  viewMode: 'list' | 'grid'
  hasSelection: boolean
  onCreateGroup: (dayDate: string) => void
  onCompareToggle: (jumpId: string) => void
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
  onPreview: (file: import('../types').ManifestFile, groupId: string) => void
  onDragStart: (e: React.DragEvent, groupId: string, paths: string[]) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onDragOver: (e: React.DragEvent, targetJumpId: string) => void
  onDragLeave: () => void
  onPassengerChange: (
    jumpId: string,
    passenger: import('../types').ManifestPassenger | undefined
  ) => void
  onLabelChange: (jumpId: string, label: string) => void
  onProcess: (jumpId: string) => void
  processingId: string | null
  onUpload: (jumpId: string) => void
  uploadingId: string | null
  onRemoveGroup: (jumpId: string) => void
  onGroupDateChange: (jumpId: string, day: string) => void
  uploadProgress?: UploadProgressState | null
}

const DayGroups = ({
  groups,
  compareIds,
  selection,
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
  onPassengerChange,
  onLabelChange,
  onProcess,
  processingId,
  onUpload,
  uploadingId,
  onRemoveGroup,
  onGroupDateChange,
  uploadProgress
}: Props) => {
  return (
    <div className='space-y-8'>
      {groups.map((day) => (
        <section key={day.date}>
          <div className='flex items-center gap-4 mb-4'>
            <h2 className='text-sm font-bold text-gray-600 uppercase tracking-wider'>{day.date}</h2>
            <div className='h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent' />
            <span className='text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full'>
              {day.jumps.length} jump{day.jumps.length !== 1 ? 's' : ''}
            </span>
            <button
              type='button'
              onClick={() => onCreateGroup(day.date)}
              className='px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100'>
              + Create Group
            </button>
          </div>
          <div className='space-y-4'>
            {day.jumps.map((jump) => (
              <div
                key={jump.id}
                className={`relative rounded-xl transition-all duration-200 ${compareIds.includes(jump.id) ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}`}>
                <div className='absolute top-3 right-3 z-10'>
                  <input
                    type='checkbox'
                    checked={compareIds.includes(jump.id)}
                    onChange={() => onCompareToggle(jump.id)}
                    className='h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                    title='Select for comparison'
                  />
                </div>
                <JumpCard
                  jump={jump}
                  selection={selection}
                  previewedPath={previewedPath}
                  dropIndex={dropHint && dropHint.jumpId === jump.id ? dropHint.index : null}
                  viewMode={viewMode}
                  hasSelection={hasSelection}
                  onSelect={onSelect}
                  onPreview={onPreview}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onPassengerChange={onPassengerChange}
                  onLabelChange={onLabelChange}
                  onProcess={onProcess}
                  processing={processingId === jump.id}
                  onUpload={onUpload}
                  uploading={uploadingId === jump.id}
                  onRemoveGroup={onRemoveGroup}
                  onGroupDateChange={onGroupDateChange}
                  uploadProgress={uploadProgress}
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
