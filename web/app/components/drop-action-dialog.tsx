const DropActionDialog = ({
  x,
  y,
  onMove,
  onCopy,
  onCancel
}: {
  x: number
  y: number
  onMove: () => void
  onCopy: () => void
  onCancel: () => void
}) => (
  <div
    data-drop-dialog='true'
    className='fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-2'
    style={{ left: x, top: y }}>
    <button
      type='button'
      data-action='move'
      onClick={onMove}
      className='px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700'>
      Move
    </button>
    <button
      type='button'
      data-action='copy'
      onClick={onCopy}
      className='px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200'>
      Copy
    </button>
    <button
      type='button'
      data-action='cancel'
      onClick={onCancel}
      className='px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700'>
      Cancel
    </button>
  </div>
)

export { DropActionDialog }
