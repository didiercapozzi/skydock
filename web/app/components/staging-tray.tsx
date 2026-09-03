const StagingTray = ({
  selectedCount,
  onClear,
  onDragStart
}: {
  selectedCount: number
  onClear: () => void
  onDragStart: (e: React.DragEvent) => void
}) => (
  <div
    data-staging-tray='true'
    draggable
    onDragStart={onDragStart}
    className='fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur-sm p-4 shadow-2xl z-50'>
    <div className='max-w-7xl mx-auto flex items-center justify-between'>
      <div className='flex items-center gap-3'>
        <div className='w-2 h-2 rounded-full bg-blue-500 animate-pulse' />
        <span className='text-sm font-semibold text-gray-800'>
          {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
        </span>
      </div>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          onClick={onClear}
          className='px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'>
          Clear
        </button>
      </div>
    </div>
  </div>
)

export { StagingTray }
