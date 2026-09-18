import { Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { plural } from './utils'

/* One choice, said in full: what it puts back and what it leaves alone */
const Choice = ({
  title,
  forgets,
  keeps,
  onChoose
}: {
  title: string
  forgets: string
  keeps: string
  onChoose: () => void
}) => (
  <button
    type='button'
    onClick={onChoose}
    className='flex flex-col gap-1 rounded-lg border border-line bg-ground px-3 py-2.5 text-left hover:border-accent hover:bg-accent-soft'>
    <b className='text-[13px] font-semibold text-ink'>{title}</b>
    <span className='text-[12px] text-ink-2'>
      <span className='text-changed'>✕</span> {forgets}
    </span>
    <span className='text-[12px] text-ink-2'>
      <span className='text-up'>✓</span> {keeps}
    </span>
  </button>
)

/* Fresh files put back, by as much as is wanted. Two mistakes are worth undoing at once: a time
   corrected wrongly, which costs only the times, and sorting that has gone wrong altogether, where
   starting over beats undoing. They are offered together, each saying what it forgets, so that which
   is which never has to be remembered — and choosing one is the asking first. */
const ResetFreshDialog = ({
  files,
  decided,
  onClose,
  onReset
}: {
  files: number
  /* how many of them have a trim, frame or turn set, which is what Everything would cost */
  decided: number
  onClose: () => void
  onReset: (what: 'times' | 'everything') => void
}) => (
  <Modal
    label='Reset Fresh files'
    title={`Reset the ${plural(files, 'file')} in Fresh files`}
    onClose={onClose}
    footer={
      <>
        <Spacer />
        <Mini onClick={onClose}>Close</Mini>
      </>
    }>
    <Choice
      title='Times only'
      forgets='the times that were corrected — every file goes back to the time its camera gave it'
      keeps='the jumps and their names, and every trim, frame and turn'
      onChoose={() => onReset('times')}
    />
    <Choice
      title='Everything, as just scanned'
      forgets={`the corrected times, the jumps made and named by hand, any copies, and every trim, frame and turn${
        decided > 0 ? ` — ${plural(decided, 'file')} ${decided === 1 ? 'has' : 'have'} one set` : ''
      }. The gap rule makes the jumps again`}
      keeps='nothing decided about these files'
      onChoose={() => onReset('everything')}
    />
    <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
      Either way, nothing filed to a dropzone or a passenger is touched, and no original file is.
    </p>
  </Modal>
)

export { ResetFreshDialog }
