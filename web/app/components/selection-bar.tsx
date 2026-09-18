/* what is picked, and how to pick more or let it go — shown only while something is */
const SelectionBar = ({ count, onClear }: { count: number; onClear: () => void }) => (
  <div className='fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-2.5 bg-ink px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] text-ground'>
    <b className='font-semibold'>
      {count} file{count > 1 ? 's' : ''} selected
    </b>
    <span className='text-[11.5px] opacity-60'>
      drag them onto a place in the menu · ⌘/ctrl-click to add · shift-click for a range · Delete
      sends them back
    </span>
    <span className='ml-auto flex gap-2'>
      <button
        type='button'
        onClick={onClear}
        className='rounded-[5px] border border-white/30 bg-white/10 px-2.5 py-1 text-[12px] hover:bg-white/20'>
        Clear (Esc)
      </button>
    </span>
  </div>
)

export { SelectionBar }
