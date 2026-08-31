import { formatDayHeader, formatSequenceTime } from '../../lib/sequences'
import type { ManifestFile } from '../../lib/types'
import { JumpCard } from './jump-card'
import type { JumpDayGroup, SelectionMap } from './types'

type JumpDaySectionProps = {
  day: JumpDayGroup
  selection: SelectionMap
  isSelectMode: boolean
  compareIds: string[]
  multiJumpFiles: Set<string>
  isProxyGenerating?: boolean
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceId: string) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
  onPreview: (files: ManifestFile[], index: number, label: string) => void
  onReorder: (jumpId: string, filePaths: string[]) => void
  onCompareToggle: (jumpId: string) => void
  onDelete: (jumpId: string) => void
  onLabelSave: (jumpId: string, label: string) => void
  onUnprocess: (jumpId: string) => void
  onDeleteFile: (jumpId: string, filePath: string) => void
  onRenameFile: (filePath: string, newFilename: string) => void
  onShiftJump: (jumpId: string, offsetSeconds: number, paths: string[]) => void
  viewMode: 'list' | 'grid'
  onViewModeChange: (v: 'list' | 'grid') => void
}

const JumpDaySection = ({
  day,
  selection,
  isSelectMode,
  compareIds,
  multiJumpFiles,
  isProxyGenerating,
  onSelect,
  onDragStart,
  onDrop,
  onRemoveFiles,
  onPreview,
  onReorder,
  onCompareToggle,
  onDelete,
  onLabelSave,
  onUnprocess,
  onDeleteFile,
  onRenameFile,
  onShiftJump,
  viewMode,
  onViewModeChange
}: JumpDaySectionProps) => {
  const fileCount = day.jumps.reduce((s, j) => s + j.files.length, 0)
  const dayFiles = day.jumps.flatMap((j) => j.files)
  const dayTimes = dayFiles.map((f) => f.mtime)
  const dayStart = dayTimes.length ? Math.min(...dayTimes) : 0
  const dayEnd = dayTimes.length ? Math.max(...dayTimes) : 0
  return (
    <div className='mb-6'>
      <div className='flex items-baseline gap-2 px-1 py-2'>
        <span className='text-sm font-semibold text-gray-800 dark:text-gray-200'>
          {dayStart > 0 ? formatDayHeader(dayStart) : day.date}
        </span>
        <span className='text-xs text-gray-400'>
          {fileCount} files • {day.jumps.length} jumps
          {dayFiles.length > 0 && (
            <>
              {' '}
              • {formatSequenceTime(dayStart)}–{formatSequenceTime(dayEnd)}
            </>
          )}
        </span>
      </div>
      <div className='space-y-3'>
        {day.jumps.map((jump) => (
          <JumpCard
            key={jump.id}
            jump={jump}
            selection={selection[jump.id] ?? {}}
            isSelectMode={isSelectMode}
            isCompareSelected={compareIds.includes(jump.id)}
            multiJumpFiles={multiJumpFiles}
            isProxyGenerating={isProxyGenerating}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            onSelect={onSelect}
            onDrop={onDrop}
            onDragStart={onDragStart}
            onRemoveFiles={onRemoveFiles}
            onPreview={onPreview}
            onReorder={onReorder}
            onCompareToggle={onCompareToggle}
            onDelete={onDelete}
            onLabelSave={onLabelSave}
            onUnprocess={onUnprocess}
            onDeleteFile={onDeleteFile}
            onRenameFile={onRenameFile}
            onShiftJump={onShiftJump}
          />
        ))}
      </div>
    </div>
  )
}

export { JumpDaySection }
