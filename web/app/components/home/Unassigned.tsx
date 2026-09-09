import type { ManifestFile, SelectionMap } from '../types'
import { FileGrid } from '../file-grid'
import { FileRow } from '../file-row'

type Props = {
  files: ManifestFile[]
  selection: SelectionMap
  previewedPath: string | null
  viewMode: 'list' | 'grid'
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
  onPreview: (file: ManifestFile, groupId: string) => void
  onDragStart: (e: React.DragEvent, groupId: string, paths: string[]) => void
  onDragEnd: () => void
}

const Unassigned = ({
  files,
  selection,
  previewedPath,
  viewMode,
  onSelect,
  onPreview,
  onDragStart,
  onDragEnd
}: Props) => {
  if (files.length === 0) return null
  return (
    <div className='mb-6 border border-amber-200 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm'>
      <div className='flex items-center gap-2 mb-3'>
        <div className='w-2 h-2 rounded-full bg-amber-500 animate-pulse' />
        <span className='text-sm font-semibold text-amber-800'>
          Unassigned files • {files.length}
        </span>
        <span className='text-xs text-amber-600'>— not in any jump, select to stage</span>
      </div>
      {viewMode === 'grid' ? (
        <FileGrid
          files={files}
          groupId='unassigned'
          selection={selection['unassigned'] ?? {}}
          previewedPath={previewedPath}
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
              groupId='unassigned'
              selected={!!selection['unassigned']?.[file.path]}
              isPreviewed={previewedPath === file.path}
              isInMultipleJumps={false}
              onSelect={onSelect}
              onPreview={onPreview}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export { Unassigned }
export type { Props }
